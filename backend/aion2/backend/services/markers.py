import asyncio
import hashlib
from typing import Any, Sequence
from uuid import UUID

from aiobotocore.client import AioBaseClient
from botocore.exceptions import ClientError
from fastapi_utils.cbv import cbv
from fastcrud import FastCRUD
from fastapi import APIRouter, Depends, Body, UploadFile, File, Form, FastAPI, Query, Path
from sqlalchemy import select, func, delete, update, or_
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from aion2.backend import models, schemas
from aion2.backend.config.manager import settings
from aion2.backend.interfaces.cache import clear_cache
from aion2.backend.utilities.bitset import ensure_bitset_size, set_bit
from aion2.backend.utilities.dependencies import get_db, get_current_superuser, get_current_user, get_category_from_path, \
    get_category_from_path, get_language_from_path, get_map_from_path, get_subtype_from_path, get_marker_from_path, \
    get_region_from_path, s3_client_upload_dependency
from aion2.backend.utilities.exceptions import BizError, ErrorCode
from aion2.backend.utilities.image import process_image

router = APIRouter(prefix="/maps/{map}", tags=["markers"])

marker_crud = FastCRUD(models.Marker)
marker_translation_crud = FastCRUD(models.MarkerTranslation)
marker_image_crud = FastCRUD(models.MarkerImage)
image_crud = FastCRUD(models.Image)


async def update_marker_contributor(db: AsyncSession, marker: models.Marker, user: models.User):
    result = await db.execute(
        select(models.MarkerContributor).
        where(models.MarkerContributor.marker_id == marker.id).
        where(models.MarkerContributor.user_id == user.id)
    )
    marker_contribution = result.unique().scalar_one_or_none()
    if marker_contribution is None:
        marker_contribution = models.MarkerContributor(marker_id=marker.id, user_id=user.id)
        db.add(marker_contribution)
        await db.commit()


@cbv(router)
class Markers:
    user: models.User = Depends(get_current_superuser)
    map_model: models.Map = Depends(get_map_from_path)
    db: AsyncSession = Depends(get_db)

    async def check_subtype_id(self, subtype_id: str | UUID | None) -> UUID | None:
        if subtype_id is None:
            return None
        try:
            subtype_model = await get_subtype_from_path(subtype_id, self.db)
            return subtype_model.id
        except:
            raise BizError(ErrorCode.SubTypeNotFoundError)

    async def check_region_id(self, region_id: str | UUID | None) -> UUID | None:
        if not region_id:
            return None
        try:
            region_model = await get_region_from_path(region_id, self.db)
            return region_model.id
        except:
            raise BizError(ErrorCode.RegionNotFoundError)

    async def get_next_index_for_subtype(self, subtype_id: UUID | None) -> int | None:
        if subtype_id is None:
            return None
        stmt = (
            select(
                func.coalesce(func.max(models.Marker.index_in_subtype), -1) + 1
            )
            .where(
                models.Marker.map_id == self.map_model.id,
                models.Marker.subtype_id == subtype_id,
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one()

    @router.post("/markers")
    async def create_marker(
        self,
        marker_data: schemas.MarkerCreate,
    ) -> schemas.StandardResponse[schemas.MarkerReadDetail]:
        subtype_id = await self.check_subtype_id(marker_data.subtype_id)
        index_in_subtype = await self.get_next_index_for_subtype(subtype_id)
        region_id = await self.check_region_id(marker_data.region_id)
        real_marker_data = schemas.MarkerCreateReal(
            **marker_data.model_dump(exclude={"subtype_id", "region_id"}),
            subtype_id=subtype_id,
            region_id=region_id,
            map_id=self.map_model.id,
            index_in_subtype=index_in_subtype,
        )
        marker_model = await marker_crud.create(self.db, real_marker_data)
        await update_marker_contributor(self.db, marker_model, self.user)
        await clear_cache(f"data:markers:{self.map_model.name}")
        return schemas.MarkerReadDetail.model_validate(marker_model).to_response()

    @router.get("/markers")
    async def list_markers(
        self,
        limit: int = Query(100),
        offset: int = Query(0),
        subtype: str = Query(""),
        region: str = Query(""),
        name: str = Query(""),
        x: int | None = Query(None),
        y: int | None = Query(None),
    ) -> schemas.StandardListResponse[schemas.MarkerReadDetail]:
        if subtype:
            subtype_model = await get_subtype_from_path(subtype, self.db)
        else:
            subtype_model = None
        if region:
            region_model = await get_region_from_path(region, self.db)
        else:
            region_model = None

        filter_dict: dict[str, Any] = { "map_id": self.map_model.id }
        query = select(models.Marker).where(models.Marker.map_id == self.map_model.id)
        if subtype_model is not None:
            query = query.where(models.Marker.subtype_id == subtype_model.id)
            filter_dict["subtype_id"] = subtype_model.id
        if region_model is not None:
            query = query.where(models.Marker.region_id == region_model.id)
            filter_dict["region_id"] = region_model.id
        if name:
            query = query.where(models.Marker.name.contains(name))
            filter_dict["name__contains"] = name
        if x is not None:
            query = query.where(models.Marker.x == x)
            filter_dict["x"] = x
        if y is not None:
            query = query.where(models.Marker.y == y)
            filter_dict["y"] = y

        query = query.limit(limit).offset(offset)

        count = await marker_crud.count(self.db, **filter_dict)
        result = await self.db.execute(query)
        markers = [schemas.MarkerReadDetail.model_validate(x) for x in result.unique().scalars()]
        return schemas.StandardListResponse(markers, count)

    @router.get("/markers/{marker}")
    async def get_marker(
        self,
        marker_model: models.Marker = Depends(get_marker_from_path)
    ) -> schemas.StandardResponse[schemas.MarkerReadDetail]:
        if marker_model.map_id != self.map_model.id:
            raise BizError(ErrorCode.MarkerNotFoundError)
        return schemas.MarkerReadDetail.model_validate(marker_model).to_response()

    @router.patch("/markers/{marker}")
    async def update_marker(
        self,
        marker_data: schemas.MarkerUpdate,
        marker_model: models.Marker = Depends(get_marker_from_path)
    ) -> schemas.StandardResponse[schemas.MarkerReadDetail]:
        if marker_model.map_id != self.map_model.id:
            raise BizError(ErrorCode.MarkerNotFoundError)
        subtype_id = await self.check_subtype_id(marker_data.subtype_id)
        region_id = await self.check_region_id(marker_data.region_id)
        update_dict = {
            **marker_data.model_dump(exclude={"subtype_id", "region_id"}),
            "subtype_id": subtype_id,
            "region_id": region_id,
        }
        if subtype_id != marker_model.subtype_id:
            update_dict["index_in_subtype"] = await self.get_next_index_for_subtype(subtype_id)
        await marker_crud.update(
            self.db, update_dict, id=marker_model.id,
        )
        await self.db.refresh(marker_model)
        await update_marker_contributor(self.db, marker_model, self.user)
        await clear_cache(f"data:markers:{self.map_model.name}")
        return schemas.MarkerReadDetail.model_validate(marker_model).to_response()

    @router.delete("/markers/{marker}")
    async def delete_marker(
        self,
        marker_model: models.Marker = Depends(get_marker_from_path)
    ) -> schemas.StandardResponse[schemas.Empty]:
        if marker_model.map_id != self.map_model.id:
            raise BizError(ErrorCode.MarkerNotFoundError)
        await self.db.delete(marker_model)
        await self.db.commit()
        await clear_cache(f"data:markers:{self.map_model.name}")
        return schemas.StandardResponse()

@cbv(router)
class UserMarkerProgress:
    user: models.User = Depends(get_current_user)
    map_model: models.Marker = Depends(get_map_from_path)
    db: AsyncSession = Depends(get_db)

    @router.get("/marker_progress")
    async def list_user_marker_progress(
        self,
    ) -> schemas.StandardListResponse[schemas.UserMarkerProgressRead]:
        stmt = (
            select(models.UserMarkerProgress).
            where(models.UserMarkerProgress.user_id == self.user.id).
            where(models.UserMarkerProgress.map_id == self.map_model.id)
        )
        result = await self.db.execute(stmt)
        # user_marker_progress_models = result.scalars().all()
        user_marker_progress_models = [
            schemas.UserMarkerProgressRead.model_validate(x)
            for x in result.scalars()
        ]
        return schemas.StandardListResponse(user_marker_progress_models)

    @router.put("/markers/{marker}/progress")
    async def update_user_marker_progress_by_marker(
        self,
        marker_data: schemas.UserMarkerProgressUpdateBit,
        marker_model: models.Marker = Depends(get_marker_from_path),
    ) -> schemas.StandardResponse[schemas.Empty]:
        if marker_model.map_id != self.map_model.id:
            raise BizError(ErrorCode.MarkerNotFoundError)
        if marker_model.subtype_id is None or marker_model.subtype.can_complete is False:
            raise BizError(ErrorCode.SubTypeNotFoundError)
        stmt = (
            select(models.UserMarkerProgress)
            .where(
                models.UserMarkerProgress.user_id == self.user.id,
                models.UserMarkerProgress.map_id == self.map_model.id,
                models.UserMarkerProgress.subtype_id == marker_model.subtype_id,
            )
            .with_for_update()  # optional, protects against concurrent updates
        )
        res = await self.db.execute(stmt)
        progress_model = res.unique().scalar_one_or_none()
        required_bits = marker_model.index_in_subtype + 1
        if progress_model is None:
            bitset = ensure_bitset_size(None, required_bits)
            progress_model = models.UserMarkerProgress(
                user_id=self.user.id,
                map_id=self.map_model.id,
                subtype_id=marker_model.subtype_id,
                bitset=bitset,
            )
            self.db.add(progress_model)
            await self.db.flush()
        else:
            progress_model.bitset = ensure_bitset_size(progress_model.bitset, required_bits)
        progress_model.bitset = set_bit(progress_model.bitset, marker_model.index_in_subtype, marker_data.completed)
        await self.db.commit()
        return schemas.StandardResponse()

    @router.put("/subtypes/{subtype}/progress")
    async def update_user_marker_progress_by_subtype(
        self,
        subtype_data: schemas.UserMarkerProgressUpdateAll,
        subtype_model: models.Subtype = Depends(get_subtype_from_path),
    ) -> schemas.StandardResponse[schemas.UserMarkerProgressRead]:
        max_idx_stmt = (
            select(func.max(models.Marker.index_in_subtype))
            .where(
                models.Marker.map_id == self.map_model.id,
                models.Marker.subtype_id == subtype_model.id,
            )
        )
        max_idx_res = await self.db.execute(max_idx_stmt)
        max_index = max_idx_res.scalar_one()
        if max_index is None:
            raise BizError(ErrorCode.SubTypeNotFoundError)
        max_count = max_index + 1
        incoming_bit_count = len(subtype_data.bitset) * 8
        if incoming_bit_count > max_count:
            raise BizError(ErrorCode.BitSetTooLongError)

        stmt = (
            select(models.UserMarkerProgress)
            .where(
                models.UserMarkerProgress.user_id == self.user.id,
                models.UserMarkerProgress.map_id == self.map_model.id,
                models.UserMarkerProgress.subtype_id == subtype_model.id,
            )
        )
        res = await self.db.execute(stmt)
        progress_model = res.unique().scalar_one_or_none()

        if progress_model is None:
            progress_model = models.UserMarkerProgress(
                user_id=self.user.id,
                map_id=self.map_model.id,
                subtype_id=subtype_model.id,
                bitset=subtype_data.bitset,
            )
            self.db.add(progress_model)
        else:
            progress_model.bitset = subtype_data.bitset
        await self.db.commit()
        await self.db.refresh(progress_model)
        return schemas.UserMarkerProgressRead.model_validate(progress_model).to_response()



@cbv(router)
class MarkerImages:
    user: models.User = Depends(get_current_superuser)
    map_model: models.Map = Depends(get_map_from_path)
    db: AsyncSession = Depends(get_db)

    async def db_list_marker_images(self, marker_model: models.Marker):
        result = await self.db.execute(
            select(models.MarkerImage).
            where(models.MarkerImage.marker_id == marker_model.id).
            order_by(models.MarkerImage.order)
        )
        return result.unique().scalars().all()

    async def db_count_marker_images_by_image_id(self, image_id: UUID) -> int:
        result = await self.db.execute(
            select(func.count()).
            select_from(models.MarkerImage).
            where(models.MarkerImage.image_id == image_id)
        )
        return result.scalar()


    @router.get("/markers/{marker}/images")
    async def list_marker_images(
        self,
        marker_model: models.Marker = Depends(get_marker_from_path),
    ) -> schemas.StandardListResponse[schemas.MarkerImageReadDetail]:
        if marker_model.map_id != self.map_model.id:
            raise BizError(ErrorCode.MarkerNotFoundError)
        marker_image_models = await self.db_list_marker_images(marker_model)
        marker_images = [schemas.MarkerImageReadDetail.model_validate(x) for x in marker_image_models]
        return schemas.StandardListResponse(marker_images)


    @router.put("/markers/{marker}/images")
    async def upload_marker_image(
        self,
        marker_model: models.Marker = Depends(get_marker_from_path),
        file: UploadFile = File(...),
        s3_client: AioBaseClient = Depends(s3_client_upload_dependency),
    ) -> schemas.StandardResponse[schemas.MarkerImageReadDetail]:
        if marker_model.map_id != self.map_model.id:
            raise BizError(ErrorCode.MarkerNotFoundError)
        image_data = await asyncio.to_thread(process_image, file.file)
        s3_key = f"markers_images/{image_data['digest']}"
        try:
            for size in ("full", "normal", "small"):
                await s3_client.put_object(
                    Bucket=settings.S3_BUCKET,
                    Key=f"{s3_key}.{size}.webp",
                    Body=image_data[size],
                    ContentType="image/webp",
                )

        except ClientError as e:
            raise BizError(ErrorCode.S3UploadError, str(e))

        # create image in db
        result = await self.db.execute(
            select(models.Image).
            where(models.Image.s3_key == s3_key)
        )
        image_model = result.unique().scalar_one_or_none()
        if image_model is None:
            image_data = schemas.ImageCreate(
                s3_key=s3_key,
                height=image_data["height"],
                width=image_data["width"],
            )
            image_model = await image_crud.create(self.db, image_data)

        # create marker model in db
        marker_image_models = await self.db_list_marker_images(marker_model)
        marker_image_model = None
        for x in marker_image_models:
            if x.image_id == image_model.id:
                marker_image_model = x
                break
        if marker_image_model is None:
            marker_image_data = schemas.MarkerImageCreate(
                marker_id=marker_model.id,
                image_id=image_model.id,
                order=len(marker_image_models),
            )
            marker_image_model = await marker_image_crud.create(self.db, marker_image_data)

        await update_marker_contributor(self.db, marker_model, self.user)
        await clear_cache(f"data:markers:{self.map_model.name}")
        return schemas.MarkerImageReadDetail.model_validate(marker_image_model).to_response()

    @router.delete("/markers/{marker}/images/{image}")
    async def delete_marker_image(
        self,
        marker_model: models.Marker = Depends(get_marker_from_path),
        marker_image_id: UUID = Path(..., alias="image"),
        s3_client: AioBaseClient = Depends(s3_client_upload_dependency)
    ) -> schemas.StandardResponse[schemas.Empty]:
        # find the marker_image
        marker_image: models.MarkerImage = await self.db.scalar(
            select(models.MarkerImage).where(
                models.MarkerImage.marker_id == marker_model.id,
                models.MarkerImage.id == marker_image_id,
            )
        )
        if marker_image is None:
            raise BizError(ErrorCode.MarkerImageNotFoundError)

        # delete the marker_image
        order = marker_image.order
        image_id = marker_image.image_id
        image_s3_key = marker_image.image.s3_key
        await self.db.delete(marker_image)

        # shift down orders for all later images of the same marker
        await self.db.execute(
            update(models.MarkerImage)
            .where(
                models.MarkerImage.marker_id == marker_model.id,
                models.MarkerImage.order > order,
            )
            .values(order=models.MarkerImage.order - 1)
        )

        # delete the image if no other marker_image uses this image
        count = await self.db.scalar(
            select(func.count())
            .select_from(models.MarkerImage)
            .where(models.MarkerImage.image_id == image_id)
        )
        await self.db.commit()
        if count == 0:
            await self.db.execute(
                delete(models.Image).where(models.Image.id == image_id)
            )
            try:
                for size in ("full", "normal", "small"):
                    await s3_client.delete_object(
                        Bucket=settings.S3_BUCKET,
                        Key=f"{image_s3_key}.{size}.webp",
                    )
            except ClientError as e:
                raise BizError(ErrorCode.S3UploadError, str(e))
            await self.db.commit()
        await clear_cache(f"data:markers:{self.map_model.name}")
        return schemas.StandardResponse()


@cbv(router)
class MarkerComment:
    user: models.User = Depends(get_current_user)
    map_model: models.Map = Depends(get_map_from_path)
    marker_model: models.Marker = Depends(get_marker_from_path)
    db: AsyncSession = Depends(get_db)

    @router.get("/markers/{marker}/comments")
    async def list_marker_comments(
        self,
    ) -> schemas.StandardListResponse[schemas.CommentRead]:
        if self.marker_model.map_id != self.map_model.id:
            raise BizError(ErrorCode.MarkerNotFoundError)

        stmt = (
            select(models.Comment).
            where(models.Comment.target_type == schemas.CommentTargetType.marker).
            where(models.Comment.target_id == self.marker_model.id)
        )
        if not self.user.is_superuser:
            stmt = stmt.where(or_(
                models.Comment.verified.is_(True),
                models.Comment.user_id == self.user.id,
            ))

        result = await self.db.execute(stmt)
        comments = [schemas.CommentRead.model_validate(x) for x in result.unique().scalars()]
        return schemas.StandardListResponse(comments)

    @router.post("/markers/{marker}/comments")
    async def create_marker_comment(
        self,
        comment_data: schemas.CommentCreate,
    ) -> schemas.StandardResponse[schemas.CommentRead]:
        if self.marker_model.map_id != self.map_model.id:
            raise BizError(ErrorCode.MarkerNotFoundError)

        if comment_data.reply_to_id is None:
            reply_to_id = None
            root_id = None
        else:
            result = await self.db.execute(
                select(models.Comment).where(models.Comment.id == comment_data.reply_to_id)
            )
            reply_to_comment: models.Comment | None = result.unique().scalar_one_or_none()
            if reply_to_comment is None:
                raise BizError(ErrorCode.MarkerNotFoundError)
            reply_to_id = reply_to_comment.id
            if reply_to_comment.root_id is None:
                root_id = reply_to_id
            else:
                root_id = reply_to_comment.root_id

        verified = self.user.is_superuser
        comment = models.Comment(
            user_id=self.user.id,
            target_type=schemas.CommentTargetType.marker,
            target_id=self.marker_model.id,
            content=comment_data.content,
            verified=verified,
            root_id=root_id,
            reply_to_id=reply_to_id
        )
        self.db.add(comment)
        await self.db.commit()
        await self.db.refresh(comment)
        return schemas.CommentRead.model_validate(comment).to_response()






@cbv(router)
class MarkerTranslations:
    user: models.User = Depends(get_current_superuser)
    map_model: models.Map = Depends(get_map_from_path)
    marker_model: models.Marker = Depends(get_marker_from_path)
    language_model: models.Language = Depends(get_language_from_path)
    db: AsyncSession = Depends(get_db)

    async def get_translation_model(self) -> models.MarkerTranslation:
        if self.marker_model.map_id != self.map_model.id:
            raise BizError(ErrorCode.MarkerNotFoundError)
        result = await self.db.execute(select(models.MarkerTranslation).filter(
            models.MarkerTranslation.language_id == self.language_model.id,
            models.MarkerTranslation.marker_id == self.marker_model.id,
        ))
        return result.unique().scalar_one_or_none()

    @router.patch("/markers/{marker}/translations/{language}")
    async def update_marker_translation(
        self,
        translation_data: schemas.MarkerTranslationUpdate,
    ) -> schemas.StandardResponse[schemas.MarkerTranslationRead]:
        translation_model = await self.get_translation_model()
        if translation_model is None:
            translation_model = models.MarkerTranslation(
                marker_id=self.marker_model.id,
                language_id=self.language_model.id,
                name=translation_data.name or "",
                description=translation_data.description or "",
            )
        else:
            if translation_data.name is not None:
                translation_model.name = translation_data.name
            if translation_data.description is not None:
                translation_model.description = translation_data.description

        self.db.add(translation_model)
        await self.db.commit()
        await self.db.refresh(translation_model)
        await update_marker_contributor(self.db, self.marker_model, self.user)
        await clear_cache(f"locales:{self.language_model.language_code}:markers:{self.map_model.name}")
        return schemas.MarkerTranslationRead.model_validate(translation_model).to_response()

    @router.delete("/markers/{marker}/translations/{language}")
    async def delete_marker_translation(self) -> schemas.StandardResponse[schemas.Empty]:
        translation_model = await self.get_translation_model()
        if translation_model is not None:
            await self.db.delete(translation_model)
            await self.db.commit()
            await clear_cache(f"locales:{self.language_model.language_code}:markers:{self.map_model.name}")
        return schemas.StandardResponse()
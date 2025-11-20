from uuid import UUID

from fastapi_utils.cbv import cbv
from fastcrud import FastCRUD
from fastapi import APIRouter, Depends, Body, UploadFile, File, Form, FastAPI, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger

from aion2.backend import models, schemas
from aion2.backend.utilities.dependencies import get_db, get_current_superuser, get_category_from_path, \
    get_category_from_path, get_language_from_path, get_map_from_path, get_subtype_from_path, get_marker_from_path, \
    get_region_from_path
from aion2.backend.utilities.exceptions import BizError, ErrorCode

router = APIRouter(prefix="/maps/{map}/markers", tags=["markers"])

marker_crud = FastCRUD(models.Marker)
marker_translation_crud = FastCRUD(models.MarkerTranslation)

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

    @router.post("/")
    async def create_marker(
        self,
        marker_data: schemas.MarkerCreate,
    ) -> schemas.StandardResponse[schemas.MarkerReadDetail]:
        marker_data.subtype_id = await self.check_subtype_id(marker_data.subtype_id)
        marker_data.region_id = await self.check_region_id(marker_data.region_id)
        marker_data.map_id = self.map_model.id
        marker_model = await marker_crud.create(self.db, marker_data)
        await update_marker_contributor(self.db, marker_model, self.user)
        return schemas.MarkerReadDetail.model_validate(marker_model).to_response()

    @router.get("/")
    async def list_markers(
        self,
        limit: int = Query(100),
        offset: int = Query(0),
        subtype: str = Query(""),
        name: str = Query(""),
        x: int | None = Query(None),
        y: int | None = Query(None),
    ) -> schemas.StandardListResponse[schemas.MarkerReadDetail]:
        if subtype:
            subtype_model = await get_subtype_from_path(subtype, self.db)
        else:
            subtype_model = None

        filter_dict = { "map_id": self.map_model.id }
        query = select(models.Marker).where(models.Marker.map_id == self.map_model.id)
        if subtype_model is not None:
            query = query.where(models.Marker.subtype_id == subtype_model.id)
            filter_dict["subtype_id"] = subtype_model.id
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

    @router.patch("/{marker}")
    async def update_marker(
        self,
        marker_data: schemas.MarkerUpdate,
        marker_model: models.Marker = Depends(get_marker_from_path)
    ) -> schemas.StandardResponse[schemas.MarkerReadDetail]:
        if marker_model.map_id != self.map_model.id:
            raise BizError(ErrorCode.MarkerNotFoundError)
        marker_data.subtype_id = await self.check_subtype_id(marker_data.subtype_id)
        marker_data.region_id = await self.check_region_id(marker_data.region_id)
        await marker_crud.update(
            self.db, marker_data, id=marker_model.id,
        )
        await self.db.refresh(marker_model)
        await update_marker_contributor(self.db, marker_model, self.user)
        return schemas.MarkerReadDetail.model_validate(marker_model).to_response()

    @router.delete("/{marker}")
    async def delete_marker(
        self,
        marker_model: models.Marker = Depends(get_marker_from_path)
    )-> schemas.StandardResponse[schemas.Empty]:
        if marker_model.map_id != self.map_model.id:
            raise BizError(ErrorCode.MarkerNotFoundError)
        await self.db.delete(marker_model)
        await self.db.commit()
        return schemas.StandardResponse()


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

    @router.patch("/{marker}/translations/{language}")
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
        return schemas.MarkerTranslationRead.model_validate(translation_model).to_response()

    @router.delete("/{marker}/translations/{language}")
    async def delete_marker_translation(self) -> schemas.StandardResponse[schemas.Empty]:
        translation_model = await self.get_translation_model()
        if translation_model is not None:
            await self.db.delete(translation_model)
            await self.db.commit()
        return schemas.StandardResponse()
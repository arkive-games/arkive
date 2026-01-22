import uuid
from datetime import date
from typing import Optional
from fastapi_utils.cbv import cbv
from fastcrud import FastCRUD
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aion2.backend import models, schemas
from aion2.backend.utilities.dependencies import get_db, get_current_superuser, get_abyss_artifact_from_path, \
    get_map_from_path
from aion2.backend.utilities.exceptions import BizError, ErrorCode

router = APIRouter(prefix="/maps/{map}/artifacts", tags=["abyss_artifacts"])

abyss_artifact_crud = FastCRUD(models.AbyssArtifact)
abyss_artifact_state_crud = FastCRUD(models.AbyssArtifactState)

@cbv(router)
class AbyssArtifacts:
    user: models.User = Depends(get_current_superuser)
    db: AsyncSession = Depends(get_db)
    map_model: models.Map = Depends(get_map_from_path)

    @router.post("/")
    async def create_abyss_artifact(
        self,
        artifact_data: schemas.AbyssArtifactCreate,
    ) -> schemas.StandardResponse[schemas.AbyssArtifactReadDetail]:
        result = await self.db.execute(
            select(models.Marker).where(
                models.Marker.id == artifact_data.marker_id,
                models.Marker.map_id == self.map_model.id
            )
        )
        marker = result.unique().scalar_one_or_none()
        if marker is None:
            raise BizError(ErrorCode.MarkerNotFoundError)
        artifact_model = await abyss_artifact_crud.create(self.db, artifact_data)
        return schemas.AbyssArtifactReadDetail.model_validate(artifact_model).to_response()

    @router.get("/")
    async def get_abyss_artifacts(self) -> schemas.StandardListResponse[schemas.AbyssArtifactReadDetail]:
        result = await self.db.execute(
            select(models.AbyssArtifact).
            where(models.AbyssArtifact.marker.has(models.Marker.map_id == self.map_model.id))
        )
        artifacts = [schemas.AbyssArtifactReadDetail.model_validate(x) for x in result.unique().scalars()]
        return schemas.StandardListResponse(artifacts)

    @router.get("/{abyss_artifact}")
    async def get_abyss_artifact(
        self,
        artifact_model: models.AbyssArtifact = Depends(get_abyss_artifact_from_path)
    ) -> schemas.StandardResponse[schemas.AbyssArtifactReadDetail]:
        if artifact_model.marker.map_id != self.map_model.id:
            raise BizError(ErrorCode.MapNotFoundError)
        return schemas.AbyssArtifactReadDetail.model_validate(artifact_model).to_response()

    @router.patch("/{abyss_artifact}")
    async def update_abyss_artifact(
        self,
        artifact_data: schemas.AbyssArtifactUpdate,
        artifact_model: models.AbyssArtifact = Depends(get_abyss_artifact_from_path),
    ) -> schemas.StandardResponse[schemas.AbyssArtifactReadDetail]:
        if artifact_model.marker.map_id != self.map_model.id:
            raise BizError(ErrorCode.MapNotFoundError)
        await abyss_artifact_crud.update(
            self.db, artifact_data, id=artifact_model.id,
        )
        await self.db.refresh(artifact_model)
        return schemas.AbyssArtifactReadDetail.model_validate(artifact_model).to_response()

    @router.delete("/{abyss_artifact}")
    async def delete_abyss_artifact(
        self,
        artifact_model: models.AbyssArtifact = Depends(get_abyss_artifact_from_path),
    ) -> schemas.StandardResponse[schemas.Empty]:
        if artifact_model.marker.map_id != self.map_model.id:
            raise BizError(ErrorCode.MapNotFoundError)
        await self.db.delete(artifact_model)
        await self.db.commit()
        return schemas.StandardResponse()

@cbv(router)
class AbyssArtifactStates:
    user: models.User = Depends(get_current_superuser)
    db: AsyncSession = Depends(get_db)
    map_model: models.Map = Depends(get_map_from_path)

    @router.post("/states")
    async def upsert_abyss_artifact_state(
        self,
        state_data: schemas.AbyssArtifactStateCreate,
    ) -> schemas.StandardResponse[schemas.AbyssArtifactStateRead]:
        result = await self.db.execute(
            select(models.AbyssArtifact).where(
                models.AbyssArtifact.id == state_data.abyss_artifact_id,
                models.AbyssArtifact.marker.has(models.Marker.map_id == self.map_model.id)
            )
        )
        artifact = result.unique().scalar_one_or_none()
        if artifact is None:
            raise BizError(ErrorCode.AbyssArtifactNotFoundError)

        result = await self.db.execute(select(models.ServerMatching).where(models.ServerMatching.id == state_data.server_matching_id))
        matching = result.unique().scalar_one_or_none()
        if matching is None:
            raise BizError(ErrorCode.ServerMatchingNotFoundError)

        result = await self.db.execute(
            select(models.AbyssArtifactState).where(
                models.AbyssArtifactState.abyss_artifact_id == state_data.abyss_artifact_id,
                models.AbyssArtifactState.server_matching_id == state_data.server_matching_id,
                models.AbyssArtifactState.date == state_data.date,
            )
        )
        state_model = result.unique().scalar_one_or_none()

        if state_model:
            state_model.state = state_data.state
        else:
            state_model = models.AbyssArtifactState(**state_data.model_dump())
            self.db.add(state_model)

        await self.db.commit()
        await self.db.refresh(state_model)
        return schemas.AbyssArtifactStateRead.model_validate(state_model).to_response()

    @router.get("/states")
    async def get_abyss_artifact_states(
        self,
        abyss_artifact_id: Optional[uuid.UUID] = None,
        server_matching_id: Optional[uuid.UUID] = None,
        _date: Optional[date] = Query(None, alias="date"),
    ) -> schemas.StandardListResponse[schemas.AbyssArtifactStateReadDetail]:
        query = select(models.AbyssArtifactState).where(
            models.AbyssArtifactState.abyss_artifact.has(
                models.AbyssArtifact.marker.has(models.Marker.map_id == self.map_model.id)
            )
        )

        if abyss_artifact_id:
            query = query.where(
                models.AbyssArtifactState.abyss_artifact_id == abyss_artifact_id,
            )
        if server_matching_id:
            query = query.where(models.AbyssArtifactState.server_matching_id == server_matching_id)
        if _date:
            query = query.where(models.AbyssArtifactState.date == _date)

        result = await self.db.execute(query)
        states = [schemas.AbyssArtifactStateReadDetail.model_validate(x) for x in result.unique().scalars()]
        return schemas.StandardListResponse(states)

    @router.delete("/states")
    async def delete_abyss_artifact_state(
        self,
        abyss_artifact_id: uuid.UUID,
        server_matching_id: uuid.UUID,
        _date: date = Query(..., alias="date"),
    ) -> schemas.StandardResponse[schemas.Empty]:
        result = await self.db.execute(
            select(models.AbyssArtifactState).where(
                models.AbyssArtifactState.abyss_artifact_id == abyss_artifact_id,
                models.AbyssArtifactState.server_matching_id == server_matching_id,
                models.AbyssArtifactState.date == _date,
                models.AbyssArtifactState.abyss_artifact.has(
                    models.AbyssArtifact.marker.has(models.Marker.map_id == self.map_model.id)
                )
            )
        )
        state_model = result.unique().scalar_one_or_none()
        if state_model is None:
            raise BizError(ErrorCode.AbyssArtifactStateNotFoundError)

        await self.db.delete(state_model)
        await self.db.commit()
        return schemas.StandardResponse()

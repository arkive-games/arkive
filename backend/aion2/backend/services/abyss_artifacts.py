import uuid
from datetime import datetime
from typing import Optional, List
from fastapi_utils.cbv import cbv
from fastcrud import FastCRUD
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aion2.backend import models, schemas
from aion2.backend.utilities.dependencies import get_db, get_current_superuser, get_abyss_artifact_from_path, \
    get_map_from_path, get_season_from_path, get_abyss_artifact_map_state_from_path
from aion2.backend.utilities.exceptions import BizError, ErrorCode

router = APIRouter(prefix="/seasons/{season}/maps/{map}/artifacts", tags=["abyss_artifacts_states"])
artifacts_router = APIRouter(prefix="/maps/{map}/artifacts", tags=["abyss_artifacts"])

abyss_artifact_crud = FastCRUD(models.AbyssArtifact)
abyss_artifact_map_state_crud = FastCRUD(models.AbyssArtifactMapState)

@cbv(router)
class AbyssArtifactStates:
    db: AsyncSession = Depends(get_db)
    map_model: models.Map = Depends(get_map_from_path)
    season_model: models.Season = Depends(get_season_from_path)


    @router.post("/states")
    async def create_abyss_artifact_state(
        self,
        state_data: schemas.AbyssArtifactMapStateCreate,
        user: models.User = Depends(get_current_superuser),
    ) -> schemas.StandardResponse[schemas.AbyssArtifactMapStateRead]:
        # Verify matching exists and belongs to the season
        result = await self.db.execute(
            select(models.ServerMatching).where(
                models.ServerMatching.id == state_data.server_matching_id,
                models.ServerMatching.season_id == self.season_model.id
            )
        )
        matching = result.unique().scalar_one_or_none()
        if matching is None:
            raise BizError(ErrorCode.ServerMatchingNotFoundError)

        state_model = models.AbyssArtifactMapState(
            server_matching_id=state_data.server_matching_id,
            states=[s.model_dump(mode='json') for s in state_data.states],
            record_time=state_data.record_time
        )
        self.db.add(state_model)

        await self.db.commit()
        await self.db.refresh(state_model)
        return schemas.AbyssArtifactMapStateRead.model_validate(state_model).to_response()

    @router.patch("/states/{state}")
    async def update_abyss_artifact_state(
        self,
        state_data: schemas.AbyssArtifactMapStateUpdate,
        state_model: models.AbyssArtifactMapState = Depends(get_abyss_artifact_map_state_from_path),
        user: models.User = Depends(get_current_superuser),
    ) -> schemas.StandardResponse[schemas.AbyssArtifactMapStateRead]:
        if state_model.server_matching.season_id != self.season_model.id:
            raise BizError(ErrorCode.SeasonNotFoundError)

        if state_data.states is not None:
            state_model.states = [s.model_dump(mode='json') for s in state_data.states]
        if state_data.record_time is not None:
            state_model.record_time = state_data.record_time

        await self.db.commit()
        await self.db.refresh(state_model)
        return schemas.AbyssArtifactMapStateRead.model_validate(state_model).to_response()

    @router.delete("/states/{state}")
    async def delete_abyss_artifact_state(
        self,
        state_model: models.AbyssArtifactMapState = Depends(get_abyss_artifact_map_state_from_path),
        user: models.User = Depends(get_current_superuser),
    ) -> schemas.StandardResponse[schemas.Empty]:
        if state_model.server_matching.season_id != self.season_model.id:
            raise BizError(ErrorCode.SeasonNotFoundError)

        await self.db.delete(state_model)
        await self.db.commit()
        return schemas.StandardResponse()

    @router.get("/states")
    async def list_abyss_artifact_states(
        self,
        server_matching_id: Optional[uuid.UUID] = Query(None),
        current_time: Optional[datetime] = Query(None),
    ) -> schemas.StandardListResponse[schemas.AbyssArtifactMapStateRead]:
        from sqlalchemy import desc
        
        # We want the latest state for each server_matching_id before current_time
        query = select(models.AbyssArtifactMapState).distinct(
            models.AbyssArtifactMapState.server_matching_id
        ).where(
            models.AbyssArtifactMapState.server_matching.has(
                models.ServerMatching.season_id == self.season_model.id
            )
        )

        if server_matching_id:
            query = query.where(models.AbyssArtifactMapState.server_matching_id == server_matching_id)

        if current_time:
            query = query.where(models.AbyssArtifactMapState.record_time <= current_time)

        # To use distinct on a column, it must be the first column in order_by
        query = query.order_by(
            models.AbyssArtifactMapState.server_matching_id,
            desc(models.AbyssArtifactMapState.record_time)
        )

        result = await self.db.execute(query)
        states = result.scalars().all()
        
        return schemas.StandardListResponse([
            schemas.AbyssArtifactMapStateRead.model_validate(s) for s in states
        ])


    @router.get("/count")
    async def count_artifacts_by_server(
        self,
    ) -> schemas.StandardListResponse[schemas.AbyssArtifactServerCount]:
        from sqlalchemy import desc, func
        from sqlalchemy.orm import joinedload
        
        # 1. Total artifacts on this map
        total_query = select(func.count(models.AbyssArtifact.id)).where(
            models.AbyssArtifact.marker.has(models.Marker.map_id == self.map_model.id)
        )
        artifact_total = (await self.db.execute(total_query)).scalar() or 0

        # 2. Get all map states in this season
        states_query = select(models.AbyssArtifactMapState).options(
            joinedload(models.AbyssArtifactMapState.server_matching).joinedload(models.ServerMatching.server1),
            joinedload(models.AbyssArtifactMapState.server_matching).joinedload(models.ServerMatching.server2)
        ).where(
            models.AbyssArtifactMapState.server_matching.has(
                models.ServerMatching.season_id == self.season_model.id
            )
        )

        result = await self.db.execute(states_query)
        all_map_states = result.unique().scalars().all()

        # 3. Aggregate counts per server
        # state = 1 -> server1, state = 2 -> server2
        counts = {} # server_id -> count
        
        # Optimization: get all artifacts on this map
        artifacts_on_map_query = select(models.AbyssArtifact.id).where(
            models.AbyssArtifact.marker.has(models.Marker.map_id == self.map_model.id)
        )
        artifacts_on_map = set((await self.db.execute(artifacts_on_map_query)).scalars().all())

        for ms in all_map_states:
            for s in ms.states:
                # Handle both UUID object and string from JSON
                artifact_id = s['abyss_artifact_id']
                if isinstance(artifact_id, str):
                    artifact_id = uuid.UUID(artifact_id)
                
                if artifact_id in artifacts_on_map:
                    if s['state'] == 1:
                        sid = ms.server_matching.server1.server_id
                        counts[sid] = counts.get(sid, 0) + 1
                    elif s['state'] == 2:
                        sid = ms.server_matching.server2.server_id
                        counts[sid] = counts.get(sid, 0) + 1

        # 4. We also want to include all servers in this season's matchings, even if they have 0 artifacts
        # Get all servers in matchings for this season
        matchings_query = select(models.ServerMatching).where(
            models.ServerMatching.season_id == self.season_model.id
        ).options(
            joinedload(models.ServerMatching.server1),
            joinedload(models.ServerMatching.server2)
        )
        matchings_result = await self.db.execute(matchings_query)
        matchings = matchings_result.unique().scalars().all()
        
        server_ids = set()
        for m in matchings:
            server_ids.add(m.server1.server_id)
            server_ids.add(m.server2.server_id)
        
        response_data = []
        for sid in sorted(list(server_ids)):
            response_data.append(schemas.AbyssArtifactServerCount(
                server_id=sid,
                artifact_count=counts.get(sid, 0),
                artifact_total=artifact_total
            ))

        return schemas.StandardListResponse(response_data)


@cbv(artifacts_router)
class AbyssArtifacts:
    db: AsyncSession = Depends(get_db)
    map_model: models.Map = Depends(get_map_from_path)

    @artifacts_router.post("/")
    async def create_abyss_artifact(
        self,
        artifact_data: schemas.AbyssArtifactCreate,
        user: models.User = Depends(get_current_superuser),
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

    @artifacts_router.get("/")
    async def get_abyss_artifacts(self) -> schemas.StandardListResponse[schemas.AbyssArtifactReadDetail]:
        result = await self.db.execute(
            select(models.AbyssArtifact).
            where(models.AbyssArtifact.marker.has(models.Marker.map_id == self.map_model.id))
        )
        artifacts = [schemas.AbyssArtifactReadDetail.model_validate(x) for x in result.unique().scalars()]
        return schemas.StandardListResponse(artifacts)

    @artifacts_router.get("/{abyss_artifact}")
    async def get_abyss_artifact(
        self,
        artifact_model: models.AbyssArtifact = Depends(get_abyss_artifact_from_path)
    ) -> schemas.StandardResponse[schemas.AbyssArtifactReadDetail]:
        if artifact_model.marker.map_id != self.map_model.id:
            raise BizError(ErrorCode.MapNotFoundError)
        return schemas.AbyssArtifactReadDetail.model_validate(artifact_model).to_response()

    @artifacts_router.patch("/{abyss_artifact}")
    async def update_abyss_artifact(
        self,
        artifact_data: schemas.AbyssArtifactUpdate,
        artifact_model: models.AbyssArtifact = Depends(get_abyss_artifact_from_path),
        user: models.User = Depends(get_current_superuser),
    ) -> schemas.StandardResponse[schemas.AbyssArtifactReadDetail]:
        if artifact_model.marker.map_id != self.map_model.id:
            raise BizError(ErrorCode.MapNotFoundError)
        await abyss_artifact_crud.update(
            self.db, artifact_data, id=artifact_model.id,
        )
        await self.db.refresh(artifact_model)
        return schemas.StandardResponse[schemas.AbyssArtifactReadDetail](
            data=schemas.AbyssArtifactReadDetail.model_validate(artifact_model)
        )

    @artifacts_router.delete("/{abyss_artifact}")
    async def delete_abyss_artifact(
        self,
        artifact_model: models.AbyssArtifact = Depends(get_abyss_artifact_from_path),
        user: models.User = Depends(get_current_superuser),
    ) -> schemas.StandardResponse[schemas.Empty]:
        if artifact_model.marker.map_id != self.map_model.id:
            raise BizError(ErrorCode.MapNotFoundError)
        await self.db.delete(artifact_model)
        await self.db.commit()
        return schemas.StandardResponse()

import uuid
from datetime import datetime
from typing import Optional, List
from fastapi_utils.cbv import cbv
from fastcrud import FastCRUD
from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aion2.backend import models, schemas
from aion2.backend.utilities.dependencies import get_db, get_current_superuser, get_current_user, \
    get_abyss_artifact_from_path, \
    get_map_from_path, get_season_from_path, get_abyss_artifact_state_from_path
from aion2.backend.utilities.exceptions import BizError, ErrorCode

router = APIRouter(prefix="/seasons/{season}/maps/{map}/artifacts", tags=["abyss_artifacts_states"])
artifacts_router = APIRouter(prefix="/maps/{map}/artifacts", tags=["abyss_artifacts"])

abyss_artifact_crud = FastCRUD(models.AbyssArtifact)
abyss_artifact_state_crud = FastCRUD(models.AbyssArtifactState)


async def update_abyss_artifact_contributor(db: AsyncSession, abyss_artifact_state_id: uuid.UUID, user_id: uuid.UUID):
    result = await db.execute(
        select(models.AbyssArtifactContributor).
        where(models.AbyssArtifactContributor.abyss_artifact_state_id == abyss_artifact_state_id).
        where(models.AbyssArtifactContributor.user_id == user_id)
    )
    contributor = result.unique().scalar_one_or_none()
    if contributor is None:
        contributor = models.AbyssArtifactContributor(abyss_artifact_state_id=abyss_artifact_state_id, user_id=user_id)
        db.add(contributor)
        await db.commit()


@cbv(router)
class AbyssArtifactStates:
    db: AsyncSession = Depends(get_db)
    map_model: models.Map = Depends(get_map_from_path)
    season_model: models.Season = Depends(get_season_from_path)

    async def _validate_record_time(
            self,
            server_matching_id: uuid.UUID,
            map_id: uuid.UUID,
            record_time: datetime,
            exclude_id: Optional[uuid.UUID] = None
    ):
        # Find states with same server_matching_id and map_id that are verified
        query = select(models.AbyssArtifactState).where(
            models.AbyssArtifactState.server_matching_id == server_matching_id,
            models.AbyssArtifactState.map_id == map_id,
            models.AbyssArtifactState.is_verified == True
        )
        if exclude_id:
            query = query.where(models.AbyssArtifactState.id != exclude_id)

        result = await self.db.execute(query)
        existing_states = result.unique().scalars().all()

        from datetime import timezone
        for state in existing_states:
            # Normalize both datetimes to UTC aware for safe comparison
            dt1 = state.record_time
            dt2 = record_time

            if dt1.tzinfo is None:
                dt1 = dt1.replace(tzinfo=timezone.utc)
            else:
                dt1 = dt1.astimezone(timezone.utc)

            if dt2.tzinfo is None:
                dt2 = dt2.replace(tzinfo=timezone.utc)
            else:
                dt2 = dt2.astimezone(timezone.utc)

            diff = abs((dt1 - dt2).total_seconds())
            if diff < 48 * 3600:
                raise BizError(
                    ErrorCode.ValidationError,
                    f"Record time must be at least 48 hours apart from existing records. Conflict with {state.record_time}"
                )

    @router.post("/states")
    async def create_abyss_artifact_state(
            self,
            state_data: schemas.AbyssArtifactStateCreate,
            user: models.User = Depends(get_current_user),
    ) -> schemas.StandardResponse[schemas.AbyssArtifactStateRead]:
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

        await self._validate_record_time(
            state_data.server_matching_id,
            self.map_model.id,
            state_data.record_time
        )

        state_model = models.AbyssArtifactState(
            server_matching_id=state_data.server_matching_id,
            map_id=self.map_model.id,
            states=[s.model_dump(mode='json') for s in state_data.states],
            is_verified=user.is_superuser,
            record_time=state_data.record_time
        )
        self.db.add(state_model)

        await self.db.commit()
        await self.db.refresh(state_model)

        await update_abyss_artifact_contributor(self.db, state_model.id, user.id)

        return schemas.AbyssArtifactStateRead.model_validate(state_model).to_response()

    @router.patch("/states/{state}")
    async def update_abyss_artifact_state(
            self,
            state_data: schemas.AbyssArtifactStateUpdate,
            state_model: models.AbyssArtifactState = Depends(get_abyss_artifact_state_from_path),
            user: models.User = Depends(get_current_user),
    ) -> schemas.StandardResponse[schemas.AbyssArtifactStateRead]:
        if state_model.is_verified and not user.is_superuser:
            raise BizError(ErrorCode.PermissionError)

        if not user.is_superuser:
            contributor_ids = [c.user_id for c in state_model.contributors]
            if user.id not in contributor_ids:
                raise BizError(ErrorCode.PermissionError)

        if state_model.server_matching.season_id != self.season_model.id:
            raise   BizError(ErrorCode.SeasonNotFoundError)

        if state_data.record_time is not None:
            await self._validate_record_time(
                state_model.server_matching_id,
                state_model.map_id,
                state_data.record_time,
                exclude_id=state_model.id
            )
            state_model.record_time = state_data.record_time

        if state_data.states is not None:
            state_model.states = [s.model_dump(mode='json') for s in state_data.states]

        if state_data.is_verified is not None:
            state_model.is_verified = state_data.is_verified

        if user.is_superuser:
            state_model.is_verified = True

        await self.db.commit()
        await self.db.refresh(state_model)

        await update_abyss_artifact_contributor(self.db, state_model.id, user.id)

        return schemas.AbyssArtifactStateRead.model_validate(state_model).to_response()

    @router.delete("/states/{state}")
    async def delete_abyss_artifact_state(
            self,
            state_model: models.AbyssArtifactState = Depends(get_abyss_artifact_state_from_path),
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
    ) -> schemas.StandardListResponse[schemas.AbyssArtifactStateRead]:
        from sqlalchemy import desc
        from sqlalchemy.orm import joinedload

        # Base query
        query = select(models.AbyssArtifactState).options(
            joinedload(models.AbyssArtifactState.contributors).joinedload(models.AbyssArtifactContributor.user)
        ).where(
            models.AbyssArtifactState.map_id == self.map_model.id,
            models.AbyssArtifactState.server_matching.has(
                models.ServerMatching.season_id == self.season_model.id
            )
        )

        if server_matching_id:
            # If server_matching_id is found, output all states of the server_matching_id ordered by record time desc.
            query = query.where(models.AbyssArtifactState.server_matching_id == server_matching_id)
            query = query.order_by(desc(models.AbyssArtifactState.record_time))
        else:
            # If server_matching_id is not found, output only one state for each server matching (the original behavior)
            query = query.distinct(models.AbyssArtifactState.server_matching_id)

            if current_time:
                query = query.where(models.AbyssArtifactState.record_time <= current_time)

            # To use distinct on a column, it must be the first column in order_by
            query = query.order_by(
                models.AbyssArtifactState.server_matching_id,
                desc(models.AbyssArtifactState.record_time)
            )

        if current_time and server_matching_id:
            query = query.where(models.AbyssArtifactState.record_time <= current_time)

        result = await self.db.execute(query)
        states = result.unique().scalars().all()

        return schemas.StandardListResponse([
            schemas.AbyssArtifactStateRead.model_validate(s) for s in states
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

        # 2. Get all map states in this season for this map
        states_query = select(models.AbyssArtifactState).options(
            joinedload(models.AbyssArtifactState.server_matching).joinedload(models.ServerMatching.server1),
            joinedload(models.AbyssArtifactState.server_matching).joinedload(models.ServerMatching.server2)
        ).where(
            models.AbyssArtifactState.map_id == self.map_model.id,
            models.AbyssArtifactState.server_matching.has(
                models.ServerMatching.season_id == self.season_model.id
            )
        )

        result = await self.db.execute(states_query)
        all_map_states = result.unique().scalars().all()

        # 3. Aggregate counts per server
        # state = 1 -> server1, state = 2 -> server2
        counts = {}  # server_id -> count

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

from uuid import UUID
from datetime import datetime
from typing import Optional
from aion2.backend.schemas.base import BaseModel
from aion2.backend.schemas.map import MapRead
from aion2.backend.schemas.marker import MarkerRead
from aion2.backend.schemas.server import ServerMatchingRead
from aion2.backend.schemas.user import UserRead


class AbyssArtifactRead(BaseModel):
    id: UUID
    marker_id: UUID
    order: int


class AbyssArtifactReadDetail(AbyssArtifactRead):
    marker: MarkerRead


class AbyssArtifactCreate(BaseModel):
    marker_id: UUID
    order: int = 0


class AbyssArtifactUpdate(BaseModel):
    marker_id: Optional[UUID] = None
    order: Optional[int] = None


class AbyssArtifactStateInfo(BaseModel):
    abyss_artifact_id: UUID
    state: int


class AbyssArtifactContributorRead(BaseModel):
    id: UUID
    user_id: UUID
    user: UserRead


class AbyssArtifactStateRead(BaseModel):
    id: UUID
    map_id: UUID
    server_matching_id: UUID
    states: list[AbyssArtifactStateInfo]
    record_time: datetime
    is_verified: bool
    contributors: list[AbyssArtifactContributorRead]


class AbyssArtifactStateCreate(BaseModel):
    server_matching_id: UUID
    states: list[AbyssArtifactStateInfo]
    record_time: datetime


class AbyssArtifactStateUpdate(BaseModel):
    states: Optional[list[AbyssArtifactStateInfo]] = None
    record_time: Optional[datetime] = None
    is_verified: Optional[bool] = None


class AbyssArtifactServerCount(BaseModel):
    server_id: int
    artifact_count: int
    artifact_total: int

from uuid import UUID
from datetime import datetime
from typing import Optional
from aion2.backend.schemas.base import BaseModel
from aion2.backend.schemas.map import MapRead
from aion2.backend.schemas.marker import MarkerRead
from aion2.backend.schemas.server import ServerMatchingRead


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


class AbyssArtifactStateRead(BaseModel):
    id: UUID
    abyss_artifact_id: UUID
    server_matching_id: UUID
    state: int
    record_time: datetime


class AbyssArtifactStateReadDetail(AbyssArtifactStateRead):
    abyss_artifact: AbyssArtifactRead
    server_matching: ServerMatchingRead


class AbyssArtifactStateCreate(BaseModel):
    abyss_artifact_id: UUID
    server_matching_id: UUID
    state: int
    record_time: datetime


class AbyssArtifactStateUpdate(BaseModel):
    abyss_artifact_id: Optional[UUID] = None
    server_matching_id: Optional[UUID] = None
    state: Optional[int] = None
    record_time: Optional[datetime] = None


class AbyssArtifactServerCount(BaseModel):
    server_id: int
    artifact_count: int
    artifact_total: int


class AbyssArtifactMapStateInfo(BaseModel):
    abyss_artifact_id: UUID
    state: int


class AbyssArtifactMapStateRead(BaseModel):
    id: UUID
    server_matching_id: UUID
    states: list[AbyssArtifactMapStateInfo]
    record_time: datetime


class AbyssArtifactMapStateCreate(BaseModel):
    server_matching_id: UUID
    states: list[AbyssArtifactMapStateInfo]
    record_time: datetime


class AbyssArtifactMapStateUpdate(BaseModel):
    states: Optional[list[AbyssArtifactMapStateInfo]] = None
    record_time: Optional[datetime] = None

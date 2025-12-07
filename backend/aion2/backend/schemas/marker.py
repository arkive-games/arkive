from enum import Enum
from uuid import UUID
from typing import List

from aion2.backend.schemas.region import RegionRead
from aion2.backend.schemas.image import ImageRead
from aion2.backend.schemas.base import BaseModel
from aion2.backend.schemas.language import LanguageRead
from aion2.backend.schemas.subtype import SubtypeRead
from aion2.backend.schemas.map import MapRead

class MarkerFeedbackType(str, Enum):
    CREATE = "create"
    UPDATE = "update"


class MarkerFeedbackStatus(str, Enum):
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    REVISION = "revision"
    PENDING = "pending"


class MarkerRead(BaseModel):
    id: UUID
    map_id: UUID
    subtype_id: UUID
    region_id: UUID | None
    name: str
    x: float
    y: float
    index_in_subtype: int

class MarkerReadDetail(MarkerRead):
    subtype: SubtypeRead
    region: RegionRead | None = None
    map: MapRead
    translations: List["MarkerTranslationRead"]  # Forward reference for translations
    images: List["MarkerImageRead"]

class MarkerCreate(BaseModel):
    subtype_id: UUID | str
    region_id: UUID | str | None = None
    name: str
    x: float
    y: float

class MarkerCreateReal(MarkerCreate):
    map_id: UUID
    index_in_subtype: int | None


class MarkerUpdate(BaseModel):
    subtype_id: UUID | str | None = None
    region_id: UUID | str | None = None
    name: str | None = None
    x: float | None = None
    y: float | None = None
    # images: List[str] | None = None

class MarkerImageCreate(BaseModel):
    marker_id: UUID
    image_id: UUID
    order: int = 0

class MarkerImageRead(BaseModel):
    id: UUID
    marker_id: UUID
    image_id: UUID
    image: ImageRead
    order: int

class MarkerImageReadDetail(MarkerImageRead):
    marker: MarkerRead


class MarkerFeedbackRead(BaseModel):
    id: UUID
    map_id: UUID
    subtype_id: UUID | None
    marker_id: UUID | None
    user_id: UUID
    type: MarkerFeedbackType
    status: MarkerFeedbackStatus

    x: int | None = None
    y: int | None = None
    name: None | str = None
    description: None | str = None
    reply: None | str = None


class MarkerFeedbackUpdate(BaseModel):
    type: MarkerFeedbackType = MarkerFeedbackType.CREATE
    subtype: UUID | str | None
    x: int | None = None
    y: int | None = None
    name: None | str = None
    description: None | str = None


class MarkerTranslationRead(BaseModel):
    id: UUID
    language: LanguageRead
    name: str
    description: str | None

class MarkerTranslationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None

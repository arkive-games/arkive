from uuid import UUID
from typing import List

from aion2.backend.schemas.base import BaseModel
from aion2.backend.schemas.language import LanguageRead
from aion2.backend.schemas.subtype import SubtypeRead
from aion2.backend.schemas.map import MapRead

class MarkerRead(BaseModel):
    id: UUID
    map_id: UUID
    subtype_id: UUID
    name: str
    x: float
    y: float
    images: List[str] | None

class MarkerReadDetail(MarkerRead):
    subtype: SubtypeRead
    map: MapRead
    translations: List["MarkerTranslationRead"]  # Forward reference for translations

class MarkerCreate(BaseModel):
    map_id: UUID | None = None
    subtype_id: UUID | str
    name: str
    x: float
    y: float
    # images: List[str] | None = []

class MarkerUpdate(BaseModel):
    subtype_id: UUID | str | None = None
    name: str | None = None
    x: float | None = None
    y: float | None = None
    # images: List[str] | None = None

class MarkerTranslationRead(BaseModel):
    id: UUID
    language: LanguageRead
    name: str
    description: str | None

class MarkerTranslationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None

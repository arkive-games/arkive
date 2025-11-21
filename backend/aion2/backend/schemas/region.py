from uuid import UUID
from typing import List

from aion2.backend.schemas.base import BaseModel
from aion2.backend.schemas.language import LanguageRead
from aion2.backend.schemas.map import MapRead

class RegionRead(BaseModel):
    id: UUID
    map_id: UUID
    name: str
    type: str

class RegionReadDetail(RegionRead):
    map: MapRead
    translations: List["RegionTranslationRead"]  # Forward reference for translations

class RegionCreate(BaseModel):
    map_id: UUID | None = None
    name: str
    type: str = ""

class RegionUpdate(BaseModel):
    name: str | None = None
    type: str | None = None

class RegionTranslationRead(BaseModel):
    id: UUID
    language: LanguageRead
    name: str
    description: str | None

class RegionTranslationUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


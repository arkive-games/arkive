from datetime import datetime
from uuid import UUID
from typing import Optional, List, Any

from pydantic import Field, HttpUrl

from aion2.backend.schemas.base import BaseModel
from aion2.backend.schemas.language import LanguageRead
# Map Schemas

class CharacterInfo(BaseModel):
    id: str
    name: str
    race: int
    pc_id: int
    level: int
    server_id: int
    server_name: str
    profile_image_url: str

class CharacterStat(BaseModel):
    type: str
    value: int


class CharacterTitle(BaseModel):
    id: int
    equip_category: str
    name: str
    grade: str
    total_count: int
    owned_count: int


class CharacterProfile(BaseModel):
    character_id: str = Field(..., description="Unique encoded character ID")
    character_name: str = Field(..., description="Character name")
    server_id: int = Field(..., description="Game server ID")
    server_name: str = Field(..., description="Server display name")
    region_name: str = Field(..., description="Community or region name")
    pc_id: int = Field(..., description="Platform or player category ID")
    class_name: str = Field(..., description="Class name")
    race_id: int = Field(..., description="Race ID")
    race_name: str = Field(..., description="Race name")
    gender: int = Field(..., description="Gender ID")
    gender_name: str = Field(..., description="Gender display name")
    character_level: int = Field(..., description="Character level")
    title_id: int = Field(..., description="Title ID")
    title_name: str = Field(..., description="Title name")
    title_grade: str = Field(..., description="Title grade or rarity")
    profile_image: HttpUrl = Field(..., description="Profile image URL")

class CharacterRanking(BaseModel):
    ranking_contents_type: int | None = Field(None, description="Ranking contents category type")
    ranking_contents_name: str | None = Field(None, description="Ranking contents name")
    ranking_type: int | None = Field(None, description="Ranking type ID")
    rank: int | None = Field(None, description="Current rank")
    character_id: str | None = Field(None, description="Character ID")
    character_name: str | None = Field(None, description="Character name")
    class_id: int | None = Field(None, description="Class ID")
    class_name: str | None = Field(None, description="Class name")
    guild_name: str | None = Field(None, description="Guild name")
    point: int | None = Field(None, description="Ranking points")
    prev_rank: int | None = Field(None, description="Previous rank")
    rank_change: int | None = Field(None, description="Rank change delta")
    grade_id: int | None = Field(None, description="Grade ID")
    grade_name: str | None = Field(None, description="Grade name")
    grade_icon: str | None = Field(None, description="Grade icon URL")
    profile_image: str | None = Field(None, description="Profile image URL")
    extra_data_map: dict[str, Any] | None = Field(None, description="Extra data map")


class CharacterBoard(BaseModel):
    id: int = Field(..., description="Board ID")
    name: str = Field(..., description="Display name")
    total_node_count: int = Field(..., description="Total node count")
    open_node_count: int = Field(..., description="Open/active node count")
    icon: HttpUrl = Field(..., description="Icon URL")
    open: int = Field(..., description="Open status flag")


class CharacterSkill(BaseModel):
    id: int = Field(..., description="Skill ID")
    skillLevel: int = Field(..., description="Skill level")
    acquired: int = Field(..., description="Acquired")
    equip: int = Field(..., description="Equip")



class CharacterEquipment(BaseModel):
    id: int = Field(..., description="Equipment ID")
    enchant_level: int = Field(..., description="Enchant level")
    exceed_level: int = Field(..., description="Exceed level")
    slotPos: int = Field(..., description="Slot position")


class CharacterDetail(BaseModel):
    profile: CharacterProfile
    stats: list[CharacterStat]
    titles: list[CharacterTitle]
    rankings: list[CharacterRanking]
    boards: list[CharacterBoard]
    skills: list[CharacterSkill]
    equipments: list[CharacterEquipment]
    updated_at: datetime = Field(..., description="Updated at")


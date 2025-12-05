from datetime import datetime
from uuid import UUID

from aion2.backend.schemas.base import BaseModel
from enum import Enum

class CommentTargetType(str, Enum):
    marker = "marker"


class CommentRead(BaseModel):
    id: UUID
    content: str
    root_id: UUID | None = None
    reply_to_id: UUID | None = None
    created_at: datetime

class CommentCreate(BaseModel):
    reply_to_id: UUID | None = None
    content: str

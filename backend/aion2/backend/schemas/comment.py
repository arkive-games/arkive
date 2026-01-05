from datetime import datetime
from uuid import UUID

from aion2.backend.schemas.base import BaseModel
from aion2.backend.schemas.user import UserRead
from enum import Enum

class CommentTargetType(str, Enum):
    marker = "marker"


class CommentRead(BaseModel):
    id: UUID
    content: str
    root_id: UUID | None = None
    reply_to_id: UUID | None = None
    created_at: datetime
    verified: bool

    user_id: UUID
    user: UserRead

class CommentCreate(BaseModel):
    reply_to_id: UUID | None = None
    content: str

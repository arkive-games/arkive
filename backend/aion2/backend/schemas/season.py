from uuid import UUID
from datetime import datetime
from typing import Optional
from aion2.backend.schemas.base import BaseModel

class SeasonRead(BaseModel):
    id: UUID
    number: int
    server_region: str
    start_date: datetime
    end_date: datetime

class SeasonCreate(BaseModel):
    number: int
    server_region: str
    start_date: datetime
    end_date: datetime

class SeasonUpdate(BaseModel):
    number: Optional[int] = None
    server_region: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None

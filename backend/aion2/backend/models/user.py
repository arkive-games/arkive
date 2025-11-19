from fastapi_users_db_sqlalchemy import SQLAlchemyBaseUserTableUUID
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from aion2.backend.interfaces.db import Base


class User(SQLAlchemyBaseUserTableUUID, Base):
    __tablename__ = 'users'

    name: Mapped[str] = mapped_column(
        String, unique=True, nullable=False
    )



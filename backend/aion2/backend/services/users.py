from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from loguru import logger

from aion2.backend import schemas, models
from aion2.backend.interfaces.db import get_db
from aion2.backend.interfaces.user import fastapi_users
from aion2.backend.utilities.dependencies import get_current_superuser
from aion2.backend.utilities.exceptions import BizError, ErrorCode

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/become_superuser")
async def become_superuser(
    user: models.User = Depends(get_current_superuser),
    db: AsyncSession = Depends(get_db),
) -> schemas.StandardResponse[schemas.UserRead]:
    logger.info(user)
    result = await db.execute(select(models.User).where(models.User.is_superuser.is_(True)).limit(1))
    superuser = result.unique().scalar_one_or_none()
    if superuser is not None:
        raise BizError(ErrorCode.UnauthorizedError)
    user_model = await db.get(models.User, user.id)
    user_model.is_superuser = True
    db.add(user_model)
    await db.commit()
    await db.refresh(user_model)
    return schemas.StandardResponse(schemas.UserRead.model_validate(user_model))

router.include_router(
    fastapi_users.get_users_router(schemas.UserRead, schemas.UserUpdate),
)

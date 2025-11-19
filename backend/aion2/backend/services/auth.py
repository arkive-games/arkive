from fastapi import APIRouter

from aion2.backend.schemas.user import UserCreate, UserRead
from aion2.backend.interfaces.user import jwt_backend, cookie_backend, fastapi_users


router = APIRouter(prefix="/auth", tags=["auth"])


router.include_router(
    fastapi_users.get_register_router(UserRead, UserCreate),
)
router.include_router(
    fastapi_users.get_auth_router(jwt_backend), prefix="/jwt"
)
router.include_router(
    fastapi_users.get_auth_router(cookie_backend), prefix="/cookie"
)
router.include_router(
    fastapi_users.get_reset_password_router(),
)
router.include_router(
    fastapi_users.get_verify_router(UserRead),
)

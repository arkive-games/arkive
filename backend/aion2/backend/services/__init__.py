from fastapi import APIRouter
from fastapi.params import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.responses import RedirectResponse

from aion2.backend.config.manager import settings
from aion2.backend.utilities.export import export_data
from aion2.backend.utilities.dependencies import get_db
from aion2.backend.schemas import StandardResponse, Empty

from aion2.backend.services.auth import router as auth_router
from aion2.backend.services.users import router as users_router
from aion2.backend.services.languages import router as languages_router
from aion2.backend.services.maps import router as maps_router
from aion2.backend.services.categories import router as categories_router
from aion2.backend.services.subtypes import router as subtypes_router
from aion2.backend.services.markers import router as markers_router

router = APIRouter()


@router.get("/", include_in_schema=False)
def redirect_docs():
    return RedirectResponse(url=settings.DOCS_URL)

@router.get("/export", include_in_schema=True)
async def export(db: AsyncSession = Depends(get_db)) -> StandardResponse[Empty]:
    await export_data(db)
    return StandardResponse()

router.include_router(auth_router)
router.include_router(users_router)
router.include_router(languages_router)
router.include_router(maps_router)
router.include_router(categories_router)
router.include_router(subtypes_router)
router.include_router(markers_router)

import yaml
from fastapi import APIRouter, Depends, Path
from fastapi.responses import StreamingResponse
from fastapi_utils.cbv import cbv
from sqlalchemy.ext.asyncio import AsyncSession

from aion2.backend import models
from aion2.backend.utilities.dependencies import get_current_superuser, get_db
from aion2.backend.utilities.export import export_maps, export_map_translations, export_types, export_type_translations, \
    export_markers, export_marker_translations

router = APIRouter(prefix="/export", tags=["export"])

@cbv(router)
class Export:
    # user: models.User = Depends(get_current_superuser)
    db: AsyncSession = Depends(get_db)

    @staticmethod
    async def export_yaml(data) -> StreamingResponse:
        async def generate_yaml_data():
            yield yaml.dump(data, allow_unicode=True)

        return StreamingResponse(
            generate_yaml_data(),
            media_type="text/yaml",
        )

    @router.get("/data/maps.yaml")
    async def export_data_maps(self) -> StreamingResponse:
        maps = await export_maps(self.db)
        return await self.export_yaml({"maps": maps})

    @router.get("/locales/{language}/maps.yaml")
    async def export_locale_maps(self, language: str = Path(...)) -> StreamingResponse:
        map_translations = await export_map_translations(self.db, language)
        return await self.export_yaml(map_translations)


    @router.get("/data/types.yaml")
    async def export_data_types(self) -> StreamingResponse:
        categories = await export_types(self.db)
        return await self.export_yaml({"categories": categories})

    @router.get("/locales/{language}/types.yaml")
    async def export_locale_types(self, language: str = Path(...)) -> StreamingResponse:
        category_translations, subtype_translations = await export_type_translations(self.db, language)
        return await self.export_yaml({"categories": category_translations, "subtypes": subtype_translations})

    @router.get("/data/markers/{map_name}.yaml")
    async def export_data_markers(self, map_name: str = Path(...)) -> StreamingResponse:
        markers = await export_markers(self.db, map_name)
        return await self.export_yaml({"markers": markers})

    @router.get("/locales/{language}/markers/{map_name}.yaml")
    async def export_locales_markers(self, language: str = Path(...), map_name: str = Path(...)) -> StreamingResponse:
        marker_translations = await export_marker_translations(self.db, language, map_name)
        return await self.export_yaml(marker_translations)

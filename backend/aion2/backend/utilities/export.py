from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
import yaml
from loguru import logger

from aion2.backend import models, schemas
from aion2.backend.config.manager import settings
from aion2.backend.interfaces.db import get_db

DATA_DIR = settings.PUBLIC_DIR / "data"
LOCALES_DIR = settings.PUBLIC_DIR / "locales"

async def export_data(db: AsyncSession):
    language_models = await db.execute(select(models.Language))
    languages = [x.language_code for x in language_models.unique().scalars().all()]

    # export maps
    map_models = await db.execute(select(models.Map).order_by(models.Map.order))
    maps = []
    map_translations = {x: {} for x in languages}
    for map_model in map_models.unique().scalars():
        map_data = schemas.MapRead.model_validate(map_model)
        maps.append({**map_data.model_dump(by_alias=True),"id": str(map_data.id)})
        for translation in map_model.translations:
            map_translations[translation.language.language_code][map_data.name] = {
                "name": translation.name,
                "description": translation.description,
            }

    filename = DATA_DIR / "maps.yaml"
    filename.parent.mkdir(parents=True, exist_ok=True)
    with filename.open("w", encoding="utf-8") as f:
        yaml.dump({"maps": maps}, f, allow_unicode=True)

    for language, translations in map_translations.items():
        filename = LOCALES_DIR / str(language) / "maps.yaml"
        filename.parent.mkdir(parents=True, exist_ok=True)
        with filename.open("w", encoding="utf-8") as f:
            yaml.dump(translations, f, allow_unicode=True)

    # export types
    category_models = await db.execute(select(models.Category).order_by(models.Category.order))
    categories = []
    category_translations = {x: {} for x in languages}
    subtype_category_map = {}
    for category_model in category_models.unique().scalars().all():
        category_data = schemas.CategoryRead.model_validate(category_model)
        subtypes = []
        for subtype_model in category_model.subtypes:
            subtype_category_map[subtype_model.id] = (category_model.name, subtype_model.name)
            subtype_data = schemas.SubtypeRead.model_validate(subtype_model)
            subtypes.append({**subtype_data.model_dump(by_alias=True),"id": str(subtype_data.id)})
        categories.append({**category_data.model_dump(by_alias=True),"id": str(category_data.id), "subtypes": subtypes})
        for translation in category_model.translations:
            category_translations[translation.language.language_code][category_model.name] = {
                "name": translation.name,
            }
    subtype_models = await db.execute(select(models.Subtype))
    subtype_translations = {x: {} for x in languages}
    for subtype_model in subtype_models.unique().scalars().all():
        for translation in subtype_model.translations:
            subtype_translations[translation.language.language_code][subtype_model.name] = {
                "name": translation.name,
                "description": translation.description,
            }

    filename = DATA_DIR / "types.yaml"
    filename.parent.mkdir(parents=True, exist_ok=True)
    with filename.open("w", encoding="utf-8") as f:
        yaml.dump({"categories": categories}, f, allow_unicode=True)

    for language in languages:
        filename = LOCALES_DIR / str(language) / "types.yaml"
        filename.parent.mkdir(parents=True, exist_ok=True)
        type_translations = {
            "categories": category_translations[language],
            "subtypes": subtype_translations[language],
        }

        with filename.open("w", encoding="utf-8") as f:
            yaml.dump(type_translations, f, allow_unicode=True)

    # export markers
    for map_data in maps:
        map_name = map_data["name"]
        marker_models = await db.execute(select(models.Marker).where(models.Marker.map_id == map_data["id"]))
        markers = []
        marker_translations = {x: {} for x in languages}
        for marker_model in marker_models.unique().scalars().all():
            marker_data = schemas.MarkerRead.model_validate(marker_model)
            category, subtype = subtype_category_map[marker_model.subtype_id]
            marker_dict = {
                **marker_data.model_dump(
                    by_alias=True,
                    exclude={"map_id", "subtype_id", "images"}
                ),
                "id": str(marker_data.id),
                "category": category,
                "subtype": subtype,
            }
            if marker_model.images:
                marker_dict["images"] = marker_model.images
            markers.append(marker_dict)
            for translation in marker_model.translations:
                marker_translations[translation.language.language_code][str(marker_model.id)] = {
                    "name": translation.name,
                    "description": translation.description,
                }

        filename = DATA_DIR / "markers" / f"{map_name}.yaml"
        filename.parent.mkdir(parents=True, exist_ok=True)
        with filename.open("w", encoding="utf-8") as f:
            yaml.dump({"markers": markers}, f, allow_unicode=True)

        for language, translations in marker_translations.items():
            filename = LOCALES_DIR / str(language) / "markers" / f"{map_name}.yaml"
            filename.parent.mkdir(parents=True, exist_ok=True)
            with filename.open("w", encoding="utf-8") as f:
                yaml.dump(translations, f, allow_unicode=True)


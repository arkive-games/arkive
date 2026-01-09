import asyncio
import re
from typing import Any
from uuid import UUID
from urllib.parse import unquote

import httpx
from fastapi_utils.cbv import cbv
from fastcrud import FastCRUD
from fastapi import APIRouter, Depends, Body, UploadFile, File, Form, Query, Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger
from datetime import datetime, UTC, timedelta

from aion2.backend import models, schemas
from aion2.backend.interfaces.cache import clear_cache, use_cache
from aion2.backend.schemas import CharacterInfo
from aion2.backend.utilities.dependencies import get_db, get_current_user, get_current_superuser, get_region_from_path, \
    get_language_from_path, get_map_from_path, get_httpx_client
from aion2.backend.utilities.exceptions import BizError, ErrorCode
from aion2.backend.tasks.character import get_character_task, get_character_detail

router = APIRouter(prefix="/characters", tags=["characters"])


@cbv(router)
class Character:
    # user: models.User = Depends(get_current_user)
    # map_model: models.Map = Depends(get_map_from_path)
    httpx_client: httpx.AsyncClient = Depends(get_httpx_client)
    db: AsyncSession = Depends(get_db)

    @staticmethod
    def validate_character(character: dict[str, Any]):
        character["id"] = unquote(character["characterId"])
        character["name"] = re.sub(r'<.*?>', '', character["name"])
        return CharacterInfo.model_validate(character)

    @router.get("/search")
    async def search_characters(
            self,
            keyword: str = Query(...),
            race: int = Query(...),
            server: int | None = Query(None),
    ) -> schemas.StandardListResponse[schemas.CharacterInfo]:
        resp = await self.httpx_client.get(
            "https://tw.ncsoft.com/aion2/api/search/aion2tw/search/v2/character",
            params={
                "keyword": keyword,
                "race": race,
                "serverId": server or "",
                "page": 1,
                "size": 30,
            },
        )
        data = resp.json()
        characters = [self.validate_character(x) for x in data["list"]]
        return schemas.StandardListResponse(characters)

    @router.get("/info")
    async def get_character_info(
            self,
            character: str = Query(...),
            server: int = Query(...),
    ) -> schemas.StandardResponse[schemas.CharacterDetail]:
        async def wrapper():
            return await asyncio.to_thread(get_character_detail, character, server)

        key = f"character:{server}:{character}"
        detail = await use_cache(key, wrapper)

        # Refresh data
        current_datetime = datetime.now(UTC)
        time_diff = current_datetime - detail.updated_at
        if time_diff > timedelta(minutes=10):
            await clear_cache(key)
            detail = await use_cache(key, wrapper)


        # detail = await wrapper()
        return detail.to_response()
        # job = get_character_task.apply_async(kwargs={
        #     "character_id": character,
        #     "server_id": server,
        # })
        # return {"task_id": job.id}

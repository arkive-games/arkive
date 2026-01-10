import asyncio
import json
import re
from typing import Any
from uuid import UUID, uuid4
from urllib.parse import unquote
import redis.asyncio as aioredis

import httpx
from fastapi_utils.cbv import cbv
from fastcrud import FastCRUD
from fastapi import APIRouter, Depends, Body, UploadFile, File, Form, Query, Path, WebSocket
from fastapi.websockets import WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from loguru import logger
from datetime import datetime, UTC, timedelta


from aion2.backend import models, schemas
from aion2.backend.interfaces.cache import clear_cache, use_cache
from aion2.backend.schemas import CharacterInfo
from aion2.backend.utilities.dependencies import get_db, get_current_user, get_current_superuser, get_region_from_path, \
    get_language_from_path, get_map_from_path, get_httpx_client, get_redis_client
from aion2.backend.utilities.exceptions import BizError, ErrorCode
from aion2.backend.tasks.character import get_character_task

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

    # @router.get("/info")
    # async def get_character_info(
    #     self,
    #     region: str = Query("tw"),
    #     character: str = Query(...),
    #     server: int = Query(...),
    #     redis: aioredis.Redis = Depends(get_redis_client)
    # ):
    #     # Use region, server, and character for job identifier
    #     cache_key_prefix = f"character:{region}:{server}:{character}"
    #     cache_key_meta = f"{cache_key_prefix}:meta"
    #     cache_key_items = f"{cache_key_prefix}:items"
    #
    #     # Get the current time using datetime
    #     current_time = datetime.now()
    #
    #     # Retrieve cached metadata and items in all cases
    #     cached_result = await redis.hgetall(cache_key_meta)
    #     items = await redis.lrange(cache_key_items, 0, -1)
    #
    #     # Check if cached data exists and if it's still valid (within 15 minutes)
    #     cached_at = await redis.get(f"{cache_key_prefix}:cached_at")
    #     if cached_at:
    #         cached_at = datetime.fromtimestamp(float(cached_at))
    #         # If cached data is still valid (within 15 minutes)
    #         if current_time - cached_at < timedelta(minutes=15):  # 15 minutes TTL
    #             # Return cached results directly if data is valid
    #             return {"job_id": None, "status": "cached", "cached_result": cached_result, "items": items}
    #
    #     # If cache is expired or not found, check if the job is already running
    #     job_status = cached_result.get("status")
    #     current_job_id = cached_result.get("job_id")
    #
    #     # If no job is running, create a new job
    #     if not current_job_id or job_status != "running":
    #         celery_job = get_character_task.apply_async(kwargs={
    #             "region_id": region,
    #             "character_id": character,
    #             "server_id": server,
    #         })
    #         current_job_id = celery_job.id
    #         await redis.hset(cache_key_meta, mapping={
    #             "job_id": current_job_id,
    #             "status": "running",
    #             "done": 0,
    #             "total": 20,
    #             "updated_at": current_time.timestamp()
    #         })
    #
    #     # Return the cached results (which can be empty) and the job ID
    #     return {"job_id": current_job_id, "status": "running", "cached_result": cached_result, "items": items}
    #
    #     # async def wrapper():
    #     #     return await asyncio.to_thread(get_character_detail, character, server)
    #     #
    #     # detail = await use_cache(key, wrapper)
    #     #
    #     # # Refresh data
    #     # current_datetime = datetime.now(UTC)
    #     # time_diff = current_datetime - detail.updated_at
    #     # if time_diff > timedelta(minutes=10):
    #     #     await clear_cache(key)
    #     #     detail = await use_cache(key, wrapper)
    #     # return detail.to_response()
    #
    # @router.websocket("/ws")
    # async def get_character_info_websocket(
    #         self,
    #         websocket: WebSocket,
    #         region: str = Query("tw"),
    #         character: str = Query(...),
    #         server: int = Query(...),
    #         redis: aioredis.Redis = Depends(get_redis_client)
    # ):
    #     await websocket.accept()
    #     cache_key_prefix = f"character:{region}:{server}:{character}"
    #     cache_key_meta = f"{cache_key_prefix}:meta"
    #     channel = f"{cache_key_prefix}:channel"
    #     pubsub = redis.pubsub()
    #
    #     try:
    #         # Subscribe first to minimize the “update between snapshot and subscribe” race.
    #         await pubsub.subscribe(channel)
    #
    #         # 1) On connect: Send the current job meta
    #         meta = await redis.hgetall(cache_key_meta)
    #         if meta.get("status", "") == "done":
    #             return
    #
    #         # Send the initial snapshot to the client
    #         await websocket.send_json(meta)
    #
    #         # 2) Listen for updates on the Pub/Sub channel
    #         async for message in pubsub.listen():
    #             if message.get("type") == "message":
    #                 # Forward the update to the client
    #                 job_update = message.get("data").decode("utf-8")
    #                 # Parse the job update string as JSON
    #                 try:
    #                     job_update_dict = json.loads(job_update)
    #                 except json.JSONDecodeError:
    #                     # If the data is not valid JSON, log the error
    #                     logger.error(f"Error decoding job update: {job_update}")
    #                     job_update_dict = await redis.hgetall(cache_key_meta)
    #                 # Send the update to the WebSocket client
    #                 await websocket.send_text(job_update)
    #
    #                 # If the job is done, send the final response and close the connection
    #                 if job_update_dict.get("status") == "done":
    #                     break
    #
    #
    #     except WebSocketDisconnect:
    #         logger.info("WebSocket disconnected")
    #     finally:
    #         try:
    #             await pubsub.unsubscribe(channel)
    #         finally:
    #             await pubsub.close()
    #

import typing

import fastapi
import httpx
import loguru

from aion2.backend.config.manager import settings
from aion2.backend.interfaces.cache import clear_all_cache
from aion2.backend.interfaces.db import init_db
from aion2.backend.interfaces.redis import init_redis, close_redis


def execute_backend_server_event_handler(backend_app: fastapi.FastAPI) -> typing.Any:
    async def launch_backend_server_events() -> None:
        loguru.logger.info("------ {} Initializing ------", settings.TITLE)
        # HTTPX client startup
        backend_app.state.httpx_client = httpx.AsyncClient(
            timeout=30.0,
            follow_redirects=True,
        )
        # Initialize Redis client on startup
        await init_redis(backend_app)

        await init_db()
        await clear_all_cache()
        loguru.logger.info("------ {} Launched ------", settings.TITLE)

    return launch_backend_server_events


def terminate_backend_server_event_handler(backend_app: fastapi.FastAPI) -> typing.Any:
    @loguru.logger.catch
    async def stop_backend_server_events() -> None:
        loguru.logger.info("------ {} Shut down ------", settings.TITLE)
        # HTTPX client shutdown (close before process exit)
        client: httpx.AsyncClient | None = getattr(backend_app.state, "httpx_client", None)
        if client is not None:
            await client.aclose()
        # Close Redis client on shutdown
        await close_redis(backend_app)

    return stop_backend_server_events
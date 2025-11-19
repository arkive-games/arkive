import typing

import fastapi
import loguru

from aion2.backend.config.manager import settings
from aion2.backend.interfaces.db import init_db


def execute_backend_server_event_handler(backend_app: fastapi.FastAPI) -> typing.Any:
    async def launch_backend_server_events() -> None:
        loguru.logger.info("------ {} Initializing ------", settings.TITLE)
        await init_db()
        loguru.logger.info("------ {} Launched ------", settings.TITLE)

    return launch_backend_server_events


def terminate_backend_server_event_handler(backend_app: fastapi.FastAPI) -> typing.Any:
    @loguru.logger.catch
    async def stop_backend_server_events() -> None:
        loguru.logger.info("------ {} Shut down ------", settings.TITLE)

    return stop_backend_server_events
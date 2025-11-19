import click
import uvicorn

from aion2.backend.config.manager import settings


@click.command()
def serve() -> None:
    uvicorn.run(
        app="aion2.backend.app:backend_app",
        host=settings.SERVER_HOST,
        port=settings.SERVER_PORT,
        reload=settings.SERVER_WORKERS == 1 and settings.DEBUG,
        reload_dirs=["aion2/backend"],
        workers=settings.SERVER_WORKERS,
        log_level=settings.LOGGING_LEVEL,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )

if __name__ == '__main__':
    serve()

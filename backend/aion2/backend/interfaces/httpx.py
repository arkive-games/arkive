import httpx
from fastapi import Depends
from contextlib import asynccontextmanager

_client: httpx.AsyncClient | None = None

@asynccontextmanager
async def lifespan_httpx(app):
    global _client
    _client = httpx.AsyncClient(timeout=30.0, follow_redirects=True)
    yield
    await _client.aclose()

def httpx_client_dep() -> httpx.AsyncClient:
    assert _client is not None, "httpx client not initialized"
    return _client

async def get_httpx_client(
    client: httpx.AsyncClient = Depends(httpx_client_dep),
) -> httpx.AsyncClient:
    return client

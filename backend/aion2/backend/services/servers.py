from fastapi_utils.cbv import cbv
from fastcrud import FastCRUD
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from aion2.backend import models, schemas
from aion2.backend.utilities.dependencies import get_db, get_current_superuser, get_server_from_path, get_server_matching_from_path

router = APIRouter(prefix="/servers", tags=["servers"])

server_crud = FastCRUD(models.Server)
server_matching_crud = FastCRUD(models.ServerMatching)

@cbv(router)
class Servers:
    user: models.User = Depends(get_current_superuser)
    db: AsyncSession = Depends(get_db)

    @router.post("/")
    async def create_server(
        self,
        server_data: schemas.ServerCreate,
    ) -> schemas.StandardResponse[schemas.ServerRead]:
        server_model = await server_crud.create(self.db, server_data)
        return schemas.ServerRead.model_validate(server_model).to_response()

    @router.get("/")
    async def get_servers(self) -> schemas.StandardListResponse[schemas.ServerRead]:
        count = await server_crud.count(self.db)
        result = await server_crud.get_multi(self.db)
        servers = [schemas.ServerRead.model_validate(x) for x in result["data"]]
        return schemas.StandardListResponse(servers, count)

    @router.get("/{server}")
    async def get_server(
        self,
        server_model: models.Server = Depends(get_server_from_path)
    ) -> schemas.StandardResponse[schemas.ServerRead]:
        return schemas.ServerRead.model_validate(server_model).to_response()

    @router.patch("/{server}")
    async def update_server(
        self,
        server_data: schemas.ServerUpdate,
        server_model: models.Server = Depends(get_server_from_path),
    ) -> schemas.StandardResponse[schemas.ServerRead]:
        await server_crud.update(
            self.db, server_data, id=server_model.id,
        )
        await self.db.refresh(server_model)
        return schemas.ServerRead.model_validate(server_model).to_response()

    @router.delete("/{server}")
    async def delete_server(
        self,
        server_model: models.Server = Depends(get_server_from_path),
    ) -> schemas.StandardResponse[schemas.Empty]:
        await self.db.delete(server_model)
        await self.db.commit()
        return schemas.StandardResponse()

@cbv(router)
class ServerMatchings:
    user: models.User = Depends(get_current_superuser)
    db: AsyncSession = Depends(get_db)

    @router.post("/matchings")
    async def create_server_matching(
        self,
        matching_data: schemas.ServerMatchingCreate,
    ) -> schemas.StandardResponse[schemas.ServerMatchingReadDetail]:
        matching_model = await server_matching_crud.create(self.db, matching_data)
        # Refresh to load relationships for ReadDetail
        await self.db.refresh(matching_model, ["season", "server1", "server2"])
        return schemas.ServerMatchingReadDetail.model_validate(matching_model).to_response()

    @router.get("/matchings")
    async def get_server_matchings(self) -> schemas.StandardListResponse[schemas.ServerMatchingReadDetail]:
        count = await server_matching_crud.count(self.db)
        result = await server_matching_crud.get_multi(self.db)
        # Ensure relationships are loaded. FastCRUD might not join by default if not configured.
        # But our models have lazy="joined"
        matchings = [schemas.ServerMatchingReadDetail.model_validate(x) for x in result["data"]]
        return schemas.StandardListResponse(matchings, count)

    @router.get("/matchings/{server_matching}")
    async def get_server_matching(
        self,
        matching_model: models.ServerMatching = Depends(get_server_matching_from_path)
    ) -> schemas.StandardResponse[schemas.ServerMatchingReadDetail]:
        return schemas.ServerMatchingReadDetail.model_validate(matching_model).to_response()

    @router.patch("/matchings/{server_matching}")
    async def update_server_matching(
        self,
        matching_data: schemas.ServerMatchingUpdate,
        matching_model: models.ServerMatching = Depends(get_server_matching_from_path),
    ) -> schemas.StandardResponse[schemas.ServerMatchingReadDetail]:
        await server_matching_crud.update(
            self.db, matching_data, id=matching_model.id,
        )
        await self.db.refresh(matching_model, ["season", "server1", "server2"])
        return schemas.ServerMatchingReadDetail.model_validate(matching_model).to_response()

    @router.delete("/matchings/{server_matching}")
    async def delete_server_matching(
        self,
        matching_model: models.ServerMatching = Depends(get_server_matching_from_path),
    ) -> schemas.StandardResponse[schemas.Empty]:
        await self.db.delete(matching_model)
        await self.db.commit()
        return schemas.StandardResponse()

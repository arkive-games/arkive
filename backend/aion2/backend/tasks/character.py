import httpx
from loguru import logger

from aion2.backend import schemas
from aion2.backend.config.manager import settings
from aion2.backend.app.celery import celery_app

def get_character_detail(character_id: str, server_id: int) -> schemas.CharacterDetail:
    resp = httpx.get(
        "https://tw.ncsoft.com/aion2/api/character/info",
        params={
            "characterId": character_id,
            "serverId": server_id,
            "lang": "zh"
        }
    )
    data = resp.json()
    profile = schemas.CharacterProfile.model_validate(data["profile"])
    stats = [schemas.CharacterStat.model_validate(x) for x in data["stat"]["statList"]]
    titles = [schemas.CharacterTitle.model_validate(x) for x in data["title"]["titleList"]]
    rankings = [schemas.CharacterRanking.model_validate(x) for x in data["ranking"]["rankingList"]]
    boards = [schemas.CharacterBoard.model_validate(x) for x in data["daevanion"]["boardList"]]

    resp = httpx.get(
        "https://tw.ncsoft.com/aion2/api/character/equipment",
        params={
            "characterId": character_id,
            "serverId": server_id,
            "lang": "zh"
        }
    )
    data = resp.json()




    result = schemas.CharacterDetail(
        profile=profile,
        stats=stats,
        titles=titles,
        rankings=rankings,
        boards=boards,
    )

    return result



@celery_app.task
def get_character_task(*, character_id: str, server_id: int):
    info = get_character_detail(character_id=character_id, server_id=server_id)
    logger.info(f"get character info: {info}")
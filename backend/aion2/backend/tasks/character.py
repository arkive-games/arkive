from datetime import datetime, UTC

import httpx
from loguru import logger

from aion2.backend import schemas
from aion2.backend.config.manager import settings
from aion2.backend.app.celery import celery_app


def get_api_base_url(region_id: str):
    if region_id == "kr":
        return "https://aion2.plaync.com/api"
    return "https://tw.ncsoft.com/aion2/api"


def get_character_detail_info(region_id: str, character_id: str, server_id: int) -> schemas.CharacterDetailInfo:
    resp = httpx.get(
        f"{get_api_base_url(region_id)}/character/info",
        params={
            "characterId": character_id,
            "serverId": server_id,
            "lang": "zh"
        }
    )
    data = resp.json()
    # logger.debug(data)
    profile = schemas.CharacterProfile.model_validate(data["profile"])
    stats = [schemas.CharacterStat.model_validate(x) for x in data["stat"]["statList"]]
    titles = [schemas.CharacterTitle.model_validate(x) for x in data["title"]["titleList"]]
    rankings = [schemas.CharacterRanking.model_validate(x) for x in data["ranking"]["rankingList"]]
    boards = [schemas.CharacterBoard.model_validate(x) for x in data["daevanion"]["boardList"]]
    result = schemas.CharacterDetailInfo(
        profile=profile,
        stats=stats,
        titles=titles,
        rankings=rankings,
        boards=boards
    )
    return result


def get_character_equipments(region_id: str, character_id: str, server_id: int) -> schemas.CharacterEquipments:
    resp = httpx.get(
        f"{get_api_base_url(region_id)}/character/equipment",
        params={
            "characterId": character_id,
            "serverId": server_id,
            "lang": "zh"
        }
    )
    data = resp.json()
    skills = [schemas.CharacterSkill.model_validate(x) for x in data["skill"]["skillList"]]
    equipments = [schemas.CharacterEquipment.model_validate(x) for x in data["equipment"]["equipmentList"]]
    result = schemas.CharacterEquipments(
        skills=skills,
        equipments=equipments,
    )
    return result


def get_character_item(region_id: str, character_id: str, server_id: int, item_id: int, enchant_level: int,
                       slot_pos: int) -> schemas.CharacterItem:
    resp = httpx.get(
        f"{get_api_base_url(region_id)}/character/equipment/item",
        params={
            "id": item_id,
            "enchantLevel": enchant_level,
            "characterId": character_id,
            "serverId": server_id,
            "slotPos": slot_pos,
            "lang": "zh"
        }
    )
    data = resp.json()
    main_stats = [schemas.CharacterItemMainStat.model_validate(x) for x in data.get("mainStats", [])]
    sub_stats = [schemas.CharacterItemSubStat.model_validate(x) for x in data.get("subStats", [])]
    magic_stone_stats = [schemas.CharacterItemMagicStoneStat.model_validate(x) for x in data.get("magicStoneStat", [])]
    return schemas.CharacterItem(
        **data,
        main_stats=main_stats,
        sub_stats=sub_stats,
        magic_stone_stats=magic_stone_stats,
    )

def get_character_task_temp(region_id: str, character_id: str, server_id: int):
    info = get_character_detail_info(region_id=region_id, character_id=character_id, server_id=server_id)
    equipments = get_character_equipments(region_id=region_id, character_id=character_id, server_id=server_id)
    return schemas.CharacterDetail(
        **info.model_dump(),
        **equipments.model_dump(),
        updated_at=datetime.now(UTC),
    )

@celery_app.task
def get_character_task(*, region_id: str, character_id: str, server_id: int):
    info = get_character_detail_info(region_id=region_id, character_id=character_id, server_id=server_id)
    equipments = get_character_equipments(region_id=region_id, character_id=character_id, server_id=server_id)
    for equipment in equipments.equipments:
        item = get_character_item(
            region_id=region_id, character_id=character_id, server_id=server_id,
            item_id=equipment.id, enchant_level=equipment.enchant_level, slot_pos=equipment.slot_pos
        )


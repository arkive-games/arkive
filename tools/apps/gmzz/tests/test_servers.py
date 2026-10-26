import pytest

from gmzz.servers import build_servers


def test_only_player_servers_are_kept_in_id_order():
    table = {
        "1": {"ID": 1102, "Name": " 黑荆棘 ", "SchemeRecommendGroup": 1},
        "2": {"ID": 1101, "Name": "灰雾之上", "SchemeRecommendGroup": 1},
        "3": {"ID": 1, "Name": "本地私服一区", "SchemeRecommendGroup": 102},
        "4": {"ID": 1501, "Name": "偷跑服一区", "SchemeRecommendGroup": 101},
        "5": {"ID": 1916, "Name": "战略服"},
        "6": {"ID": 1801, "Name": "跨服"},
    }
    assert build_servers(table) == [{"id": 1101, "name": "灰雾之上"}, {"id": 1102, "name": "黑荆棘"}]


def test_an_empty_result_fails_rather_than_shipping_no_servers():
    with pytest.raises(ValueError, match="No player servers"):
        build_servers([{"ID": 1916, "Name": "战略服"}])


def test_duplicate_and_unnamed_servers_are_rejected():
    with pytest.raises(ValueError, match="Duplicate"):
        build_servers([{"ID": 1, "Name": "a", "SchemeRecommendGroup": 1}, {"ID": 1, "Name": "b", "SchemeRecommendGroup": 2}])
    with pytest.raises(ValueError, match="no name"):
        build_servers([{"ID": 1, "Name": " ", "SchemeRecommendGroup": 1}])

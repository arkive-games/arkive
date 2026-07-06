import pytest

from palworld.maps.emit import build_dataset

LANGUAGES = ["en-US", "ja-JP", "de-DE", "es-ES", "es-MX", "fr-FR", "id-ID", "it-IT",
             "ko-KR", "pl-PL", "pt-BR", "ru-RU", "th-TH", "tr-TR", "vi-VN", "zh-CN", "zh-TW"]

# The plain Lifmunk Effigy (base relic) plus two pal-skinned effigies: Lamball
# (SheepBall) on the main map, Cattiva (PinkCat) in Sakurajima/WorldTree.
PARSED = {
    "bounds": {
        "MainWorld": {"min": {"X": -1099400, "Y": -724400}, "max": {"X": 349400, "Y": 724400}},
        "WorldTree": {"min": {"X": 347351.5, "Y": -818197}, "max": {"X": 689148.5, "Y": -476400}},
    },
    "pois": [
        {"subtype": "lifmunkEffigy", "sourceName": "R_1", "location": {"X": 0, "Y": 0, "Z": 0}},
        {"subtype": "effigySheepBall", "sourceName": "S_1", "location": {"X": 100, "Y": 100, "Z": 0},
         "effigyPal": "SheepBall"},
        {"subtype": "effigySheepBall", "sourceName": "S_2", "location": {"X": 200, "Y": 200, "Z": 0},
         "effigyPal": "SheepBall"},
        {"subtype": "effigyPinkCat", "sourceName": "S_3", "location": {"X": 500000, "Y": -600000, "Z": 0},
         "effigyPal": "PinkCat"},
    ],
    "bosses": [],
    "palSpawns": [],
    "namesByLang": {
        lng: {"SheepBall": f"{lng} SheepBall", "PinkCat": f"{lng} PinkCat"} for lng in LANGUAGES
    },
    "palMeta": {
        "SheepBall": {"zukanIndex": 2, "zukanIndexSuffix": ""},
        "PinkCat": {"zukanIndex": 3, "zukanIndexSuffix": ""},
    },
    "palIcons": ["T_SheepBall_icon_normal", "T_PinkCat_icon_normal"],
    # SheepBall gets an official effigy item name in every language; PinkCat is
    # intentionally omitted to exercise the pal-name fallback.
    "effigyNames": {
        "effigySheepBall": {lng: f"{lng} Lamball Effigy" for lng in LANGUAGES},
    },
}
PARSED["namesByLang"]["en-US"] = {"SheepBall": "Lamball", "PinkCat": "Cattiva"}
PARSED["effigyNames"]["effigySheepBall"]["en-US"] = "Lamball Effigy"


@pytest.fixture(scope="module")
def ds():
    return build_dataset(PARSED)


def test_effigy_category_holds_lifmunk_plus_per_pal_effigies(ds):
    effigy = next(c for c in ds["types"]["categories"] if c["id"] == "effigy")
    ids = [s["id"] for s in effigy["subtypes"]]
    # Base Lifmunk Effigy first, then pal effigies by ZukanIndex (SheepBall 2 < PinkCat 3).
    assert ids == ["lifmunkEffigy", "effigySheepBall", "effigyPinkCat"]
    # Pal effigies reuse the pal portrait icon.
    assert next(s for s in effigy["subtypes"] if s["id"] == "effigySheepBall")["icon"] == "T_SheepBall_icon_normal"


def test_lifmunk_effigy_recategorized_to_effigy(ds):
    eff = [m for m in ds["markers"]["MainWorld"] if m["subtype"] == "lifmunkEffigy"]
    assert len(eff) == 1
    assert eff[0]["category"] == "effigy"
    assert "pal" not in eff[0]  # base effigy is not pal-linked


def test_pal_effigy_markers_carry_category_and_pal_link(ds):
    pal_effigies = [m for m in ds["markers"]["MainWorld"]
                    if m["category"] == "effigy" and m["subtype"] != "lifmunkEffigy"]
    assert len(pal_effigies) == 2  # two SheepBall effigies on the main map
    assert all(m["subtype"] == "effigySheepBall" and m["pal"] == "SheepBall" for m in pal_effigies)
    # PinkCat effigy lands on Sakurajima (WorldTree).
    pink = [m for m in ds["markers"]["WorldTree"] if m["subtype"] == "effigyPinkCat"]
    assert len(pink) == 1 and pink[0]["pal"] == "PinkCat"


def test_effigy_subtype_named_from_item_name_with_pal_fallback(ds):
    subs = ds["locales"]["en-US"]["types"]["subtypes"]
    # SheepBall uses the official effigy item name...
    assert subs["effigySheepBall"]["name"] == "Lamball Effigy"
    # ...PinkCat has no item name, so it falls back to the pal name.
    assert subs["effigyPinkCat"]["name"] == "Cattiva"
    for lng in LANGUAGES:
        assert ds["locales"][lng]["types"]["subtypes"]["effigySheepBall"]["name"]
        assert ds["locales"][lng]["types"]["subtypes"]["effigyPinkCat"]["name"]
    # The category itself is localized in every language.
    for lng in LANGUAGES:
        assert ds["locales"][lng]["types"]["categories"]["effigy"]["name"]

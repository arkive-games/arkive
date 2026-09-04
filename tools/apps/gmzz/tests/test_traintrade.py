from gmzz.traintrade import TABLES


def test_traintrade_exports_the_economy_and_run_tables():
    assert set(TABLES) == {
        "TrainTradeGoodsData",
        "TrainTradeGoodsTypeNameData",
        "TrainTradeGoodsPriceData",
        "TrainTradeContractData",
        "TrainTradeQuestData",
        "TrainTradeConstData",
        "TrainDifficultyData",
        "TrainMapGenerationData",
        "TrainStationTypeData",
        "TrainStrategyCardData",
        "TrainUpgradeData",
    }

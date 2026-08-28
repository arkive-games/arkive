import { getGmzzDataBaseUrl, getGmzzResourceBaseUrl } from "@/lib/url";

export type TrainTradeGoods = {
  id: number;
  name: string;
  description: string;
  stationDescription: string;
  buyStations: string;
  sellStations: string;
  type: string;
  category: "ART" | "CLOTH" | "CRAFTS" | "FOOD" | "WINE";
  typeDescription: string;
  level: number;
  quality: number;
  baseBuyPrice: number;
  baseSellPrice: number;
  leftoverSellPrice: number;
  systemItemId: number;
};

type RawGoods = {
  BaseBuyPrice: number;
  BaseSellPrice: number;
  GoodsDesc?: string;
  GoodsDescStation?: string;
  GoodsLevel: number;
  GoodsNameTextID: string;
  GoodsType: string;
  ID: number;
  LeftOverSellPrice: number;
  Quality: number;
  SystemItemID: number;
};

type RawGoodsTypes = Record<string, { GoodsTypeDesc?: string }>;

export type TrainTradeStation = "wine" | "food" | "art";
export type TrainTradePriceRange = { buy: [number, number]; sell: [number, number] };
export type TrainTradePrices = Record<TrainTradeStation, TrainTradePriceRange>;

type RawPrice = { BuyPriceRange: [number, number]; SellPriceRange: [number, number] };
type RawPriceTable = Record<string, Record<string, RawPrice>>;

const stripMarkup = (value: string | undefined) =>
  (value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

function dataUrl(file: string) {
  return `${getGmzzDataBaseUrl()}/traintrade/${file}`;
}

async function loadGoodsAndTypes() {
  const [goodsResponse, typesResponse] = await Promise.all([
    fetch(dataUrl("goods.json")),
    fetch(dataUrl("goods_types.json")),
  ]);
  if (!goodsResponse.ok || !typesResponse.ok) {
    throw new Error(`Unable to load Train Tycoon goods (${goodsResponse.status}/${typesResponse.status})`);
  }
  const [goods, types] = await Promise.all([
    goodsResponse.json() as Promise<RawGoods[]>,
    typesResponse.json() as Promise<RawGoodsTypes>,
  ]);
  if (!Array.isArray(goods) || !types || typeof types !== "object") {
    throw new Error("Invalid Train Tycoon goods data");
  }
  return { goods, types };
}

export function trainTradeIconUrl(systemItemId: number) {
  return `${getGmzzResourceBaseUrl()}/${systemItemId}.webp`;
}

export async function loadTrainTradeGoods(): Promise<TrainTradeGoods[]> {
  const { goods, types } = await loadGoodsAndTypes();
  return goods.map((entry) => {
    const stationValues = [...(entry.GoodsDescStation ?? "").matchAll(/<LightHighlight>(.*?)<\/>/g)]
      .map((match) => stripMarkup(match[1]));

    return {
      id: entry.ID,
      name: entry.GoodsNameTextID,
      description: stripMarkup(entry.GoodsDesc),
      stationDescription: stripMarkup(entry.GoodsDescStation),
      buyStations: stationValues[0] ?? "",
      sellStations: stationValues[1] ?? "",
      type: entry.GoodsType,
      category: entry.GoodsType.replace(/^HIGH_/, "") as TrainTradeGoods["category"],
      typeDescription: types[entry.GoodsType]?.GoodsTypeDesc ?? entry.GoodsType,
      level: entry.GoodsLevel,
      quality: entry.Quality,
      baseBuyPrice: entry.BaseBuyPrice,
      baseSellPrice: entry.BaseSellPrice,
      leftoverSellPrice: entry.LeftOverSellPrice,
      systemItemId: entry.SystemItemID,
    };
  });
}

export async function loadTrainTradePrices(): Promise<Record<number, TrainTradePrices>> {
  const response = await fetch(dataUrl("prices.json"));
  if (!response.ok) throw new Error(`Unable to load Train Tycoon prices (${response.status})`);
  const tables = await response.json() as RawPriceTable[];
  if (!Array.isArray(tables)) throw new Error("Invalid Train Tycoon prices data");
  return Object.fromEntries(tables.map((table, index) => {
    const get = (key: string, id: string): TrainTradePriceRange => {
      const row = table[key]?.[id] ?? { BuyPriceRange: [1, 1], SellPriceRange: [1, 1] };
      return { buy: row.BuyPriceRange, sell: row.SellPriceRange };
    };
    return [index + 1, {
      wine: get("Wine_Station", "30101"),
      food: get("Food_Station", "30101"),
      art: get("Artwork_Station", "30101"),
    }];
  }));
}

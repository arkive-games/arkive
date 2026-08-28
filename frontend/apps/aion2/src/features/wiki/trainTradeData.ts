import { getGmzzDataBaseUrl, getGmzzResourceBaseUrl } from "@/lib/url";

export type TrainTradeGoods = {
  id: number;
  name: string;
  description: string;
  stationDescription: string;
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

const stripMarkup = (value: string | undefined) =>
  (value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

function dataUrl(file: string) {
  return `${getGmzzDataBaseUrl()}/traintrade/${file}`;
}

export function trainTradeIconUrl(systemItemId: number) {
  return `${getGmzzResourceBaseUrl()}/${systemItemId}.webp`;
}

export async function loadTrainTradeGoods(): Promise<TrainTradeGoods[]> {
  const [goodsResponse, typesResponse] = await Promise.all([
    fetch(dataUrl("goods.json")),
    fetch(dataUrl("goods_types.json")),
  ]);
  if (!goodsResponse.ok || !typesResponse.ok) {
    throw new Error(`Unable to load Train Tycoon goods (${goodsResponse.status}/${typesResponse.status})`);
  }
  const [goods, types] = (await Promise.all([
    goodsResponse.json() as Promise<RawGoods[]>,
    typesResponse.json() as Promise<RawGoodsTypes>,
  ]));
  if (!Array.isArray(goods) || !types || typeof types !== "object") {
    throw new Error("Invalid Train Tycoon goods data");
  }
  return goods.map((entry) => ({
    id: entry.ID,
    name: entry.GoodsNameTextID,
    description: stripMarkup(entry.GoodsDesc),
    stationDescription: stripMarkup(entry.GoodsDescStation),
    type: entry.GoodsType,
    category: entry.GoodsType.replace(/^HIGH_/, "") as TrainTradeGoods["category"],
    typeDescription: types[entry.GoodsType]?.GoodsTypeDesc ?? entry.GoodsType,
    level: entry.GoodsLevel,
    quality: entry.Quality,
    baseBuyPrice: entry.BaseBuyPrice,
    baseSellPrice: entry.BaseSellPrice,
    leftoverSellPrice: entry.LeftOverSellPrice,
    systemItemId: entry.SystemItemID,
  }));
}

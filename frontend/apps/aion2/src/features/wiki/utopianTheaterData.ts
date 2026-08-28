import { getStaticUrl } from "@/lib/url";

export type UtopianPoolId =
  | "all"
  | "general"
  | "sun"
  | "dreamer"
  | "fool"
  | "door"
  | "giant"
  | "hermit";

export type UtopianMemoryFragment = {
  cardId: number;
  quality: 1 | 2 | 3;
  tag: string;
  pool: string;
  name: string;
  description: string;
  nameTextId: string;
  descriptionTextId: string;
  buffId: number;
  mutexCardIds: number[];
};

export const UTOPIAN_POOLS: Array<{
  id: UtopianPoolId;
  source: string;
}> = [
  { id: "all", source: "" },
  { id: "general", source: "全途径通用" },
  { id: "sun", source: "太阳途径" },
  { id: "dreamer", source: "空想家途径" },
  { id: "fool", source: "愚者途径" },
  { id: "door", source: "门途径" },
  { id: "giant", source: "黄昏巨人途径" },
  { id: "hermit", source: "隐者途径" },
];

export async function loadUtopianTheaterData(): Promise<UtopianMemoryFragment[]> {
  const response = await fetch(getStaticUrl("utopian-theater-memory-fragments.json"));
  if (!response.ok) {
    throw new Error(`Unable to load Utopian Theater data (${response.status})`);
  }
  const payload: unknown = await response.json();
  if (!Array.isArray(payload)) throw new Error("Invalid Utopian Theater data");
  return payload as UtopianMemoryFragment[];
}

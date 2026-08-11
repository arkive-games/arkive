import { useEffect } from "react";

import {
  defineMemoryRecord,
  memoryPolicy,
  useMemoryState,
} from "@gamemap/state-memory";

export const WIKI_TYPES = ["quest", "npc", "item"] as const;
export type WikiType = (typeof WIKI_TYPES)[number];

export interface WikiRecentEntry {
  type: WikiType;
  id: number;
  timestamp: number;
}

const recentEntriesRecord = defineMemoryRecord({
  id: "recent-entries",
  namespace: "aion2",
  surface: "wiki",
  ...memoryPolicy.recentActivity("clear-recent-wiki-entries"),
  schemaVersion: "1.0.0",
  defaultValue: () => [] as WikiRecentEntry[],
  validate: (value: unknown): value is WikiRecentEntry[] =>
    Array.isArray(value) &&
    value.length <= 8 &&
    value.every(
      (entry) =>
        Boolean(entry) &&
        typeof entry === "object" &&
        WIKI_TYPES.includes((entry as WikiRecentEntry).type) &&
        Number.isFinite((entry as WikiRecentEntry).id) &&
        Number.isFinite((entry as WikiRecentEntry).timestamp),
    ),
});

export function useWikiRecentEntries() {
  return useMemoryState(recentEntriesRecord);
}

export function useRememberWikiEntry(type: WikiType, id?: number) {
  const [, setRecentEntries] = useWikiRecentEntries();

  useEffect(() => {
    if (id === undefined) return;
    setRecentEntries((entries) => [
      { type, id, timestamp: Date.now() },
      ...entries.filter((entry) => entry.type !== type || entry.id !== id),
    ].slice(0, 5));
  }, [id, setRecentEntries, type]);
}

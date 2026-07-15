import { getDataBaseUrl } from "@/lib/url";

function dataFileUrl(cleaned: string): string {
  const base = getDataBaseUrl();
  // Prod: <VITE_DATA_BASE_URL>/<path>. Dev: /data/<path> (proxied).
  return base ? `${base}/${cleaned}` : `/data/${cleaned}`;
}

// Data-artifact content version (version.json, stamped by tools). Preferred
// over the frontend build commit as the cache-buster because the data repo
// deploys independently of the frontend: a data-only deploy changes the
// version (browsers re-fetch immediately) without a frontend rebuild.
let versionPromise: Promise<string | undefined> | undefined;

function getDataVersion(): Promise<string | undefined> {
  versionPromise ??= fetch(dataFileUrl("version.json"), { cache: "no-cache" })
    .then((res) => (res.ok ? (res.json() as Promise<{ version?: unknown }>) : undefined))
    .then((v) =>
      typeof v?.version === "string" && v.version ? v.version : undefined,
    )
    .catch(() => undefined);
  return versionPromise;
}

/**
 * Load a generated-game-dataset file from the `data/` repo (JSON).
 * `rel` is e.g. "data/maps.json" or "data/markers/World_L_A.json".
 * - Prod: `VITE_DATA_BASE_URL` host (the leading `data/` is the on-host path).
 * - Dev: Vite serves the sibling `data/` repo at `/data` (see vite.config.ts).
 */
export async function loadGameData<T>(rel: string): Promise<T> {
  const cleaned = rel.replace(/^\/+/, "").replace(/^data\//, "");
  const url = dataFileUrl(cleaned);
  // ?v=<artifact version>; unstamped artifact → fall back to the frontend
  // build commit (busts on frontend deploys only, the pre-version behavior).
  const v = await getDataVersion();
  const res = await fetch(v ? `${url}?v=${v}` : `${url}?build=${__BUILD_GIT_COMMIT__}`);
  if (!res.ok)
    throw new Error(`Failed to load ${url}: ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

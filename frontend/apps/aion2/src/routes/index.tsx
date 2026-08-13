import { createFileRoute } from "@tanstack/react-router";
import MapRoute from "@/features/map/MapRoute";

/** Search params this route accepts. */
interface MapSearch {
  /** Map to open, by name — e.g. a wiki quest's "seen on this map" link. */
  map?: string;
  /** Initial search-panel query. */
  q?: string;
  /** Marker to select on load. */
  marker?: string;
  /** Position to fly to, "x,y". */
  pos?: string;
}

const str = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

/**
 * TanStack strips any search param a route does not validate, so this list has to
 * be exhaustive: `map`/`q`/`marker`/`pos` are read straight off `window.location`
 * (see lib/url `getQueryParam`) rather than through the router, so nothing else
 * declares them and dropping them here would quietly break every deep link into
 * the map.
 */
export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): MapSearch => ({
    map: str(search.map),
    q: str(search.q),
    marker: str(search.marker),
    pos: str(search.pos),
  }),
  component: () => <MapRoute />,
});

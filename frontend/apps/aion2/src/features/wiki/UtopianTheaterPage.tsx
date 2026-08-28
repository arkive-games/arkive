import { useEffect, useMemo, useState, type ReactNode } from "react";
import { IconDatabase, IconInfoCircle, IconSearch, IconSparkles } from "@tabler/icons-react";
import { Grid2X2, List } from "lucide-react";
import { Input } from "@gamemap/ui";
import { useTranslation } from "react-i18next";

import {
  loadUtopianTheaterData,
  UTOPIAN_POOLS,
  type UtopianMemoryFragment,
  type UtopianPoolId,
} from "@/features/wiki/utopianTheaterData";

const QUALITY_OPTIONS = ["all", "1", "2", "3"] as const;
type QualityFilter = (typeof QUALITY_OPTIONS)[number];
type ViewMode = "grid" | "list";

const QUALITY_CLASS: Record<number, string> = {
  1: "border-slate-300/70 bg-slate-500/10 text-slate-700 dark:text-slate-200",
  2: "border-sky-400/60 bg-sky-500/10 text-sky-700 dark:text-sky-200",
  3: "border-amber-400/70 bg-amber-500/10 text-amber-700 dark:text-amber-200",
};

export default function UtopianTheaterPage() {
  const { t } = useTranslation("wiki");
  const [entries, setEntries] = useState<UtopianMemoryFragment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [pool, setPool] = useState<UtopianPoolId>("all");
  const [quality, setQuality] = useState<QualityFilter>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<ViewMode>("grid");

  useEffect(() => {
    let live = true;
    loadUtopianTheaterData()
      .then((data) => {
        if (live) setEntries(data);
      })
      .catch((cause) => {
        console.error(cause);
        if (live) setError(true);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    document.title = `${t("utopianTheater.title")} - ${t("utopianTheater.siteTitle")}`;
  }, [t]);

  const counts = useMemo(
    () =>
      UTOPIAN_POOLS.reduce<Record<UtopianPoolId, number>>(
        (result, option) => {
          result[option.id] =
            option.id === "all"
              ? entries.length
              : entries.filter((entry) => entry.pool === option.source).length;
          return result;
        },
        { all: 0, general: 0, sun: 0, dreamer: 0, fool: 0, door: 0, giant: 0, hermit: 0 },
      ),
    [entries],
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return entries.filter((entry) => {
      const matchesPool =
        pool === "all" || entry.pool === UTOPIAN_POOLS.find((option) => option.id === pool)?.source;
      const matchesQuality = quality === "all" || entry.quality === Number(quality);
      const matchesQuery =
        !needle ||
        `${entry.name} ${entry.description} ${entry.tag}`.toLocaleLowerCase().includes(needle);
      return matchesPool && matchesQuality && matchesQuery;
    });
  }, [entries, pool, quality, query]);

  if (loading) {
    return (
      <div className="space-y-5" role="status" aria-label={t("common.loading")} data-testid="utopian-theater-loading">
        <div className="h-28 animate-pulse rounded-md bg-muted" />
        <div className="h-11 animate-pulse rounded-md bg-muted" />
        <div className="h-96 animate-pulse rounded-md bg-muted" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-muted-foreground">{t("utopianTheater.loadError")}</p>;
  }

  return (
    <div data-testid="utopian-theater-page" className="space-y-5">
      <header className="border-b border-border pb-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--arkive-nav-accent)]">
              <IconSparkles className="size-4" stroke={1.8} aria-hidden />
              <span>{t("utopianTheater.eyebrow")}</span>
            </div>
            <h1 className="text-2xl font-bold text-[color:var(--arkive-nav-active)] md:text-3xl">
              {t("utopianTheater.title")}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              {t("utopianTheater.description", { count: entries.length })}
            </p>
            <p className="mt-1 max-w-3xl text-xs text-muted-foreground">
              {t("utopianTheater.dungeonNote")}
            </p>
          </div>
          <dl className="grid grid-cols-3 divide-x divide-border border-y border-border text-center xl:min-w-[22rem]">
            <Stat value={counts.all} label={t("utopianTheater.stats.total")} />
            <Stat value={counts.general} label={t("utopianTheater.stats.general")} />
            <Stat value={UTOPIAN_POOLS.length - 2} label={t("utopianTheater.stats.paths")} />
          </dl>
        </div>
      </header>

      <section
        aria-label={t("utopianTheater.pools")}
        className="space-y-3 rounded-lg border border-border bg-card/50 p-3"
      >
        <FilterRow label={t("utopianTheater.poolLabel")}>
          {UTOPIAN_POOLS.map((option) => (
            <FilterChip
              key={option.id}
              active={pool === option.id}
              onClick={() => setPool(option.id)}
              testId={`utopian-pool-${option.id}`}
            >
              {t(`utopianTheater.pool.${option.id}`)}
              <span className="tabular-nums text-muted-foreground">{counts[option.id]}</span>
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow label={t("utopianTheater.quality")}>
          {QUALITY_OPTIONS.map((value) => (
            <FilterChip
              key={value}
              active={quality === value}
              onClick={() => setQuality(value)}
              testId={`utopian-quality-${value}`}
            >
              {value === "all" ? t("utopianTheater.all") : t("utopianTheater.qualityValue", { value })}
            </FilterChip>
          ))}
        </FilterRow>
      </section>

      <section className="grid gap-3 border-b border-border pb-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
        <label className="relative block">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" stroke={1.8} aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
            placeholder={t("utopianTheater.searchPlaceholder")}
            aria-label={t("utopianTheater.searchLabel")}
            className="h-11 border-border bg-background pl-10 text-sm shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]"
            data-testid="utopian-search"
          />
        </label>
        <span className="text-xs tabular-nums text-muted-foreground lg:justify-self-end">
          {t("utopianTheater.resultCount", { count: filtered.length })}
        </span>
        <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border" role="group" aria-label={t("utopianTheater.view")}>
          <button
            type="button"
            aria-pressed={view === "grid"}
            onClick={() => setView("grid")}
            className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)] ${view === "grid" ? "bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            data-testid="utopian-view-grid"
          >
            <Grid2X2 className="size-4" aria-hidden />
            {t("utopianTheater.viewGrid")}
          </button>
          <button
            type="button"
            aria-pressed={view === "list"}
            onClick={() => setView("list")}
            className={`inline-flex min-h-9 items-center gap-1.5 border-l border-border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)] ${view === "list" ? "bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}
            data-testid="utopian-view-list"
          >
            <List className="size-4" aria-hidden />
            {t("utopianTheater.viewList")}
          </button>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p className="flex items-center gap-2">
          <IconDatabase className="size-4" stroke={1.8} aria-hidden />
          {t("utopianTheater.sourceNote")}
        </p>
        <p className="flex items-center gap-2">
          <IconInfoCircle className="size-4" stroke={1.8} aria-hidden />
          {t("utopianTheater.runtimeNote")}
        </p>
      </div>

      {filtered.length === 0 ? (
        <p className="border-y border-border py-12 text-center text-sm text-muted-foreground">{t("utopianTheater.empty")}</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="utopian-memory-grid">
          {filtered.map((entry) => (
            <article
              key={entry.cardId}
              className="group flex min-w-0 flex-col rounded-md border border-border bg-card p-4 shadow-sm transition hover:border-[color:var(--arkive-nav-accent)] hover:bg-accent/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-[color:var(--arkive-nav-active)]">{entry.name}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">CardID {entry.cardId}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${QUALITY_CLASS[entry.quality]}`}>
                  {t("utopianTheater.qualityValue", { value: entry.quality })}
                </span>
              </div>
              <p className="mt-3 flex-1 text-sm leading-6 text-foreground/90">{entry.description}</p>
              <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3 text-xs text-muted-foreground">
                <span className="rounded-full border border-border bg-muted/30 px-2 py-1">{entry.tag}</span>
                <span className="tabular-nums">BuffID {entry.buffId}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border" data-testid="utopian-memory-list">
          {filtered.map((entry) => (
            <article key={entry.cardId} className="grid gap-3 py-4 md:grid-cols-[8rem_minmax(0,1fr)_auto] md:gap-5">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-[color:var(--arkive-nav-active)]">{entry.name}</h2>
                <p className="mt-1 text-xs text-muted-foreground">CardID {entry.cardId}</p>
              </div>
              <p className="text-sm leading-6 text-foreground/90">{entry.description}</p>
              <div className="flex flex-wrap items-start justify-start gap-2 md:max-w-48 md:justify-end">
                <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${QUALITY_CLASS[entry.quality]}`}>
                  {t("utopianTheater.qualityValue", { value: entry.quality })}
                </span>
                <span className="rounded-full border border-border bg-muted/30 px-2 py-1 text-xs text-muted-foreground">{entry.tag}</span>
                <span className="w-full text-right text-xs tabular-nums text-muted-foreground">BuffID {entry.buffId}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-16 shrink-0 py-1 text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  testId,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testId: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testId}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)] ${
        active
          ? "border-[color:var(--arkive-nav-accent)] bg-[color:var(--arkive-filter-active)] text-foreground"
          : "border-border bg-secondary/40 text-muted-foreground hover:border-[color:var(--arkive-nav-accent)]/60 hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-4 py-3">
      <dd className="text-xl font-semibold tabular-nums text-[color:var(--arkive-nav-active)]">{value.toLocaleString()}</dd>
      <dt className="mt-1 text-xs text-muted-foreground">{label}</dt>
    </div>
  );
}

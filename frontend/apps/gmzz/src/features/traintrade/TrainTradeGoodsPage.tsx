import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  IconGrid3x3,
  IconInfoCircle,
  IconList,
  IconSearch,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { Input } from "@gamemap/ui";
import CatalogPagination from "@/features/traintrade/CatalogPagination";
import { loadTrainTradeGoods, iconFor, type TrainTradeGoods } from "@/features/traintrade/data";

const CATEGORY_OPTIONS = ["all", "WINE", "FOOD", "CLOTH", "ART", "CRAFTS"] as const;
const QUALITY_OPTIONS = ["all", "1", "2", "3", "4", "5", "6"] as const;
type Category = (typeof CATEGORY_OPTIONS)[number];
type Quality = (typeof QUALITY_OPTIONS)[number];
const PAGE_SIZE = 32;

const QUALITY_CLASS: Record<number, string> = {
  1: "text-muted-foreground",
  2: "text-emerald-700 dark:text-emerald-300",
  3: "text-sky-700 dark:text-sky-300",
  4: "text-violet-700 dark:text-violet-300",
  5: "text-amber-700 dark:text-amber-300",
  6: "text-rose-700 dark:text-rose-300",
};

const QUALITY_FRAME_CLASS: Record<number, string> = {
  1: "border-border",
  2: "border-emerald-500/80 dark:border-emerald-600",
  3: "border-sky-500/80 dark:border-sky-600",
  4: "border-violet-500/80 dark:border-violet-600",
  5: "border-amber-500/80 dark:border-amber-600",
  6: "border-rose-500/80 dark:border-rose-600",
};

const QUALITY_RAIL_CLASS: Record<number, string> = {
  1: "bg-muted/35",
  2: "bg-emerald-50 dark:bg-emerald-950/30",
  3: "bg-sky-50 dark:bg-sky-950/30",
  4: "bg-violet-50 dark:bg-violet-950/30",
  5: "bg-amber-50 dark:bg-amber-950/30",
  6: "bg-rose-50 dark:bg-rose-950/30",
};

export default function TrainTradeGoodsPage() {
  const { t } = useTranslation("wiki");
  const [goods, setGoods] = useState<TrainTradeGoods[]>([]);
  const [category, setCategory] = useState<Category>("all");
  const [quality, setQuality] = useState<Quality>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);
  const resultsAnchorRef = useRef<HTMLElement>(null);

  useEffect(() => {
    document.title = `${t("trainTrade.title")} - ${t("utopianTheater.siteTitle")}`;
    let active = true;
    loadTrainTradeGoods()
      .then((entries) => {
        if (active) setGoods(entries);
      })
      .catch((reason) => {
        console.error(reason);
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [t]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    return goods.filter((entry) => {
      if (category !== "all" && entry.category !== category) return false;
      if (quality !== "all" && entry.quality !== Number(quality)) return false;
      if (!normalized) return true;
      return [entry.name, entry.description, entry.stationDescription, entry.type]
        .join(" ")
        .toLocaleLowerCase()
        .includes(normalized);
    });
  }, [category, goods, quality, query]);

  const counts = useMemo(() => {
    const result: Record<Category, number> = { all: goods.length, WINE: 0, FOOD: 0, CLOTH: 0, ART: 0, CRAFTS: 0 };
    for (const entry of goods) result[entry.category] += 1;
    return result;
  }, [goods]);

  const qualityCounts = useMemo(() => {
    const result: Record<Quality, number> = { all: goods.length, "1": 0, "2": 0, "3": 0, "4": 0, "5": 0, "6": 0 };
    for (const entry of goods) {
      const key = String(entry.quality) as Quality;
      if (key in result) result[key] += 1;
    }
    return result;
  }, [goods]);

  const visibleCategories = CATEGORY_OPTIONS.filter((option) => option === "all" || counts[option] > 0);
  const visibleQualities = QUALITY_OPTIONS.filter((option) => option === "all" || qualityCounts[option] > 0);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleGoods = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    window.requestAnimationFrame(() => resultsAnchorRef.current?.scrollIntoView({ block: "start" }));
  };

  if (error) return <p className="text-sm text-muted-foreground">{t("trainTrade.loadError")}</p>;
  if (!goods.length) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;

  return (
    <div className="space-y-3" data-testid="train-trade-page">
      <header className="grid gap-4 border-b border-border pb-4 md:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] md:items-end">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold text-foreground">
            {t("trainTrade.title")}
          </h1>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
            {t("trainTrade.description", { count: goods.length })}
          </p>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t("trainTrade.searchLabel")}</span>
          <span className="relative block">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" stroke={1.8} aria-hidden />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setQuery("");
              }}
              placeholder={t("trainTrade.searchPlaceholder")}
              className="h-10 border-border bg-background pl-9 text-sm shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]"
              data-testid="train-trade-search"
            />
          </span>
        </label>
      </header>

      <section aria-label={t("trainTrade.filters")} className="grid gap-3 border-b border-border pb-3 lg:grid-cols-2 lg:gap-6">
        <FilterGroup label={t("trainTrade.categoryLabel")} hint={t("trainTrade.categoryHint")}>
          {visibleCategories.map((option) => (
            <FilterChip key={option} active={category === option} onClick={() => { setCategory(option); setPage(1); }} testId={`train-trade-category-${option}`}>
              {t(`trainTrade.category.${option}`)}
              <span className="tabular-nums text-muted-foreground">{counts[option]}</span>
            </FilterChip>
          ))}
        </FilterGroup>
        <FilterGroup label={t("trainTrade.qualityLabel")} hint={t("trainTrade.qualityHint")}>
          {visibleQualities.map((option) => (
            <FilterChip key={option} active={quality === option} onClick={() => { setQuality(option); setPage(1); }} testId={`train-trade-quality-${option}`}>
              {option === "all" ? t("trainTrade.all") : t("trainTrade.qualityValue", { value: option })}
              <span className="tabular-nums text-muted-foreground">{qualityCounts[option]}</span>
            </FilterChip>
          ))}
        </FilterGroup>
      </section>

      <section ref={resultsAnchorRef} data-pagination-anchor className="flex min-h-9 scroll-mt-4 items-center justify-between gap-3 border-b border-border pb-2">
        <span className="text-sm tabular-nums text-muted-foreground">{t("trainTrade.resultCount", { count: filtered.length })}</span>
        <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border" role="group" aria-label={t("trainTrade.view")}>
          <ViewButton active={view === "grid"} onClick={() => { setView("grid"); setPage(1); }} label={t("trainTrade.viewGrid")}><IconGrid3x3 className="size-4" aria-hidden /></ViewButton>
          <ViewButton active={view === "list"} onClick={() => { setView("list"); setPage(1); }} label={t("trainTrade.viewList")} bordered><IconList className="size-4" aria-hidden /></ViewButton>
        </div>
      </section>

      {filtered.length === 0 ? (
        <p className="border-y border-border py-12 text-center text-sm text-muted-foreground">{t("trainTrade.empty")}</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" data-testid="train-trade-grid">
          {visibleGoods.map((entry) => <GoodsCard key={entry.id} entry={entry} t={t} />)}
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border" data-testid="train-trade-list">
          {visibleGoods.map((entry) => <GoodsListRow key={entry.id} entry={entry} t={t} />)}
        </div>
      )}

      <CatalogPagination page={currentPage} pageCount={pageCount} onPageChange={changePage} />

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <IconInfoCircle className="size-4 shrink-0" stroke={1.8} aria-hidden />
        {t("trainTrade.sourceNote")}
      </p>
    </div>
  );
}

function GoodsCard({ entry, t }: { entry: TrainTradeGoods; t: (key: string, options?: Record<string, unknown>) => string }) {
  return (
    <article className={`group grid min-w-0 grid-cols-[5.5rem_minmax(0,1fr)] overflow-hidden rounded-md border bg-card transition-colors hover:border-[color:var(--arkive-nav-accent)] ${QUALITY_FRAME_CLASS[entry.quality] ?? QUALITY_FRAME_CLASS[1]}`}>
      <div className={`flex items-center justify-center border-r border-border/70 p-2 ${QUALITY_RAIL_CLASS[entry.quality] ?? QUALITY_RAIL_CLASS[1]}`}>
        <img src={iconFor(entry)} alt="" className="size-full max-h-20 object-contain transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none" loading="lazy" />
      </div>
      <div className="flex min-w-0 flex-col p-2.5">
        <div className="flex min-w-0 items-start justify-between gap-2">
          <h2 className="min-w-0 truncate text-sm font-bold text-foreground" title={entry.name}>{entry.name}</h2>
          <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-muted-foreground">
            {t(`trainTrade.category.${entry.category}`)}
            <QualityBadge quality={entry.quality} t={t} />
          </span>
        </div>
        <p className="mt-1 min-h-10 line-clamp-2 text-xs leading-5 text-foreground/75" title={entry.description}>{entry.description || t("trainTrade.noDescription")}</p>
        <PriceRow entry={entry} t={t} />
        <StationFlow entry={entry} t={t} />
      </div>
    </article>
  );
}

function GoodsListRow({ entry, t }: { entry: TrainTradeGoods; t: (key: string, options?: Record<string, unknown>) => string }) {
  return (
    <article className="grid gap-3 py-3 md:grid-cols-[3.5rem_minmax(0,1fr)_auto] md:items-center md:gap-4">
      <div className="flex size-14 items-center justify-center rounded-md border border-border bg-muted/30 p-2"><img src={iconFor(entry)} alt="" className="size-full object-contain" loading="lazy" /></div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold text-[color:var(--arkive-nav-active)]">{entry.name}</h2><QualityBadge quality={entry.quality} t={t} /></div>
        <p className="mt-0.5 text-xs text-muted-foreground">{t(`trainTrade.category.${entry.category}`)} · {t("trainTrade.levelValue", { value: entry.level })}</p>
        <p className="mt-1 text-sm leading-6 text-foreground/90">{entry.description || t("trainTrade.noDescription")}</p>
        <StationFlow entry={entry} t={t} compact />
      </div>
      <PriceRow entry={entry} t={t} compact />
    </article>
  );
}

function StationFlow({ entry, t, compact = false }: { entry: TrainTradeGoods; t: (key: string, options?: Record<string, unknown>) => string; compact?: boolean }) {
  if (!entry.buyStations && !entry.sellStations) return null;

  return (
    <div className={`${compact ? "mt-2 max-w-md" : "mt-2"} grid grid-cols-2 gap-2 border-t border-border/70 pt-2`} title={entry.stationDescription}>
      <StationValue label={t("trainTrade.buyStations")} value={entry.buyStations} />
      <StationValue label={t("trainTrade.sellStations")} value={entry.sellStations} />
    </div>
  );
}

function StationValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-xs text-muted-foreground">{label}</span>
      <strong className="mt-0.5 block truncate text-xs font-semibold text-[color:var(--arkive-nav-active)]">{value || "-"}</strong>
    </div>
  );
}

function PriceRow({ entry, t, compact = false }: { entry: TrainTradeGoods; t: (key: string, options?: Record<string, unknown>) => string; compact?: boolean }) {
  return <div className={`mt-2 grid ${compact ? "min-w-48 border-y border-border" : "border-t border-border/70"} grid-cols-3 divide-x divide-border/70 text-center sm:divide-x-0`}>
    <Price value={entry.baseBuyPrice} label={t("trainTrade.buyPrice")} shortLabel={t("trainTrade.buyPriceShort")} />
    <Price value={entry.baseSellPrice} label={t("trainTrade.sellPrice")} shortLabel={t("trainTrade.sellPriceShort")} />
    <Price value={entry.leftoverSellPrice} label={t("trainTrade.leftoverPrice")} shortLabel={t("trainTrade.leftoverPriceShort")} />
  </div>;
}

function Price({ value, label, shortLabel }: { value: number; label: string; shortLabel: string }) {
  return <div className="flex min-w-0 flex-col items-center px-0.5 py-1.5 sm:flex-row sm:justify-center sm:gap-1"><span className="block truncate text-xs text-muted-foreground sm:hidden">{shortLabel}</span><span className="hidden truncate text-xs text-muted-foreground sm:block">{label}</span><strong className="block text-sm tabular-nums">{value}</strong></div>;
}

function QualityBadge({ quality, t }: { quality: number; t: (key: string, options?: Record<string, unknown>) => string }) {
  return <span className={`shrink-0 text-xs font-semibold ${QUALITY_CLASS[quality] ?? QUALITY_CLASS[1]}`}>{t("trainTrade.qualityValue", { value: quality })}</span>;
}

function FilterGroup({ label, hint, children }: { label: string; hint: string; children: ReactNode }) {
  return <div className="min-w-0"><div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><h2 className="text-sm font-bold text-foreground">{label}</h2><span className="text-xs text-muted-foreground">{hint}</span></div><div className="flex min-w-0 flex-wrap items-center gap-1.5">{children}</div></div>;
}

function FilterChip({ active, onClick, testId, children }: { active: boolean; onClick: () => void; testId: string; children: ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} data-testid={testId} className={`inline-flex min-h-8 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)] ${active ? "border-[color:var(--arkive-nav-accent)] bg-[color:var(--arkive-filter-active)] text-foreground" : "border-border bg-background text-muted-foreground hover:border-[color:var(--arkive-nav-accent)]/60 hover:text-foreground"}`}>{children}</button>;
}

function ViewButton({ active, bordered = false, onClick, label, children }: { active: boolean; bordered?: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return <button type="button" aria-pressed={active} aria-label={label} title={label} onClick={onClick} className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)] ${bordered ? "border-l border-border" : ""} ${active ? "bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>{children}<span>{label}</span></button>;
}

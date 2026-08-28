import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  IconCoins,
  IconGrid3x3,
  IconInfoCircle,
  IconList,
  IconMapPin,
  IconSearch,
  IconTrain,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";

import { Input } from "@gamemap/ui";
import { loadTrainTradeGoods, trainTradeIconUrl, type TrainTradeGoods } from "@/features/wiki/trainTradeData";

const CATEGORY_OPTIONS = ["all", "WINE", "FOOD", "CLOTH", "ART", "CRAFTS"] as const;
const QUALITY_OPTIONS = ["all", "1", "2", "3", "4", "5", "6"] as const;
type Category = (typeof CATEGORY_OPTIONS)[number];
type Quality = (typeof QUALITY_OPTIONS)[number];

const QUALITY_CLASS: Record<number, string> = {
  1: "border-border text-muted-foreground",
  2: "border-sky-500/50 text-sky-700 dark:text-sky-300",
  3: "border-violet-500/50 text-violet-700 dark:text-violet-300",
  4: "border-amber-500/60 text-amber-700 dark:text-amber-300",
  5: "border-orange-500/60 text-orange-700 dark:text-orange-300",
  6: "border-red-500/60 text-red-700 dark:text-red-300",
};

export default function TrainTradeGoodsPage() {
  const { t } = useTranslation("wiki");
  const [goods, setGoods] = useState<TrainTradeGoods[]>([]);
  const [category, setCategory] = useState<Category>("all");
  const [quality, setQuality] = useState<Quality>("all");
  const [query, setQuery] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [error, setError] = useState(false);

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

  if (error) return <p className="text-sm text-muted-foreground">{t("trainTrade.loadError")}</p>;
  if (!goods.length) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;

  return (
    <div className="space-y-5" data-testid="train-trade-page">
      <header className="border-b border-border pb-5">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="min-w-0 max-w-3xl">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--arkive-nav-accent)]">
              <IconTrain className="size-4" stroke={1.8} aria-hidden />
              {t("trainTrade.eyebrow")}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[color:var(--arkive-nav-active)] md:text-3xl">
              {t("trainTrade.title")}
            </h1>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{t("trainTrade.description", { count: goods.length })}</p>
          </div>
          <dl className="grid min-w-full grid-cols-3 divide-x divide-border border-y border-border text-center sm:min-w-[21rem]">
            <Stat value={goods.length} label={t("trainTrade.stats.total")} />
            <Stat value={CATEGORY_OPTIONS.length - 1} label={t("trainTrade.stats.categories")} />
            <Stat value={Math.max(...goods.map((entry) => entry.quality))} label={t("trainTrade.stats.quality")} />
          </dl>
        </div>
      </header>

      <section aria-label={t("trainTrade.filters")} className="space-y-3 rounded-lg border border-border bg-card/50 p-3">
        <FilterRow label={t("trainTrade.categoryLabel")}>
          {CATEGORY_OPTIONS.map((option) => (
            <FilterChip key={option} active={category === option} onClick={() => setCategory(option)} testId={`train-trade-category-${option}`}>
              {t(`trainTrade.category.${option}`)}
              <span className="tabular-nums text-muted-foreground">{counts[option]}</span>
            </FilterChip>
          ))}
        </FilterRow>
        <FilterRow label={t("trainTrade.qualityLabel")}>
          {QUALITY_OPTIONS.map((option) => (
            <FilterChip key={option} active={quality === option} onClick={() => setQuality(option)} testId={`train-trade-quality-${option}`}>
              {option === "all" ? t("trainTrade.all") : t("trainTrade.qualityValue", { value: option })}
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
            placeholder={t("trainTrade.searchPlaceholder")}
            aria-label={t("trainTrade.searchLabel")}
            className="h-11 border-border bg-background pl-10 text-sm shadow-none focus-visible:ring-[color:var(--arkive-nav-accent)]"
            data-testid="train-trade-search"
          />
        </label>
        <span className="text-xs tabular-nums text-muted-foreground lg:justify-self-end">{t("trainTrade.resultCount", { count: filtered.length })}</span>
        <div className="inline-flex shrink-0 overflow-hidden rounded-md border border-border" role="group" aria-label={t("trainTrade.view")}>
          <ViewButton active={view === "grid"} onClick={() => setView("grid")} label={t("trainTrade.viewGrid")}><IconGrid3x3 className="size-4" aria-hidden /></ViewButton>
          <ViewButton active={view === "list"} onClick={() => setView("list")} label={t("trainTrade.viewList")} bordered><IconList className="size-4" aria-hidden /></ViewButton>
        </div>
      </section>

      {filtered.length === 0 ? (
        <p className="border-y border-border py-12 text-center text-sm text-muted-foreground">{t("trainTrade.empty")}</p>
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" data-testid="train-trade-grid">
          {filtered.map((entry) => <GoodsCard key={entry.id} entry={entry} t={t} />)}
        </div>
      ) : (
        <div className="divide-y divide-border border-y border-border" data-testid="train-trade-list">
          {filtered.map((entry) => <GoodsListRow key={entry.id} entry={entry} t={t} />)}
        </div>
      )}

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <IconInfoCircle className="size-4 shrink-0" stroke={1.8} aria-hidden />
        {t("trainTrade.sourceNote")}
      </p>
    </div>
  );
}

function GoodsCard({ entry, t }: { entry: TrainTradeGoods; t: (key: string, options?: Record<string, unknown>) => string }) {
  return (
    <article className="group flex min-w-0 flex-col rounded-md border border-border bg-card p-4 shadow-sm transition hover:border-[color:var(--arkive-nav-accent)] hover:bg-accent/40">
      <div className="flex gap-3">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-md border border-border bg-muted/30 p-2">
          <img src={trainTradeIconUrl(entry.systemItemId)} alt="" className="size-full object-contain" loading="lazy" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="truncate text-base font-semibold text-[color:var(--arkive-nav-active)]">{entry.name}</h2>
            <QualityBadge quality={entry.quality} t={t} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t(`trainTrade.category.${entry.category}`)} · {t("trainTrade.levelValue", { value: entry.level })}</p>
        </div>
      </div>
      <p className="mt-3 min-h-12 flex-1 text-sm leading-6 text-foreground/90">{entry.description || t("trainTrade.noDescription")}</p>
      <PriceRow entry={entry} t={t} />
      {entry.stationDescription && <p className="mt-3 flex items-start gap-2 border-t border-border/70 pt-3 text-xs leading-5 text-muted-foreground"><IconMapPin className="mt-0.5 size-4 shrink-0" stroke={1.8} aria-hidden />{entry.stationDescription}</p>}
    </article>
  );
}

function GoodsListRow({ entry, t }: { entry: TrainTradeGoods; t: (key: string, options?: Record<string, unknown>) => string }) {
  return (
    <article className="grid gap-3 py-4 md:grid-cols-[4rem_minmax(0,1fr)_auto] md:items-center md:gap-5">
      <div className="flex size-16 items-center justify-center rounded-md border border-border bg-muted/30 p-2"><img src={trainTradeIconUrl(entry.systemItemId)} alt="" className="size-full object-contain" loading="lazy" /></div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2"><h2 className="text-base font-semibold text-[color:var(--arkive-nav-active)]">{entry.name}</h2><QualityBadge quality={entry.quality} t={t} /></div>
        <p className="mt-1 text-sm text-muted-foreground">{t(`trainTrade.category.${entry.category}`)} · {t("trainTrade.levelValue", { value: entry.level })}</p>
        <p className="mt-2 text-sm leading-6 text-foreground/90">{entry.description || t("trainTrade.noDescription")}</p>
      </div>
      <PriceRow entry={entry} t={t} compact />
    </article>
  );
}

function PriceRow({ entry, t, compact = false }: { entry: TrainTradeGoods; t: (key: string, options?: Record<string, unknown>) => string; compact?: boolean }) {
  return <div className={`mt-4 grid ${compact ? "min-w-48" : ""} grid-cols-3 divide-x divide-border border-y border-border text-center`}>
    <Price value={entry.baseBuyPrice} label={t("trainTrade.buyPrice")} />
    <Price value={entry.baseSellPrice} label={t("trainTrade.sellPrice")} />
    <Price value={entry.leftoverSellPrice} label={t("trainTrade.leftoverPrice")} />
  </div>;
}

function Price({ value, label }: { value: number; label: string }) {
  return <div className="px-2 py-2"><strong className="flex items-center justify-center gap-1 text-sm tabular-nums"><IconCoins className="size-3.5 text-[color:var(--arkive-nav-accent)]" stroke={1.8} aria-hidden />{value}</strong><span className="mt-1 block text-xs text-muted-foreground">{label}</span></div>;
}

function QualityBadge({ quality, t }: { quality: number; t: (key: string, options?: Record<string, unknown>) => string }) {
  return <span className={`shrink-0 rounded-full border px-2 py-1 text-xs font-semibold ${QUALITY_CLASS[quality] ?? QUALITY_CLASS[1]}`}>{t("trainTrade.qualityValue", { value: quality })}</span>;
}

function FilterRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="flex items-start gap-2"><span className="w-16 shrink-0 py-1 text-xs font-semibold text-muted-foreground">{label}</span><div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">{children}</div></div>;
}

function FilterChip({ active, onClick, testId, children }: { active: boolean; onClick: () => void; testId: string; children: ReactNode }) {
  return <button type="button" onClick={onClick} aria-pressed={active} data-testid={testId} className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)] ${active ? "border-[color:var(--arkive-nav-accent)] bg-[color:var(--arkive-filter-active)] text-foreground" : "border-border bg-secondary/40 text-muted-foreground hover:border-[color:var(--arkive-nav-accent)]/60 hover:text-foreground"}`}>{children}</button>;
}

function ViewButton({ active, bordered = false, onClick, label, children }: { active: boolean; bordered?: boolean; onClick: () => void; label: string; children: ReactNode }) {
  return <button type="button" aria-pressed={active} aria-label={label} title={label} onClick={onClick} className={`inline-flex min-h-9 items-center gap-1.5 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--arkive-nav-accent)] ${bordered ? "border-l border-border" : ""} ${active ? "bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]" : "text-muted-foreground hover:bg-accent hover:text-foreground"}`}>{children}<span className="sr-only">{label}</span></button>;
}

function Stat({ value, label }: { value: number; label: string }) {
  return <div className="px-4 py-3"><dd className="text-xl font-semibold tabular-nums text-[color:var(--arkive-nav-active)]">{value.toLocaleString()}</dd><dt className="mt-1 text-xs text-muted-foreground">{label}</dt></div>;
}

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  IconArrowBackUp,
  IconArrowRight,
  IconChevronLeft,
  IconChevronRight,
  IconRefresh,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { ContentPage } from "@/components/ContentPage";
import {
  loadTrainTradeRouteProfiles,
  loadTrainTradeStrategyCards,
  type TrainTradeStrategyCard,
} from "@/features/traintrade/data";
import StrategyCardPicker, { type StrategySelections } from "@/features/traintrade/StrategyCardPicker";
import {
  stationTotalsEqual,
  type TrainTradeDifficultyId,
  type TrainTradeRouteProfile,
} from "@/features/traintrade/routeProfiles";
import {
  HINT_IDS,
  STATION_TYPES,
  createRouteModel,
  getAvailableHints,
  getConfirmedStations,
  probabilityFor,
  prospectiveRouteCount,
  refineRouteModel,
  roundedProbabilities,
  type ConfirmedStep,
  type HintId,
  type RouteModel,
  type StationTotals,
  type StationType,
} from "@/features/traintrade/stationSolver";

const EMPTY_TOTALS: StationTotals = { winery: 0, food: 0, trade: 0 };

const STATION_KEY: Record<StationType, string> = {
  winery: "trainTrade.station.wine",
  food: "trainTrade.station.food",
  trade: "trainTrade.station.art",
};

const SELECTED_TONE = "border-ring bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)] shadow-[inset_0_-0.15rem_0_var(--ring)]";

export default function TrainTradeStationToolPage() {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<TrainTradeRouteProfile[] | null>(null);
  const [strategyCards, setStrategyCards] = useState<TrainTradeStrategyCard[] | null>(null);
  const [strategyError, setStrategyError] = useState(false);
  const [dataError, setDataError] = useState(false);
  const [difficulty, setDifficulty] = useState<TrainTradeDifficultyId | "">("");
  const [totals, setTotals] = useState<StationTotals>(EMPTY_TOTALS);
  const [quotaConfirmed, setQuotaConfirmed] = useState(false);
  const [originHint, setOriginHint] = useState<HintId | "">("");
  const [steps, setSteps] = useState<ConfirmedStep[]>([]);
  const [pendingCurrent, setPendingCurrent] = useState<StationType | "">("");
  const [pendingHint, setPendingHint] = useState<HintId | "">("");
  const [stationOffset, setStationOffset] = useState<number | null>(null);
  const [strategySelections, setStrategySelections] = useState<StrategySelections>([null, null, null]);
  const [selectedStrategy, setSelectedStrategy] = useState<number | null>(null);
  const [strategyHistory, setStrategyHistory] = useState<StrategySelections[]>([]);

  const difficultyProfile = profiles?.find((item) => item.id === difficulty);
  const stationCount = difficultyProfile?.stops ?? 0;
  const quotaTotal = STATION_TYPES.reduce((sum, type) => sum + totals[type], 0);
  const quotaValid = Boolean(difficultyProfile?.variants.some((variant) => stationTotalsEqual(variant, totals)));

  useEffect(() => {
    document.title = `${t("trainTrade.stationTool.title")} - ${t("trainTrade.stationTool.productTitle")}`;
  }, [t]);

  useEffect(() => {
    let active = true;
    loadTrainTradeRouteProfiles()
      .then((entries) => {
        if (active) setProfiles(entries);
      })
      .catch((reason) => {
        console.error(reason);
        if (active) setDataError(true);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    loadTrainTradeStrategyCards()
      .then((entries) => {
        if (active) setStrategyCards(entries);
      })
      .catch((reason) => {
        console.error(reason);
        if (active) setStrategyError(true);
      });
    return () => { active = false; };
  }, []);

  const routeModel = quotaConfirmed ? createRouteModel(totals, stationCount, originHint, steps) : null;
  const confirmedStations = routeModel
    ? getConfirmedStations(routeModel, originHint, steps)
    : new Map<number, StationType>();

  const remainingStations = { ...totals };
  steps.forEach(({ currentType }) => {
    remainingStations[currentType] = Math.max(0, remainingStations[currentType] - 1);
  });

  const currentIndex = originHint ? steps.length : -1;
  const visibleCount = Math.min(6, stationCount);
  const maxOffset = Math.max(0, stationCount - visibleCount);
  const autoOffset = Math.max(0, Math.min(maxOffset, currentIndex > 0 ? currentIndex - 1 : 0));
  const visibleOffset = Math.max(0, Math.min(maxOffset, stationOffset ?? autoOffset));

  const clearRoute = () => {
    setOriginHint("");
    setSteps([]);
    setPendingCurrent("");
    setPendingHint("");
    setStationOffset(null);
    setStrategySelections([null, null, null]);
    setSelectedStrategy(null);
    setStrategyHistory([]);
  };

  const consumeSelectedStrategy = () => {
    setStrategyHistory((current) => [...current, [...strategySelections] as StrategySelections]);
    if (selectedStrategy === null) return;
    setStrategySelections((current) => current.map((id) => id === selectedStrategy ? null : id) as StrategySelections);
    setSelectedStrategy(null);
  };

  const resetForecast = () => {
    setQuotaConfirmed(false);
    clearRoute();
  };

  const changeDifficulty = (next: TrainTradeDifficultyId | "") => {
    setDifficulty(next);
    const profile = profiles?.find((item) => item.id === next);
    setTotals(profile?.variants.length === 1 ? { ...profile.variants[0] } : { ...EMPTY_TOTALS });
    resetForecast();
  };

  const changeTotal = (type: StationType, rawValue: string) => {
    const value = Math.max(0, Math.min(stationCount, Number(rawValue) || 0));
    setTotals((current) => ({ ...current, [type]: value }));
    resetForecast();
  };

  const confirmQuota = () => {
    if (!quotaValid) return;
    clearRoute();
    setQuotaConfirmed(true);
  };

  const undo = () => {
    if (steps.length > 0) {
      setSteps((current) => current.slice(0, -1));
    } else if (originHint) {
      setOriginHint("");
    } else {
      setQuotaConfirmed(false);
    }
    const previousStrategies = strategyHistory.at(-1);
    if (previousStrategies) setStrategySelections(previousStrategies);
    setStrategyHistory((current) => current.slice(0, -1));
    setSelectedStrategy(null);
    setPendingCurrent("");
    setPendingHint("");
    setStationOffset(null);
  };

  const historyEntries = useMemo(() => {
    const entries: { range: string; hintId: HintId | ""; detail: string }[] = [];
    if (originHint) {
      entries.push({
        range: t("trainTrade.stationTool.planner.historyRange", { start: 1, end: 3 }),
        hintId: originHint,
        detail: t("trainTrade.stationTool.planner.originDetail"),
      });
    }
    steps.forEach((step, index) => {
      entries.push({
        range: step.hintId ? t("trainTrade.stationTool.planner.historyRange", { start: index + 2, end: index + 4 }) : t("trainTrade.stationTool.planner.stationNumber", { station: index + 1 }),
        hintId: step.hintId,
        detail: t("trainTrade.stationTool.planner.stepDetail", {
          station: index + 1,
          type: t(STATION_KEY[step.currentType]),
        }),
      });
    });
    return entries;
  }, [originHint, steps, t]);

  if (dataError) return <ContentPage active="/traintrade" title={t("trainTrade.stationTool.title")} wide><p className="text-sm text-muted-foreground">{t("trainTrade.stationTool.loadError")}</p></ContentPage>;
  if (!profiles) return <ContentPage active="/traintrade" title={t("trainTrade.stationTool.title")} wide><p className="text-sm text-muted-foreground">{t("loading")}</p></ContentPage>;

  return (
    <ContentPage active="/traintrade" title={t("trainTrade.stationTool.title")} wide>
    <div className="space-y-3 pb-16 md:pb-0" data-testid="train-trade-station-tool">
      <h1 className="sr-only">{t("trainTrade.stationTool.planner.workspaceTitle")}</h1>
      <div className="grid min-w-0 gap-3 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="min-w-0 rounded-md border border-border bg-card p-3 xl:self-start">
          <section aria-labelledby="planner-difficulty-title">
            <h2 id="planner-difficulty-title" className="text-base font-semibold">
              {t("trainTrade.stationTool.planner.difficultyHeading")}
            </h2>
            <select
              value={difficulty}
              onChange={(event) => changeDifficulty(event.target.value as TrainTradeDifficultyId | "")}
              className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label={t("trainTrade.stationTool.planner.difficultyHeading")}
              data-testid="planner-difficulty"
            >
              <option value="">{t("trainTrade.stationTool.planner.difficultyPlaceholder")}</option>
              {profiles.map((item) => (
                <option key={item.id} value={item.id}>
                  {t(`trainTrade.stationTool.planner.difficultyProfile.${item.id}.name`)}
                </option>
              ))}
            </select>
            <div className="mt-2 min-h-16 text-xs leading-5 text-muted-foreground">
              {difficultyProfile ? (
                <>
                  <strong className="block text-foreground">
                    {t(`trainTrade.stationTool.planner.difficultyProfile.${difficultyProfile.id}.name`)}
                  </strong>
                  <span>{t(`trainTrade.stationTool.planner.difficultyProfile.${difficultyProfile.id}.description`)}</span>
                </>
              ) : t("trainTrade.stationTool.planner.difficultySummary")}
            </div>
          </section>

          <section className="mt-3 border-t border-border pt-3" aria-labelledby="planner-quota-title">
            <div className="flex items-center justify-between gap-2">
              <h2 id="planner-quota-title" className="text-sm font-semibold">
                {t("trainTrade.stationTool.planner.quotaHeading")}
              </h2>
              {stationCount > 0 && <span className="text-xs tabular-nums text-muted-foreground">{quotaTotal}/{stationCount}</span>}
            </div>
            {difficultyProfile && difficultyProfile.variants.length > 1 && (
              <label className="mt-2 grid gap-1 text-xs font-semibold text-muted-foreground">
                {t("trainTrade.stationTool.planner.stationMixHeading")}
                <select
                  value={difficultyProfile.variants.findIndex((variant) => stationTotalsEqual(variant, totals))}
                  onChange={(event) => {
                    const variant = difficultyProfile.variants[Number(event.target.value)];
                    if (variant) setTotals({ ...variant });
                    resetForecast();
                  }}
                  className="h-10 rounded-md border border-border bg-background px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value={-1}>{t("trainTrade.stationTool.planner.stationMixPlaceholder")}</option>
                  {difficultyProfile.variants.map((variant, index) => (
                    <option key={`${variant.winery}-${variant.food}-${variant.trade}`} value={index}>
                      {t("trainTrade.stationTool.planner.stationMixOption", {
                        winery: variant.winery,
                        food: variant.food,
                        trade: variant.trade,
                      })}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <div className="mt-2 overflow-hidden rounded-md border border-border">
              <div className="grid grid-cols-[minmax(0,1fr)_4rem_4rem] bg-muted/45 px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                <span>{t("trainTrade.stationTool.planner.stationName")}</span>
                <span className="text-center">{t("trainTrade.stationTool.planner.stationTotal")}</span>
                <span className="text-right">{t("trainTrade.stationTool.planner.stationRemaining")}</span>
              </div>
              {STATION_TYPES.map((type) => (
                <label key={type} className="grid min-h-11 grid-cols-[minmax(0,1fr)_4rem_4rem] items-center border-t border-border px-2 text-sm">
                  <strong>{t(STATION_KEY[type])}</strong>
                  <input
                    type="number"
                    min={0}
                    max={stationCount}
                    aria-label={`${t(STATION_KEY[type])} ${t("trainTrade.stationTool.planner.stationTotal")}`}
                    value={totals[type]}
                    disabled={!difficulty}
                    onChange={(event) => changeTotal(type, event.target.value)}
                    className="mx-auto h-8 w-12 border-b border-border bg-transparent text-center font-semibold tabular-nums text-[color:var(--arkive-nav-active)] outline-none focus-visible:border-ring disabled:text-muted-foreground"
                    data-testid={`planner-total-${type}`}
                  />
                  <span className="text-right font-semibold tabular-nums">
                    {remainingStations[type]}
                    <small className="ml-1 text-xs font-normal text-muted-foreground">{t("trainTrade.stationTool.planner.stationUnit")}</small>
                  </span>
                </label>
              ))}
            </div>
            <p className={`mt-2 min-h-10 text-xs leading-5 ${quotaValid ? "text-[color:var(--arkive-nav-active)]" : "text-muted-foreground"}`} role="status">
              {!difficulty
                ? ""
                : quotaValid
                  ? t("trainTrade.stationTool.planner.quotaValid")
                  : quotaTotal === stationCount
                    ? t("trainTrade.stationTool.planner.quotaVariantInvalid")
                    : t("trainTrade.stationTool.planner.quotaInvalid", {
                      remaining: Math.abs(stationCount - quotaTotal),
                      current: quotaTotal,
                    })}
            </p>
            <button
              type="button"
              disabled={!quotaValid}
              onClick={confirmQuota}
              className="mt-1 min-h-10 w-full rounded-md border border-primary bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              data-testid="planner-confirm-quota"
            >
              {quotaConfirmed
                ? t("trainTrade.stationTool.planner.quotaConfirmed")
                : t("trainTrade.stationTool.planner.quotaConfirm")}
            </button>
          </section>

          <HistoryPanel entries={historyEntries} />
        </aside>

        <section className="min-w-0 overflow-hidden rounded-md border border-border bg-card" aria-live="polite">
          <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="truncate text-lg font-semibold text-[color:var(--arkive-nav-active)] md:text-xl">
              {t("trainTrade.stationTool.planner.workspaceTitle")}
            </h2>
            <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
              {difficulty ? t("trainTrade.stationTool.planner.progressReadout", { current: Math.min(steps.length, stationCount), total: stationCount }) : t("trainTrade.stationTool.planner.progressWaiting")}
            </span>
          </header>

          {stationCount > 0 && (
            <StationTrack
              currentIndex={currentIndex}
              confirmedStations={confirmedStations}
              visibleCount={visibleCount}
              visibleOffset={visibleOffset}
              maxOffset={maxOffset}
              onOffsetChange={setStationOffset}
            />
          )}

          <div className="p-3 md:p-4">
            {!difficulty ? (
              <EmptyState title={t("trainTrade.stationTool.planner.chooseDifficultyTitle")} detail={t("trainTrade.stationTool.planner.chooseDifficultyDetail")} />
            ) : !routeModel || routeModel.count === 0 ? (
              <EmptyState title={t("trainTrade.stationTool.planner.configureTitle")} detail={t("trainTrade.stationTool.planner.configureDetail")} />
            ) : !originHint ? (
              <OriginPrompt
                pendingHint={pendingHint}
                routeModel={routeModel}
                onHintChange={setPendingHint}
                onConfirm={() => {
                  if (!pendingHint) return;
                  consumeSelectedStrategy();
                  setOriginHint(pendingHint);
                  setPendingHint("");
                }}
                strategyCards={strategyCards}
                strategyError={strategyError}
                strategySelections={strategySelections}
                selectedStrategy={selectedStrategy}
                onStrategySelectionsChange={setStrategySelections}
                onSelectedStrategyChange={setSelectedStrategy}
              />
            ) : (
              <ForecastWorkspace
                steps={steps}
                pendingCurrent={pendingCurrent}
                pendingHint={pendingHint}
                routeModel={routeModel}
                stationCount={stationCount}
                onCurrentChange={setPendingCurrent}
                onHintChange={setPendingHint}
                onConfirm={(currentType, hintId) => {
                  consumeSelectedStrategy();
                  setSteps((current) => [...current, { currentType, hintId }]);
                  setPendingCurrent("");
                  setPendingHint("");
                  setStationOffset(null);
                }}
                strategyCards={strategyCards}
                strategyError={strategyError}
                strategySelections={strategySelections}
                selectedStrategy={selectedStrategy}
                onStrategySelectionsChange={setStrategySelections}
                onSelectedStrategyChange={setSelectedStrategy}
              />
            )}
          </div>

          {difficulty && (
            <nav className="grid grid-cols-2 gap-2 border-t border-border bg-muted/20 p-2 sm:grid-cols-3" aria-label={t("trainTrade.stationTool.planner.actionsLabel")}>
              <button
                type="button"
                disabled={!quotaConfirmed}
                onClick={undo}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-muted-foreground enabled:hover:border-ring enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="planner-undo"
              >
                <IconArrowBackUp className="size-4" stroke={1.8} aria-hidden />
                {t("trainTrade.stationTool.planner.undo")}
              </button>
              <button
                type="button"
                onClick={() => changeDifficulty("")}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold text-muted-foreground hover:border-ring hover:text-foreground"
                data-testid="planner-restart"
              >
                <IconRefresh className="size-4" stroke={1.8} aria-hidden />
                {t("trainTrade.stationTool.planner.restart")}
              </button>
              <span className="col-span-2 hidden items-center justify-end px-2 text-xs text-muted-foreground sm:col-span-1 sm:flex">
                {t("trainTrade.stationTool.planner.disclaimerShort")}
              </span>
            </nav>
          )}
        </section>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{t("trainTrade.stationTool.planner.disclaimer")}</p>
    </div>
    </ContentPage>
  );
}

function StationTrack({ currentIndex, confirmedStations, visibleCount, visibleOffset, maxOffset, onOffsetChange }: {
  currentIndex: number;
  confirmedStations: Map<number, StationType>;
  visibleCount: number;
  visibleOffset: number;
  maxOffset: number;
  onOffsetChange: (offset: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)_2.25rem] gap-2 border-b border-border bg-muted/15 p-2" aria-label={t("trainTrade.stationTool.planner.stationProgress")}>
      <button type="button" disabled={visibleOffset === 0} onClick={() => onOffsetChange(Math.max(0, visibleOffset - 1))} className="grid min-h-12 place-items-center rounded-md border border-border bg-background text-muted-foreground enabled:hover:text-foreground disabled:opacity-35" aria-label={t("trainTrade.stationTool.planner.previousStations")}>
        <IconChevronLeft className="size-5" stroke={1.8} aria-hidden />
      </button>
      <div className="grid min-w-0 grid-cols-3 gap-1.5 sm:grid-cols-6" aria-label={t("trainTrade.stationTool.planner.stationRange", { start: visibleOffset + 1, end: visibleOffset + visibleCount })}>
        {Array.from({ length: visibleCount }, (_, slot) => {
          const index = visibleOffset + slot;
          const type = confirmedStations.get(index);
          const isCurrent = currentIndex === index;
          const isConfirmed = index < currentIndex || Boolean(type && index !== currentIndex);
          const inForecastWindow = !isConfirmed && currentIndex >= 0 && index >= currentIndex && index < currentIndex + 3;
          return (
            <div key={index} className={`flex min-h-12 min-w-0 items-center justify-center gap-1 rounded-md border px-1 text-center ${isCurrent ? "border-ring bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]" : isConfirmed ? "border-border bg-background text-[color:var(--arkive-nav-active)]" : inForecastWindow ? "border-border bg-background text-foreground" : "border-transparent bg-muted/35 text-muted-foreground"}`}>
              <strong className="text-sm tabular-nums">{index + 1}</strong>
              <small className="max-w-full truncate text-xs">
                {type ? t(STATION_KEY[type]) : isCurrent ? t("trainTrade.stationTool.planner.stationCurrent") : inForecastWindow ? t("trainTrade.stationTool.planner.stationForecasted") : t("trainTrade.stationTool.planner.stationPending")}
              </small>
            </div>
          );
        })}
      </div>
      <button type="button" disabled={visibleOffset === maxOffset} onClick={() => onOffsetChange(Math.min(maxOffset, visibleOffset + 1))} className="grid min-h-12 place-items-center rounded-md border border-border bg-background text-muted-foreground enabled:hover:text-foreground disabled:opacity-35" aria-label={t("trainTrade.stationTool.planner.nextStations")}>
        <IconChevronRight className="size-5" stroke={1.8} aria-hidden />
      </button>
    </div>
  );
}

function EmptyState({ title, detail }: { title: string; detail: string }) {
  return <div className="grid min-h-44 place-items-center text-center"><div><strong className="block text-base">{title}</strong><span className="mt-1 block text-xs leading-5 text-muted-foreground">{detail}</span></div></div>;
}

function HistoryPanel({ entries }: { entries: { range: string; hintId: HintId | ""; detail: string }[] }) {
  const { t } = useTranslation();
  return (
    <section className="mt-3 border-t border-border pt-3" aria-labelledby="planner-history-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="planner-history-title" className="text-sm font-semibold">{t("trainTrade.stationTool.planner.historyHeading")}</h2>
        <span className="text-xs tabular-nums text-[color:var(--arkive-nav-active)]">{t("trainTrade.stationTool.planner.historyCount", { count: entries.length })}</span>
      </div>
      {entries.length > 0 ? (
        <ol className="mt-2 max-h-64 overflow-y-auto border-t border-border">
          {entries.map((entry, index) => (
            <li key={`${entry.range}-${index}`} className="border-b border-border py-2 last:border-b-0">
              <div className="flex items-center justify-between gap-2 text-xs"><strong>{entry.range}</strong>{entry.hintId && <span className="font-semibold text-[color:var(--arkive-nav-active)]">{t(`trainTrade.stationTool.planner.hint.${entry.hintId}`)}</span>}</div>
              <small className="mt-1 block text-xs text-muted-foreground">{entry.detail}</small>
            </li>
          ))}
        </ol>
      ) : <p className="mt-2 border-t border-border pt-3 text-xs text-muted-foreground">{t("trainTrade.stationTool.planner.historyEmpty")}</p>}
    </section>
  );
}

function OriginPrompt({ pendingHint, routeModel, onHintChange, onConfirm, strategyCards, strategyError, strategySelections, selectedStrategy, onStrategySelectionsChange, onSelectedStrategyChange }: {
  pendingHint: HintId | "";
  routeModel: RouteModel;
  onHintChange: (hint: HintId | "") => void;
  onConfirm: () => void;
  strategyCards: TrainTradeStrategyCard[] | null;
  strategyError: boolean;
  strategySelections: StrategySelections;
  selectedStrategy: number | null;
  onStrategySelectionsChange: (selections: StrategySelections) => void;
  onSelectedStrategyChange: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const availableHints = getAvailableHints(routeModel, 0);
  const previewModel = refineRouteModel(routeModel, -1, "", 0, pendingHint);
  return (
    <div className="space-y-3" data-testid="planner-origin-prompt">
      <section className="rounded-md border border-border bg-muted/15 p-3">
        <div className="flex items-baseline justify-between gap-2 border-b border-border pb-2"><h3 className="text-base font-semibold">{t("trainTrade.stationTool.planner.startStation")}</h3><span className="text-xs font-semibold text-muted-foreground">{t("trainTrade.stationTool.planner.openingDecision")}</span></div>
        <div className="mt-3 grid items-end gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
          <DecisionField label={`${t("trainTrade.stationTool.planner.currentStation")} · ${t("trainTrade.stationTool.planner.lockedAt")}`}><div className={`flex h-10 items-center rounded-md border px-3 text-sm font-semibold ${SELECTED_TONE}`}><span>{t("trainTrade.stationTool.planner.startStation")}</span></div></DecisionField>
          <HintPicker value={pendingHint} available={availableHints} onChange={onHintChange} />
          <ConfirmButton disabled={!pendingHint} onClick={onConfirm} testId="planner-confirm-origin" />
        </div>
        <StrategyCardPicker cards={strategyCards} error={strategyError} probabilities={probabilityFor(previewModel, 0)} selections={strategySelections} selected={selectedStrategy} onSelectionsChange={onStrategySelectionsChange} onSelectedChange={onSelectedStrategyChange} />
      </section>
      <ProbabilityTable routeModel={previewModel} start={0} />
    </div>
  );
}

function ForecastWorkspace({ steps, pendingCurrent, pendingHint, routeModel, stationCount, onCurrentChange, onHintChange, onConfirm, strategyCards, strategyError, strategySelections, selectedStrategy, onStrategySelectionsChange, onSelectedStrategyChange }: {
  steps: ConfirmedStep[];
  pendingCurrent: StationType | "";
  pendingHint: HintId | "";
  routeModel: RouteModel;
  stationCount: number;
  onCurrentChange: (type: StationType | "") => void;
  onHintChange: (hint: HintId | "") => void;
  onConfirm: (type: StationType, hint: HintId | "") => void;
  strategyCards: TrainTradeStrategyCard[] | null;
  strategyError: boolean;
  strategySelections: StrategySelections;
  selectedStrategy: number | null;
  onStrategySelectionsChange: (selections: StrategySelections) => void;
  onSelectedStrategyChange: (id: number | null) => void;
}) {
  const { t } = useTranslation();
  const latestStart = steps.length;
  const complete = steps.length >= stationCount;
  const needsHint = steps.length + 3 < stationCount;
  const currentProbability = probabilityFor(routeModel, steps.length);
  const certainCurrent = STATION_TYPES.find((type) => routeModel.count > 0 && currentProbability[type] === 1);
  const effectiveCurrent = certainCurrent ?? pendingCurrent;
  const availableCurrent = new Set(STATION_TYPES.filter((type) => prospectiveRouteCount(routeModel, steps.length, type, steps.length + 1, "") > 0));
  const availableHints = getAvailableHints(routeModel, steps.length + 1, steps.length, effectiveCurrent);
  const candidateHint = needsHint ? pendingHint : "";
  const previewModel = refineRouteModel(routeModel, steps.length, effectiveCurrent, steps.length + 1, candidateHint);
  const candidateCount = previewModel.count;
  return (
    <div className="space-y-3">
      {!complete && (
        <section className="rounded-md border border-border bg-muted/15 p-3">
          <div className="flex items-baseline justify-between gap-2 border-b border-border pb-2"><h3 className="text-base font-semibold">{t("trainTrade.stationTool.planner.stationNumber", { station: steps.length + 1 })}</h3><span className="text-xs font-semibold text-muted-foreground">{t("trainTrade.stationTool.planner.currentDecision")}</span></div>
          <div className="mt-3 grid items-end gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto]">
            <StationPicker value={effectiveCurrent} locked={Boolean(certainCurrent)} available={availableCurrent} onChange={onCurrentChange} />
            {needsHint ? <HintPicker value={pendingHint} available={availableHints} onChange={onHintChange} /> : <p className="flex min-h-10 items-center text-xs leading-5 text-muted-foreground">{t("trainTrade.stationTool.planner.noFutureHint")}</p>}
            <ConfirmButton disabled={!effectiveCurrent || (needsHint && !pendingHint) || candidateCount === 0} onClick={() => { if (effectiveCurrent && (!needsHint || pendingHint)) onConfirm(effectiveCurrent, candidateHint); }} testId="planner-confirm-step" />
          </div>
          <StrategyCardPicker cards={strategyCards} error={strategyError} probabilities={probabilityFor(candidateCount > 0 ? previewModel : routeModel, Math.min(steps.length + 1, stationCount - 1))} selections={strategySelections} selected={selectedStrategy} onSelectionsChange={onStrategySelectionsChange} onSelectedChange={onSelectedStrategyChange} />
          {effectiveCurrent && pendingHint && candidateCount === 0 && <p className="mt-2 text-xs text-destructive">{t("trainTrade.stationTool.planner.noRoute")}</p>}
        </section>
      )}
      <ProbabilityTable routeModel={candidateCount > 0 ? previewModel : routeModel} start={Math.min(latestStart, stationCount - 3)} />
      {complete && <p className="rounded-md border border-ring bg-[color:var(--arkive-filter-active)] p-3 text-sm font-semibold text-[color:var(--arkive-nav-active)]">{t("trainTrade.stationTool.planner.routeComplete", { count: stationCount })}</p>}
    </div>
  );
}

function DecisionField({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0"><span className="mb-1.5 block text-xs font-semibold text-muted-foreground">{label}</span>{children}</div>;
}

function ConfirmButton({ disabled, onClick, testId }: { disabled: boolean; onClick: () => void; testId: string }) {
  const { t } = useTranslation();
  return <button type="button" disabled={disabled} onClick={onClick} className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground" data-testid={testId}>{t("trainTrade.stationTool.planner.confirm")}<IconArrowRight className="size-4" stroke={1.8} aria-hidden /></button>;
}

function StationPicker({ value, locked, available, onChange }: {
  value: StationType | "";
  locked: boolean;
  available: Set<StationType>;
  onChange: (type: StationType | "") => void;
}) {
  const { t } = useTranslation();
  return (
    <DecisionField label={locked ? `${t("trainTrade.stationTool.planner.currentStation")} · ${t("trainTrade.stationTool.planner.lockedAt")}` : t("trainTrade.stationTool.planner.currentStation")}>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t("trainTrade.stationTool.planner.currentStation")} data-testid="planner-current-station">
        {STATION_TYPES.map((type) => {
          const selected = value === type;
          const disabled = locked || !available.has(type);
          return <button key={type} type="button" disabled={disabled} aria-pressed={selected} onClick={() => onChange(type)} className={`h-10 rounded-md border px-2 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected ? SELECTED_TONE : "border-border bg-background text-foreground enabled:hover:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-55"}`}>{t(STATION_KEY[type])}</button>;
        })}
      </div>
    </DecisionField>
  );
}

function HintPicker({ value, available, onChange }: {
  value: HintId | "";
  available: Set<HintId>;
  onChange: (hint: HintId | "") => void;
}) {
  const { t } = useTranslation();
  return (
    <DecisionField label={t("trainTrade.stationTool.planner.futureHint")}>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" role="group" aria-label={t("trainTrade.stationTool.planner.futureHint")} data-testid="planner-hint">
        {HINT_IDS.map((hint) => {
          const selected = value === hint;
          const enabled = available.has(hint);
          return <button key={hint} type="button" disabled={!enabled} aria-pressed={selected} title={!enabled ? t("trainTrade.stationTool.planner.hintUnavailable") : undefined} onClick={() => onChange(hint)} className={`min-h-10 rounded-md border px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring ${selected ? SELECTED_TONE : "border-border bg-background text-foreground enabled:hover:border-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-50"}`}>{t(`trainTrade.stationTool.planner.hint.${hint}`)}</button>;
        })}
      </div>
    </DecisionField>
  );
}

function ProbabilityTable({ routeModel, start }: { routeModel: RouteModel; start: number }) {
  const { t } = useTranslation();
  const positions = Array.from({ length: 3 }, (_, index) => start + index).filter((position) => position < routeModel.totalStops);
  return (
    <section className="overflow-hidden rounded-md border border-border" aria-labelledby="planner-probability-title">
      <h3 id="planner-probability-title" className="border-b border-border bg-muted/35 px-3 py-2 text-sm font-semibold">{t("trainTrade.stationTool.planner.probabilityHeading")}</h3>
      <div>
        {positions.map((position) => {
          const probabilities = roundedProbabilities(probabilityFor(routeModel, position));
          const leading = Math.max(...STATION_TYPES.map((type) => probabilities[type]));
          return (
            <article key={position} className="grid grid-cols-1 border-b border-border last:border-b-0 sm:grid-cols-[6rem_minmax(0,1fr)]">
              <div className="flex items-center border-b border-border bg-muted/20 px-3 py-2 sm:border-r sm:border-b-0"><strong className="text-base tabular-nums">{t("trainTrade.stationTool.planner.stationNumber", { station: position + 1 })}</strong></div>
              <div className="grid min-h-14 grid-cols-3">
                {STATION_TYPES.map((type) => {
                  const isLeading = leading > 0 && probabilities[type] === leading;
                  const isCertain = probabilities[type] === 100;
                  return <div key={type} className={`flex min-w-0 items-center justify-between gap-1 border-l border-border px-2 first:border-l-0 sm:px-3 ${isCertain || isLeading ? "bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]" : "text-foreground"}`}><span className={`truncate text-sm ${isLeading ? "font-bold" : "font-semibold"}`}>{t(STATION_KEY[type])}</span><strong className={`shrink-0 tabular-nums ${isLeading ? "text-xl" : "text-lg"}`}>{probabilities[type]}%</strong></div>;
                })}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

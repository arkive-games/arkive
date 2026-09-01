import { useEffect, useMemo, useState } from "react";
import {
  IconArrowBackUp,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  loadTrainTradeRouteProfiles,
} from "@/features/traintrade/data";
import { stationTotalsEqual, type TrainTradeDifficultyId, type TrainTradeRouteProfile } from "@/features/traintrade/routeProfiles";
import {
  HINT_IDS,
  STATION_TYPES,
  createRouteModel,
  getAvailableHints,
  getConfirmedStations,
  probabilityFor,
  prospectiveRouteCount,
  roundedProbabilities,
  windowDistribution,
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

const STATION_TONE: Record<StationType, string> = {
  winery: "border-rose-300/70 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/35 dark:text-rose-200",
  food: "border-amber-300/70 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950/35 dark:text-amber-200",
  trade: "border-sky-300/70 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/35 dark:text-sky-200",
};

export default function TrainTradeStationToolPage() {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<TrainTradeRouteProfile[] | null>(null);
  const [dataError, setDataError] = useState(false);
  const [difficulty, setDifficulty] = useState<TrainTradeDifficultyId | "">("");
  const [totals, setTotals] = useState<StationTotals>(EMPTY_TOTALS);
  const [quotaConfirmed, setQuotaConfirmed] = useState(false);
  const [originHint, setOriginHint] = useState<HintId | "">("");
  const [steps, setSteps] = useState<ConfirmedStep[]>([]);
  const [pendingCurrent, setPendingCurrent] = useState<StationType | "">("");
  const [pendingHint, setPendingHint] = useState<HintId | "">("");
  const [stationOffset, setStationOffset] = useState<number | null>(null);

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

  const routeModel = quotaConfirmed ? createRouteModel(totals, stationCount, originHint, steps) : null;

  const confirmedStations = routeModel
    ? getConfirmedStations(routeModel, originHint, steps)
    : new Map<number, StationType>();

  const remainingStations = { ...totals };
  steps.forEach(({ currentType: type }) => {
    remainingStations[type] = Math.max(0, remainingStations[type] - 1);
  });

  const currentIndex = originHint ? steps.length : -1;
  const visibleCount = Math.min(6, stationCount);
  const maxOffset = Math.max(0, stationCount - visibleCount);
  const autoOffset = Math.max(0, Math.min(maxOffset, currentIndex > 0 ? currentIndex - 1 : 0));
  const visibleOffset = Math.max(0, Math.min(maxOffset, stationOffset ?? autoOffset));

  const resetForecast = () => {
    setQuotaConfirmed(false);
    setOriginHint("");
    setSteps([]);
    setPendingCurrent("");
    setPendingHint("");
    setStationOffset(null);
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
    setOriginHint("");
    setSteps([]);
    setPendingCurrent("");
    setPendingHint("");
    setStationOffset(null);
    setQuotaConfirmed(true);
  };

  const undo = () => {
    if (steps.length > 0) {
      setSteps((current) => current.slice(0, -1));
    } else if (originHint) {
      setOriginHint("");
    }
    setPendingCurrent("");
    setPendingHint("");
    setStationOffset(null);
  };

  const historyEntries = useMemo(() => {
    const entries: { range: string; hintId: HintId; detail: string }[] = [];
    if (originHint) {
      entries.push({
        range: t("trainTrade.stationTool.planner.historyRange", { start: 1, end: 3 }),
        hintId: originHint,
        detail: t("trainTrade.stationTool.planner.originDetail"),
      });
    }
    steps.forEach((step, index) => {
      entries.push({
        range: t("trainTrade.stationTool.planner.historyRange", { start: index + 2, end: index + 4 }),
        hintId: step.hintId,
        detail: t("trainTrade.stationTool.planner.stepDetail", {
          station: index + 1,
          type: t(STATION_KEY[step.currentType]),
        }),
      });
    });
    return entries;
  }, [originHint, steps, t]);

  if (dataError) return <p className="text-sm text-muted-foreground">{t("trainTrade.stationTool.loadError")}</p>;
  if (!profiles) return <p className="text-sm text-muted-foreground">{t("common.loading")}</p>;

  return (
    <div className="space-y-4" data-testid="train-trade-station-tool">
      <h1 className="sr-only">{t("trainTrade.stationTool.planner.workspaceTitle")}</h1>
      <div className="grid min-w-0 gap-4 xl:grid-cols-[12rem_minmax(0,1fr)_14rem]">
        <aside className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <section className="rounded-md border border-border bg-card p-3" aria-labelledby="planner-difficulty-title">
            <h2 id="planner-difficulty-title" className="flex items-center gap-2 text-base font-semibold">
              <StepNumber value={1} />
              {t("trainTrade.stationTool.planner.difficultyHeading")}
            </h2>
            <select
              value={difficulty}
              onChange={(event) => changeDifficulty(event.target.value as TrainTradeDifficultyId | "")}
              className="mt-3 h-11 w-full rounded-md border border-border bg-background px-3 text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            {difficultyProfile ? (
              <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                <strong className="block text-foreground">
                  {t(`trainTrade.stationTool.planner.difficultyProfile.${difficultyProfile.id}.name`)}
                </strong>
                <p>{t(`trainTrade.stationTool.planner.difficultyProfile.${difficultyProfile.id}.description`)}</p>
                <p>{t(`trainTrade.stationTool.planner.difficultyProfile.${difficultyProfile.id}.price`)}</p>
                <p>{t(`trainTrade.stationTool.planner.difficultyProfile.${difficultyProfile.id}.stock`)}</p>
              </div>
            ) : (
              <p className="mt-3 border-t border-border pt-3 text-xs leading-5 text-muted-foreground">
                {t("trainTrade.stationTool.planner.difficultySummary")}
              </p>
            )}
          </section>

          <section className="rounded-md border border-border bg-card p-3" aria-labelledby="planner-quota-title">
            <h2 id="planner-quota-title" className="flex items-center gap-2 text-base font-semibold">
              <StepNumber value={2} />
              {t("trainTrade.stationTool.planner.quotaHeading")}
            </h2>
            <div className="mt-3 grid gap-2">
              {difficultyProfile && difficultyProfile.variants.length > 1 && (
                <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                  {t("trainTrade.stationTool.planner.stationMixHeading")}
                  <select
                    value={difficultyProfile.variants.findIndex((variant) => stationTotalsEqual(variant, totals))}
                    onChange={(event) => {
                      const variant = difficultyProfile.variants[Number(event.target.value)];
                      if (variant) setTotals({ ...variant });
                      resetForecast();
                    }}
                    className="h-10 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
              {STATION_TYPES.map((type) => (
                <label key={type} className="grid grid-cols-[minmax(0,1fr)_3.5rem] items-center rounded-md border border-border bg-muted/25 px-3 py-2 text-sm font-semibold">
                  <span>{t(STATION_KEY[type])}</span>
                  <input
                    type="number"
                    min={0}
                    max={stationCount}
                    value={totals[type]}
                    disabled={!difficulty}
                    onChange={(event) => changeTotal(type, event.target.value)}
                    className="h-9 w-full border-b border-border bg-transparent text-right text-lg font-semibold tabular-nums text-[color:var(--arkive-nav-active)] outline-none disabled:text-muted-foreground"
                    data-testid={`planner-total-${type}`}
                  />
                </label>
              ))}
            </div>
            <p className={`mt-3 min-h-10 text-xs leading-5 ${quotaValid ? "text-emerald-700 dark:text-emerald-300" : "text-muted-foreground"}`} role="status">
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
              className="mt-2 min-h-11 w-full rounded-md border border-[color:var(--arkive-nav-accent)] bg-[color:var(--arkive-nav-accent)] px-3 text-sm font-semibold text-primary-foreground transition-colors enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:border-border disabled:bg-muted disabled:text-muted-foreground"
              data-testid="planner-confirm-quota"
            >
              {quotaConfirmed
                  ? t("trainTrade.stationTool.planner.quotaConfirmed")
                  : t("trainTrade.stationTool.planner.quotaConfirm")}
            </button>
          </section>
        </aside>

        <section className="min-w-0 rounded-md border border-border bg-card p-4 md:p-5" aria-live="polite">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
            <h2 className="text-xl font-semibold text-[color:var(--arkive-nav-active)] md:text-2xl">
              {t("trainTrade.stationTool.planner.workspaceTitle")}
            </h2>
            <button
              type="button"
              disabled={!originHint && steps.length === 0}
              onClick={undo}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border px-3 text-sm font-medium text-muted-foreground transition-colors enabled:hover:bg-accent enabled:hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
              data-testid="planner-undo"
            >
              <IconArrowBackUp className="size-4" stroke={1.8} aria-hidden />
              {t("trainTrade.stationTool.planner.undo")}
            </button>
          </div>

          {stationCount > 0 && (
            <div className="mt-4 grid grid-cols-[2.5rem_minmax(0,1fr)_2.5rem] gap-2" aria-label={t("trainTrade.stationTool.planner.stationProgress")}>
              <button
                type="button"
                disabled={visibleOffset === 0}
                onClick={() => setStationOffset(Math.max(0, visibleOffset - 1))}
                className="grid min-h-14 place-items-center rounded-md border border-border text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground disabled:opacity-35"
                aria-label={t("trainTrade.stationTool.planner.previousStations")}
              >
                <IconChevronLeft className="size-5" stroke={1.8} aria-hidden />
              </button>
              <div className="grid min-w-0 grid-cols-3 gap-2 sm:grid-cols-6" aria-label={t("trainTrade.stationTool.planner.stationRange", { start: visibleOffset + 1, end: visibleOffset + visibleCount })}>
                {Array.from({ length: visibleCount }, (_, slot) => {
                  const index = visibleOffset + slot;
                  const type = confirmedStations.get(index);
                  const inForecastWindow = !type && currentIndex >= 0 && index >= currentIndex && index < currentIndex + 3;
                  return (
                    <div
                      key={index}
                      className={`flex min-h-14 min-w-0 flex-col items-center justify-center rounded-md border px-1 text-center ${type ? STATION_TONE[type] : inForecastWindow ? "border-[color:var(--arkive-nav-accent)] bg-[color:var(--arkive-filter-active)] text-[color:var(--arkive-nav-active)]" : "border-border bg-muted/25 text-muted-foreground"}`}
                    >
                      <strong className="text-sm tabular-nums">{index + 1}</strong>
                      <small className="max-w-full truncate text-xs">
                        {type
                          ? t(STATION_KEY[type])
                          : inForecastWindow
                            ? t("trainTrade.stationTool.planner.stationForecasted")
                            : t("trainTrade.stationTool.planner.stationPending")}
                      </small>
                    </div>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={visibleOffset === maxOffset}
                onClick={() => setStationOffset(Math.min(maxOffset, visibleOffset + 1))}
                className="grid min-h-14 place-items-center rounded-md border border-border text-muted-foreground enabled:hover:bg-accent enabled:hover:text-foreground disabled:opacity-35"
                aria-label={t("trainTrade.stationTool.planner.nextStations")}
              >
                <IconChevronRight className="size-5" stroke={1.8} aria-hidden />
              </button>
            </div>
          )}

          {!routeModel || routeModel.count === 0 ? (
            <div className="grid min-h-64 place-items-center text-center text-sm font-semibold text-muted-foreground">
              {t("trainTrade.stationTool.planner.forecastStart")}
            </div>
          ) : !originHint ? (
            <OriginPrompt
              pendingHint={pendingHint}
              routeModel={routeModel}
              onHintChange={setPendingHint}
              onConfirm={() => {
                if (!pendingHint) return;
                setOriginHint(pendingHint);
                setPendingHint("");
              }}
            />
          ) : (
            <ForecastWorkspace
              originHint={originHint}
              steps={steps}
              pendingCurrent={pendingCurrent}
              pendingHint={pendingHint}
              routeModel={routeModel}
              stationCount={stationCount}
              onCurrentChange={setPendingCurrent}
              onHintChange={setPendingHint}
              onConfirm={(currentType, hintId) => {
                setSteps((current) => [...current, { currentType, hintId }]);
                setPendingCurrent("");
                setPendingHint("");
                setStationOffset(null);
              }}
            />
          )}
        </section>

        <aside className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <section className="rounded-md border border-border bg-card p-3" aria-labelledby="planner-remaining-title">
            <h2 id="planner-remaining-title" className="border-b border-border pb-3 text-sm font-semibold">
              {t("trainTrade.stationTool.planner.remainingHeading")}
            </h2>
            <div className="mt-2 grid gap-2">
              {STATION_TYPES.map((type) => (
                <div key={type} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-1 rounded-md border border-border bg-muted/25 px-3 py-2">
                  <span className="text-sm font-semibold">{t(STATION_KEY[type])}</span>
                  <strong className="text-lg tabular-nums text-[color:var(--arkive-nav-active)]">{remainingStations[type]}</strong>
                  <small className="text-xs text-muted-foreground">{t("trainTrade.stationTool.planner.stationUnit")}</small>
                </div>
              ))}
            </div>
          </section>

          {difficulty === "challenge" && (
            <section className="rounded-md border border-border bg-card p-3" aria-labelledby="planner-history-title">
              <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
                <h2 id="planner-history-title" className="text-sm font-semibold">
                  {t("trainTrade.stationTool.planner.historyHeading")}
                </h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {t("trainTrade.stationTool.planner.historyCount", { count: historyEntries.length })}
                </span>
              </div>
              {historyEntries.length > 0 ? (
                <ol className="mt-3 space-y-3">
                  {historyEntries.map((entry, index) => (
                    <li key={`${entry.range}-${index}`} className="grid grid-cols-[1.5rem_minmax(0,1fr)] gap-2">
                      <span className="grid size-6 place-items-center rounded-full bg-[color:var(--arkive-nav-accent)] text-xs font-semibold text-primary-foreground">
                        {index}
                      </span>
                      <div className="min-w-0 border-b border-border pb-3 last:border-b-0">
                        <div className="flex flex-wrap justify-between gap-1 text-xs">
                          <strong>{entry.range}</strong>
                          <span className="font-semibold text-[color:var(--arkive-nav-active)]">{t(`trainTrade.stationTool.planner.hint.${entry.hintId}`)}</span>
                        </div>
                        <small className="mt-1 block text-xs text-muted-foreground">{entry.detail}</small>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="py-4 text-center text-xs text-muted-foreground">{t("trainTrade.stationTool.planner.historyEmpty")}</p>
              )}
            </section>
          )}
        </aside>
      </div>
      <p className="text-xs leading-5 text-muted-foreground">{t("trainTrade.stationTool.planner.disclaimer")}</p>
    </div>
  );
}

function OriginPrompt({
  pendingHint,
  routeModel,
  onHintChange,
  onConfirm,
}: {
  pendingHint: HintId | "";
  routeModel: RouteModel;
  onHintChange: (hint: HintId | "") => void;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const availableHints = getAvailableHints(routeModel, 0);

  return (
    <div className="mt-5 border-l-2 border-[color:var(--arkive-nav-accent)] bg-muted/20 p-4" data-testid="planner-origin-prompt">
      <h3 className="flex items-center gap-2 text-base font-semibold">
        <StepNumber value={3} />
        {t("trainTrade.stationTool.planner.stationInfoHeading")}
      </h3>
      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
          {t("trainTrade.stationTool.planner.currentStation")}
          <select disabled className="h-11 rounded-md border border-border bg-muted px-3 text-sm text-foreground">
            <option>{t("trainTrade.stationTool.planner.startStation")}</option>
          </select>
        </label>
        <HintSelect value={pendingHint} available={availableHints} onChange={onHintChange} />
      </div>
      <button
        type="button"
        disabled={!pendingHint}
        onClick={onConfirm}
        className="mt-4 min-h-11 w-full rounded-md bg-[color:var(--arkive-nav-accent)] px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        data-testid="planner-confirm-origin"
      >
        {t("trainTrade.stationTool.planner.confirmOrigin")}
      </button>
    </div>
  );
}

function ForecastWorkspace({
  originHint,
  steps,
  pendingCurrent,
  pendingHint,
  routeModel,
  stationCount,
  onCurrentChange,
  onHintChange,
  onConfirm,
}: {
  originHint: HintId;
  steps: ConfirmedStep[];
  pendingCurrent: StationType | "";
  pendingHint: HintId | "";
  routeModel: RouteModel;
  stationCount: number;
  onCurrentChange: (type: StationType | "") => void;
  onHintChange: (hint: HintId | "") => void;
  onConfirm: (type: StationType, hint: HintId) => void;
}) {
  const { t } = useTranslation();
  const latestStart = steps.length;
  const complete = steps.length >= stationCount - 3;
  const certainCurrent = STATION_TYPES.find(
    (type) => routeModel.count > 0 && probabilityFor(routeModel, steps.length)[type] === 1,
  );
  const effectiveCurrent = certainCurrent ?? pendingCurrent;
  const availableHints = getAvailableHints(routeModel, steps.length + 1, steps.length, effectiveCurrent);
  const candidateCount = prospectiveRouteCount(
    routeModel,
    steps.length,
    effectiveCurrent,
    steps.length + 1,
    pendingHint,
  );
  const latestDetail = steps.at(-1)
    ? t("trainTrade.stationTool.planner.currentDetail", {
      station: t(STATION_KEY[steps.at(-1)!.currentType]),
      hint: t(`trainTrade.stationTool.planner.hint.${steps.at(-1)!.hintId}`),
    })
    : t("trainTrade.stationTool.planner.originHintDetail", {
      hint: t(`trainTrade.stationTool.planner.hint.${originHint}`),
    });

  return (
    <div className="mt-5 space-y-4">
      {!complete && (
        <div className="border-l-2 border-[color:var(--arkive-nav-accent)] bg-muted/20 p-4">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <StepNumber value={3} />
            {t("trainTrade.stationTool.planner.stepConfirmHeading", { station: steps.length + 1 })}
          </h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {certainCurrent ? (
              <div className="grid min-h-16 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border bg-background px-3 py-2">
                <span className="text-xs font-semibold text-muted-foreground">{t("trainTrade.stationTool.planner.currentStation")}</span>
                <strong className="text-sm text-[color:var(--arkive-nav-active)]">{t(STATION_KEY[certainCurrent])}</strong>
                <small className="col-span-2 text-right text-xs text-muted-foreground">{t("trainTrade.stationTool.planner.lockedAt")}</small>
              </div>
            ) : (
              <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
                {t("trainTrade.stationTool.planner.currentStation")}
                <select
                  value={pendingCurrent}
                  onChange={(event) => onCurrentChange(event.target.value as StationType | "")}
                  className="h-11 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  data-testid="planner-current-station"
                >
                  <option value="">{t("trainTrade.stationTool.planner.selectPlaceholder")}</option>
                  {STATION_TYPES.map((type) => <option key={type} value={type}>{t(STATION_KEY[type])}</option>)}
                </select>
              </label>
            )}
            <HintSelect value={pendingHint} available={availableHints} onChange={onHintChange} />
          </div>
          {effectiveCurrent && pendingHint && candidateCount === 0 && (
            <p className="mt-3 text-xs text-destructive">{t("trainTrade.stationTool.planner.noRoute")}</p>
          )}
          <button
            type="button"
            disabled={!effectiveCurrent || !pendingHint || candidateCount === 0}
            onClick={() => {
              if (effectiveCurrent && pendingHint) onConfirm(effectiveCurrent, pendingHint);
            }}
            className="mt-4 min-h-11 w-full rounded-md bg-[color:var(--arkive-nav-accent)] px-4 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            data-testid="planner-confirm-step"
          >
            {t("trainTrade.stationTool.planner.confirmWindow", {
              start: steps.length + 2,
              end: steps.length + 4,
            })}
          </button>
        </div>
      )}

      <ResolvedWindow routeModel={routeModel} start={latestStart} detail={latestDetail} />

      {complete && (
        <p className="border-l-2 border-emerald-500 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
          {t("trainTrade.stationTool.planner.complete", { count: stationCount })}
        </p>
      )}
    </div>
  );
}

function HintSelect({
  value,
  available,
  onChange,
}: {
  value: HintId | "";
  available: Set<HintId>;
  onChange: (hint: HintId | "") => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="grid gap-1.5 text-xs font-semibold text-muted-foreground">
      {t("trainTrade.stationTool.planner.futureHint")}
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as HintId | "")}
        className="h-11 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        data-testid="planner-hint"
      >
        <option value="">{t("trainTrade.stationTool.planner.selectPlaceholder")}</option>
        {HINT_IDS.map((hint) => (
          <option key={hint} value={hint} disabled={!available.has(hint)}>
            {t(`trainTrade.stationTool.planner.hint.${hint}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

function ResolvedWindow({ routeModel, start, detail }: { routeModel: RouteModel; start: number; detail: string }) {
  const { t } = useTranslation();
  const probabilities = roundedProbabilities(probabilityFor(routeModel, start));
  const leading = Math.max(...STATION_TYPES.map((type) => probabilities[type]));
  const combinations = windowDistribution(routeModel, start);
  const combinationTotal = routeModel.count || 1;

  return (
    <section className="border-t-2 border-[color:var(--arkive-nav-accent)] pt-4" aria-labelledby="planner-probability-title">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="planner-probability-title" className="text-base font-semibold">
          {t("trainTrade.stationTool.planner.probabilityAt", { station: start + 1 })}
        </h3>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {STATION_TYPES.map((type) => (
          <article key={type} className={`rounded-md border p-3 ${STATION_TONE[type]}`}>
            <header className="flex items-center justify-between gap-2 text-sm font-semibold">
              <span>{t(STATION_KEY[type])}</span>
              {probabilities[type] === leading && (
                <span className="text-xs">{t("trainTrade.stationTool.planner.highest")}</span>
              )}
            </header>
            <strong className="mt-2 block text-2xl tabular-nums">{probabilities[type]}%</strong>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-background/65">
              <i className="block h-full bg-current" style={{ width: `${probabilities[type]}%` }} />
            </div>
          </article>
        ))}
      </div>
      {combinations.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-semibold">
            {t("trainTrade.stationTool.planner.combinationHeading", { start: start + 1, end: start + 3 })}
          </h4>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {combinations.map(([key, count]) => (
              <div key={key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <span className="min-w-0">
                  {key.split(",").map((type) => t(STATION_KEY[type as StationType])).join(" → ")}
                </span>
                <strong className="tabular-nums text-[color:var(--arkive-nav-active)]">{Math.round((count / combinationTotal) * 100)}%</strong>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function StepNumber({ value }: { value: number }) {
  return (
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[color:var(--arkive-nav-accent)] text-xs font-semibold text-primary-foreground">
      {value}
    </span>
  );
}

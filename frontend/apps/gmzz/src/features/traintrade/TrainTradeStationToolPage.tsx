import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { IconArrowBackUp, IconArrowRight, IconMinus, IconPlus, IconRefresh } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useDocumentTitle } from "@gamemap/ui";
import { ContentPage } from "@/components/ContentPage";
import { loadTrainTradeRouteProfiles } from "@/features/traintrade/data";
import type { TrainTradeDifficultyId, TrainTradeRouteProfile } from "@/features/traintrade/routeProfiles";
import {
  HINT_IDS,
  STATION_TYPES,
  createRouteModel,
  getAvailableHints,
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
import "./station.css";

const STATION_KEY: Record<StationType, string> = {
  winery: "trainTrade.station.wine",
  food: "trainTrade.station.food",
  trade: "trainTrade.station.art",
};

const P = "trainTrade.stationTool.planner";

/** How many stops the probability cards cover: the decision and the four after it. */
const ODDS_SPAN = 5;

/**
 * The page counts stops as the player sees them: tile 0 is the origin, tile k
 * is "stop k+1" and solver position k-1. The origin has no position — the game
 * never asks about it, and the station mix it shows counts only the stops after.
 */
const tilePosition = (tile: number) => tile - 1;

/** An even split to start the mix from; the player corrects it to what the game shows. */
const evenMix = (stops: number): StationTotals => {
  const base = Math.floor(stops / 3);
  const extra = stops % 3;
  return { winery: base + (extra > 0 ? 1 : 0), food: base + (extra > 1 ? 1 : 0), trade: base };
};

export default function TrainTradeStationToolPage() {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<TrainTradeRouteProfile[] | null>(null);
  const [dataError, setDataError] = useState(false);
  const [difficulty, setDifficulty] = useState<TrainTradeDifficultyId | "">("");
  const [mix, setMix] = useState<StationTotals | null>(null);
  const [originHint, setOriginHint] = useState<HintId | "">("");
  const [steps, setSteps] = useState<ConfirmedStep[]>([]);
  const [pendingCurrent, setPendingCurrent] = useState<StationType | "">("");
  const [pendingHint, setPendingHint] = useState<HintId | "">("");

  useDocumentTitle(`${t("trainTrade.stationTool.title")} - ${t("trainTrade.stationTool.productTitle")}`);

  useEffect(() => {
    let active = true;
    loadTrainTradeRouteProfiles()
      .then((entries) => { if (active) setProfiles(entries); })
      .catch((reason) => {
        console.error(reason);
        if (active) setDataError(true);
      });
    return () => { active = false; };
  }, []);

  const profile = profiles?.find((item) => item.id === difficulty);
  const stops = profile?.stops ?? 0;
  const mixSum = mix ? STATION_TYPES.reduce((sum, type) => sum + mix[type], 0) : 0;
  const totals = mix && mixSum === stops ? mix : null;
  const tileCount = profile ? stops + 1 : 0;

  const routeModel = useMemo(
    () => (totals ? createRouteModel(totals, stops, originHint, steps) : null),
    [totals, stops, originHint, steps],
  );

  const clearRoute = () => {
    setOriginHint("");
    setSteps([]);
    setPendingCurrent("");
    setPendingHint("");
  };

  const changeDifficulty = (next: TrainTradeDifficultyId) => {
    const nextProfile = profiles?.find((item) => item.id === next);
    setDifficulty(next);
    setMix(nextProfile ? evenMix(nextProfile.stops) : null);
    clearRoute();
  };

  const changeMix = (type: StationType, value: number) => {
    if (!mix || !Number.isFinite(value)) return;
    setMix({ ...mix, [type]: Math.max(0, Math.min(stops, Math.round(value))) });
    clearRoute();
  };

  const undo = () => {
    if (steps.length > 0) setSteps((current) => current.slice(0, -1));
    else setOriginHint("");
    setPendingCurrent("");
    setPendingHint("");
  };

  // The decision in front of the player, and the model as it would be once confirmed.
  const complete = Boolean(originHint) && steps.length >= stops;
  const position = steps.length;
  const decision = useMemo(() => {
    if (!routeModel || routeModel.count === 0 || complete) return null;
    if (!originHint) {
      return {
        tile: 0,
        needsHint: true,
        current: "" as StationType | "",
        locked: true,
        availableCurrent: new Set<StationType>(),
        availableHints: getAvailableHints(routeModel, 0),
        preview: refineRouteModel(routeModel, -1, "", 0, pendingHint),
        windowStart: 1,
      };
    }
    const hintStart = position + 1;
    const needsHint = position + 3 < routeModel.totalStops;
    const probability = probabilityFor(routeModel, position);
    const certain = STATION_TYPES.find((type) => probability[type] === 1);
    const current = certain ?? pendingCurrent;
    const hint = needsHint ? pendingHint : "";
    return {
      tile: steps.length + 1,
      needsHint,
      current,
      locked: Boolean(certain),
      availableCurrent: new Set(STATION_TYPES.filter((type) => prospectiveRouteCount(routeModel, position, type, hintStart, "") > 0)),
      availableHints: getAvailableHints(routeModel, hintStart, position, current),
      preview: refineRouteModel(routeModel, position, current, hintStart, hint),
      windowStart: steps.length + 2,
    };
  }, [routeModel, complete, originHint, pendingHint, pendingCurrent, position, steps.length]);

  // On phones the track is a scrolling strip; keep the stop being decided in view.
  const trackRef = useRef<HTMLOListElement>(null);
  const focusTile = decision?.tile ?? -1;
  useEffect(() => {
    const track = trackRef.current;
    const tile = track?.children[focusTile] as HTMLElement | undefined;
    if (!track || !tile || track.scrollWidth <= track.clientWidth) return;
    track.scrollTo({ left: tile.offsetLeft - track.offsetLeft - track.clientWidth / 2 + tile.offsetWidth / 2, behavior: "smooth" });
  }, [focusTile]);

  const canConfirm = Boolean(decision)
    && (decision?.tile === 0 || Boolean(decision?.current))
    && (!decision?.needsHint || Boolean(pendingHint))
    && (decision?.preview.count ?? 0) > 0;

  const confirm = () => {
    if (!decision || !canConfirm) return;
    if (decision.tile === 0) {
      setOriginHint(pendingHint);
    } else if (decision.current) {
      const step: ConfirmedStep = { currentType: decision.current, hintId: decision.needsHint ? pendingHint : "" };
      setSteps((current) => [...current, step]);
    }
    setPendingCurrent("");
    setPendingHint("");
  };

  // The track reads the decision preview, so a pick shows its effect before it is confirmed.
  const shownModel = decision && decision.preview.count > 0 ? decision.preview : routeModel;
  const tiles = useMemo(() => Array.from({ length: tileCount }, (_, tile) => {
    const at = tilePosition(tile);
    const probability = shownModel && at >= 0 ? probabilityFor(shownModel, at) : null;
    const fixed = tile >= 1 && tile <= steps.length ? steps[tile - 1].currentType : undefined;
    const deduced = !fixed && probability ? STATION_TYPES.find((type) => probability[type] === 1) : undefined;
    return { tile, probability, fixed, deduced };
  }), [tileCount, shownModel, steps]);

  const remaining = totals ? { ...totals } : null;
  if (remaining) steps.forEach(({ currentType }) => { remaining[currentType] = Math.max(0, remaining[currentType] - 1); });

  const historyEntries = useMemo(() => {
    const stopLabel = (tile: number) => t(`${P}.stationNumber`, { station: tile + 1 });
    const entries: { key: string; title: string; hint: HintId | ""; range: string }[] = [];
    if (originHint) {
      entries.push({ key: "origin", title: t(`${P}.startStation`), hint: originHint, range: t(`${P}.historyRange`, { start: 2, end: 4 }) });
    }
    steps.forEach((step, index) => {
      entries.push({
        key: `step-${index}`,
        title: `${stopLabel(index + 1)} · ${t(STATION_KEY[step.currentType])}`,
        hint: step.hintId,
        range: step.hintId ? t(`${P}.historyRange`, { start: index + 3, end: index + 5 }) : "",
      });
    });
    return entries;
  }, [originHint, steps, t]);

  const page = (body: ReactNode) => (
    <ContentPage active="/tools/traintrade-station" title={t("trainTrade.stationTool.title")} wide>{body}</ContentPage>
  );
  if (dataError) return page(<p className="text-sm text-muted-foreground">{t("trainTrade.stationTool.loadError")}</p>);
  if (!profiles) return page(<p className="text-sm text-muted-foreground">{t("loading")}</p>);

  const windowTiles = decision
    ? Array.from({ length: 3 }, (_, index) => decision.windowStart + index).filter((tile) => tile < tileCount)
    : [];
  const oddsTiles = decision
    ? Array.from({ length: ODDS_SPAN }, (_, index) => Math.max(decision.tile, 1) + index).filter((tile) => tile < tileCount)
    : [];

  const actions = (
    <div className="st-actions">
      <button type="button" className="st-btn" disabled={!originHint} onClick={undo} data-testid="planner-undo">
        <IconArrowBackUp aria-hidden stroke={1.8} />{t(`${P}.undo`)}
      </button>
      <button type="button" className="st-btn" disabled={!originHint} onClick={clearRoute} data-testid="planner-restart">
        <IconRefresh aria-hidden stroke={1.8} />{t(`${P}.restart`)}
      </button>
      {decision && (
        <button type="button" className="st-go" disabled={!canConfirm} onClick={confirm}
          data-testid={decision.tile === 0 ? "planner-confirm-origin" : "planner-confirm-step"}>
          {t(`${P}.confirm`)}<IconArrowRight aria-hidden stroke={2} />
        </button>
      )}
    </div>
  );

  return page(
    <div className="gz-st" data-testid="train-trade-station-tool">
      <aside className="st-set st-tint">
        <h1>{t("trainTrade.stationTool.title")}</h1>
        <div className="st-diff" role="group" aria-label={t(`${P}.difficultyHeading`)} data-testid="planner-difficulty">
          {profiles.map((item) => (
            <button key={item.id} type="button" aria-pressed={item.id === difficulty} onClick={() => changeDifficulty(item.id)}>
              {t(`${P}.difficultyProfile.${item.id}.name`)}
            </button>
          ))}
        </div>
        {profile && (
          <div className="st-about">
            <small>{t(`${P}.difficultyProfile.${profile.id}.price`)}</small>
            <small>{t(`${P}.difficultyProfile.${profile.id}.stock`)}</small>
          </div>
        )}

        {profile && mix && (
          <section className="st-mix" aria-labelledby="st-mix-title" data-testid="planner-mix">
            <div className="st-mtitle">
              <h2 id="st-mix-title">{t(`${P}.stationMixHeading`)}</h2>
              <span className="num" data-ok={mixSum === stops || undefined}>{t(`${P}.mixSum`, { sum: mixSum, total: stops })}</span>
            </div>
            <div className="st-kv">
              {STATION_TYPES.map((type) => (
                <div key={type} data-type={type}>
                  <span>{t(STATION_KEY[type])}</span>
                  <div className="st-step">
                    <button type="button" aria-label={`${t(STATION_KEY[type])} ${t(`${P}.decrease`)}`} disabled={mix[type] <= 0}
                      onClick={() => changeMix(type, mix[type] - 1)}><IconMinus aria-hidden stroke={2.4} /></button>
                    <input className="num" type="number" inputMode="numeric" min={0} max={stops} value={mix[type]}
                      aria-label={t(STATION_KEY[type])} onChange={(event) => changeMix(type, event.target.valueAsNumber)} />
                    <button type="button" aria-label={`${t(STATION_KEY[type])} ${t(`${P}.increase`)}`} disabled={mixSum >= stops}
                      onClick={() => changeMix(type, mix[type] + 1)}><IconPlus aria-hidden stroke={2.4} /></button>
                  </div>
                  <small className="num">{t(`${P}.stationRemaining`, { count: remaining ? remaining[type] : mix[type] })}</small>
                </div>
              ))}
            </div>
          </section>
        )}
      </aside>

      <section className="st-main" aria-live="polite">
        {!profile ? (
          <Empty title={t(`${P}.chooseDifficultyTitle`)} detail={t(`${P}.chooseDifficultyDetail`)} />
        ) : !routeModel ? (
          <Empty title={t(`${P}.configureTitle`)} detail={t(`${P}.configureDetail`, { total: stops })} />
        ) : (
          <>
            <header className="st-head">
              <h2>{t(`${P}.workspaceTitle`)}</h2>
              <span className="num">{t(`${P}.progressReadout`, { current: originHint ? steps.length + 1 : 0, total: tileCount })}</span>
            </header>

            <ol ref={trackRef} className="st-track" aria-label={t(`${P}.stationProgress`)} style={{ "--n": tileCount } as CSSProperties}>
              {tiles.map(({ tile, probability, fixed, deduced }) => {
                const isCurrent = decision?.tile === tile;
                const inWindow = windowTiles.includes(tile);
                const known = fixed ?? deduced;
                const state = isCurrent ? "current" : fixed ? "fixed" : deduced ? "deduced" : inWindow ? "window" : "pending";
                const label = tile === 0
                  ? t(`${P}.startStation`)
                  : known ? t(STATION_KEY[known]) : isCurrent ? t(`${P}.stationCurrent`) : t(`${P}.stationPending`);
                return (
                  <li key={tile} className="st-tile" data-state={state} data-type={known}>
                    <b className="num">{tile + 1}</b>
                    <span>{label}</span>
                    {probability && !fixed && <Bar probability={probability} />}
                  </li>
                );
              })}
            </ol>

            {complete ? (
              <div className="st-panel">
                <p className="st-done">{t(`${P}.routeComplete`, { count: tileCount })}</p>
                {actions}
              </div>
            ) : routeModel.count === 0 ? (
              <div className="st-panel">
                <p className="st-warn">{t(`${P}.noRoute`)}</p>
                {actions}
              </div>
            ) : decision && (
              <div className="st-decide">
                <div className="st-panel">
                  <div className="st-stop">
                    {/* The stop being decided, tinted with the station picked for it. */}
                    <h3 className="st-badge" data-type={decision.current || undefined} data-origin={decision.tile === 0 || undefined}>
                      <small>{decision.tile === 0 ? t(`${P}.startStation`) : t(`${P}.stationCurrent`)}</small>
                      <b className="num">{decision.tile + 1}</b>
                      {decision.tile > 0 && (
                        <span>{decision.locked ? t(`${P}.lockedAt`) : decision.current ? t(STATION_KEY[decision.current]) : t(`${P}.stationPending`)}</span>
                      )}
                    </h3>
                    <div className="st-rows">
                      {decision.tile > 0 && (
                        <div className="st-row">
                          <span>{t(`${P}.stationKind`)}</span>
                          <div className="st-pills" role="group" aria-label={t(`${P}.currentStation`)} data-testid="planner-current-station">
                            {STATION_TYPES.map((type) => (
                              <button key={type} type="button" data-type={type} aria-pressed={decision.current === type}
                                disabled={decision.locked || !decision.availableCurrent.has(type)} onClick={() => setPendingCurrent(type)}>
                                {t(STATION_KEY[type])}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="st-row">
                        <span>
                          {t(`${P}.futureHint`)}
                          {decision.needsHint && <em>{t(`${P}.historyRange`, { start: decision.windowStart + 1, end: decision.windowStart + 3 })}</em>}
                        </span>
                        {decision.needsHint ? (
                          <div className="st-pills" role="group" aria-label={t(`${P}.futureHint`)} data-testid="planner-hint">
                            {HINT_IDS.map((hint) => {
                              const enabled = decision.availableHints.has(hint);
                              return (
                                <button key={hint} type="button" aria-pressed={pendingHint === hint} disabled={!enabled}
                                  title={enabled ? undefined : t(`${P}.hintUnavailable`)} onClick={() => setPendingHint(hint)}>
                                  {t(`${P}.hint.${hint}`)}
                                </button>
                              );
                            })}
                          </div>
                        ) : <p className="st-note">{t(`${P}.noFutureHint`)}</p>}
                      </div>
                      {decision.preview.count === 0 && <p className="st-warn">{t(`${P}.noRoute`)}</p>}
                    </div>
                  </div>
                  {actions}
                </div>

                <div className="st-odds" aria-labelledby="st-odds-title">
                  <h3 id="st-odds-title">{t(`${P}.probabilityHeading`)}</h3>
                  {oddsTiles.map((tile) => (
                    <Odds key={tile} tile={tile} model={decision.preview.count > 0 ? decision.preview : routeModel} current={tile === decision.tile} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </section>

      <section className="st-hist st-tint" aria-labelledby="st-hist-title">
        <div className="st-htitle">
          <h2 id="st-hist-title">{t(`${P}.historyHeading`)}</h2>
          <span className="num">{t(`${P}.historyCount`, { count: historyEntries.length })}</span>
        </div>
        {historyEntries.length > 0 ? (
          <ol>
            {historyEntries.map((entry) => (
              <li key={entry.key}>
                <strong>{entry.title}</strong>
                {entry.hint && <span><em>{entry.range}</em>{t(`${P}.hint.${entry.hint}`)}</span>}
              </li>
            ))}
          </ol>
        ) : <p className="st-note">{t(`${P}.historyEmpty`)}</p>}
      </section>
    </div>,
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return <div className="st-empty"><strong>{title}</strong><span>{detail}</span></div>;
}

function Bar({ probability }: { probability: StationTotals }) {
  return (
    <i className="st-bar" aria-hidden>
      {STATION_TYPES.map((type) => <i key={type} data-type={type} style={{ flexGrow: probability[type] }} />)}
    </i>
  );
}

function Odds({ tile, model, current }: { tile: number; model: RouteModel; current: boolean }) {
  const { t } = useTranslation();
  const values = roundedProbabilities(probabilityFor(model, tilePosition(tile)));
  const leading = Math.max(...STATION_TYPES.map((type) => values[type]));
  return (
    <article className="st-odd" data-current={current || undefined}>
      <strong>{t(`${P}.stationNumber`, { station: tile + 1 })}</strong>
      {STATION_TYPES.map((type) => (
        <div key={type} data-type={type} data-lead={leading > 0 && values[type] === leading || undefined}>
          <span>{t(STATION_KEY[type])}</span>
          <i><i style={{ width: `${values[type]}%` }} /></i>
          <b className="num">{values[type]}%</b>
        </div>
      ))}
    </article>
  );
}

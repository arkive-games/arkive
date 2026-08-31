const TYPES = ["winery", "food", "trade"];
const ORIGIN_TYPE = "origin";
const TYPE_LABELS = { origin: "始发站", winery: "酒庄", food: "食铺", trade: "商行" };
const CURRENT_STATION_TYPES = [ORIGIN_TYPE, ...TYPES];
const DIFFICULTIES = [
  { id: "beginner", name: "新手线路", description: "低难度提供更明确的后续站点信息。", routeStops: 8, stops: 7, areas: "4 + 4" },
  { id: "normal", name: "普通线路", description: "标准路线，按区域逐步展开。", routeStops: 8, stops: 7, areas: "4 + 4" },
  { id: "advanced", name: "进阶线路", description: "区域数量增加，策略卡成为路线判断的核心。", routeStops: 12, stops: 11, areas: "4 + 4 + 4" },
  { id: "hard", name: "困难线路", description: "高难度区域没有连续站点保护。", routeStops: 15, stops: 14, areas: "5 + 5 + 5" },
  { id: "challenge", name: "挑战线路", description: "只能看到未来三站最多类型，需要结合预测信息判断。", routeStops: 16, stops: 15, areas: "4 + 4 + 4 + 4" },
];
const HINTS = [
  { id: "winery-most", label: "酒庄站数量最多" }, { id: "food-most", label: "食铺站数量最多" },
  { id: "trade-most", label: "商行站数量最多" }, { id: "equal", label: "各站点数量相同" },
];
const strategyPrefix = (card) => String(card?.name || "").split("·")[0].replace(/[IV]+$/, "");
const STRATEGY_PREFIXES = [...new Set(STRATEGIES.map(strategyPrefix))].sort((a, b) => a.localeCompare(b, "zh-CN"));
const state = { difficulty: "", phase: "setup", totals: { winery: 0, food: 0, trade: 0 }, recommendedTypes: ["", ""], strategySelections: [null, null, null], strategyPickerSlot: 0, strategySearch: "", strategyPrefixFilter: "all", strategyOptions: [], selectedStrategy: "", recommendedStrategy: "", pendingHint: "", pendingCurrent: "", hints: [], confirmedTypes: [], currentIndex: 0, routes: [], candidates: [], stationOffset: 0 };
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
function strategyById(id) { return STRATEGIES.find((card) => String(card.id) === String(id)) || null; }
function strategyLevelClass(card) { return `strategy-level-${card?.level || 1}`; }
function activeDifficulty() { return DIFFICULTIES.find((item) => item.id === state.difficulty) || null; }
function stationCount() { return activeDifficulty()?.stops || 0; }
function balancedTotals(total) { const base = Math.floor(total / 3); return { winery: base + (total % 3 > 0), food: base + (total % 3 > 1), trade: base }; }
function readTotals() { return Object.fromEntries(TYPES.map((type) => [type, Math.max(0, Number($(`${type}-total`)?.value) || 0)])); }
function normalisedTotals() { const target = stationCount(); const input = state.totals; const sum = TYPES.reduce((a, type) => a + input[type], 0); if (!sum) return balancedTotals(target); const scaled = TYPES.map((type) => ({ type, value: input[type] * target / sum })); const out = Object.fromEntries(scaled.map(({ type }) => [type, Math.floor(input[type] * target / sum)])); let left = target - TYPES.reduce((a, type) => a + out[type], 0); scaled.sort((a, b) => (b.value - Math.floor(b.value)) - (a.value - Math.floor(a.value))); for (let i = 0; i < left; i += 1) out[scaled[i % 3].type] += 1; return out; }
function syncTotalsInputs() { TYPES.forEach((type) => { const input = $(`${type}-total`); if (input) input.value = state.totals[type]; }); }
function renderStrategyFilter() { const prefixOptions = $("strategy-prefix-options"); if (prefixOptions) { prefixOptions.innerHTML = [`<button type="button" class="strategy-filter ${state.strategyPrefixFilter === "all" ? "is-active" : ""}" data-strategy-prefix="all">全部</button>`, ...STRATEGY_PREFIXES.map((prefix) => `<button type="button" class="strategy-filter ${state.strategyPrefixFilter === prefix ? "is-active" : ""}" data-strategy-prefix="${escapeHtml(prefix)}">${escapeHtml(prefix)}</button>`)].join(""); } }
function renderStrategyPicker() { const grid = $("strategy-picker-grid"); if (!grid) return; renderStrategyFilter(); const used = new Set(state.strategySelections.filter(Boolean).map((id) => String(id))); const query = state.strategySearch.trim().toLowerCase(); const cards = STRATEGIES.filter((card) => (state.strategyPrefixFilter === "all" || strategyPrefix(card) === state.strategyPrefixFilter) && (!query || [card.name, card.text, card.label].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)))); grid.innerHTML = cards.length ? cards.map((card) => `<button type="button" class="strategy-picker-item ${strategyLevelClass(card)}" data-strategy-choice="${card.id}" ${used.has(String(card.id)) ? "disabled" : ""}><strong>${escapeHtml(card.name)} <small>等级 ${card.level}</small></strong><span>${escapeHtml(card.text)}</span></button>`).join("") : `<p class="strategy-search-empty">没有匹配的策略卡</p>`; }
function renderRecommendedOptions() { const labels = { WINE: "酒类", FOOD: "食物类", ART: "艺术类" }; [1, 2].forEach((slot) => { const select = $(`recommend-category-${slot}`); if (!select) return; select.innerHTML = `<option value="">未选择</option>${Object.entries(labels).map(([key, label]) => `<option value="${key}" ${state.recommendedTypes[slot - 1] === key ? "selected" : ""}>${label}</option>`).join("")}`; }); const first = state.recommendedTypes[0]; const second = $("recommend-category-2"); if (second) [...second.options].forEach((option) => { option.disabled = Boolean(first) && option.value === first; }); }
function renderDifficulty() { const select = $("difficulty-select"); select.innerHTML = `<option value="">点这里选择</option>${DIFFICULTIES.map((item) => `<option value="${item.id}">${item.name}</option>`).join("")}`; select.value = state.difficulty; const profile = activeDifficulty(); $("difficulty-description").innerHTML = profile ? `<strong>${profile.name}</strong><span>${profile.description}</span>` : "选择路线后查看该难度的规则摘要。"; const area = $("rule-area-count"); if (area) area.textContent = profile ? `${profile.areas}（路线 ${profile.routeStops} 站，剩余 ${profile.stops} 站）` : "—"; }
function renderQuotaStatus() {
  state.totals = readTotals();
  const effective = normalisedTotals();
  const consumed = Object.fromEntries(TYPES.map((type) => [type, 0]));
  // Only confirmed stations consume quota. A 100% forecast is still a forecast
  // until the player advances, and stale entries after a back step must not be
  // counted against the current station.
  state.confirmedTypes.slice(0, state.currentIndex).forEach((type) => { if (consumed[type] !== undefined) consumed[type] += 1; });
  if (state.phase === "station" && state.pendingCurrent && state.pendingCurrent !== ORIGIN_TYPE && consumed[state.pendingCurrent] !== undefined) consumed[state.pendingCurrent] += 1;
  TYPES.forEach((type) => { const node = $(`remaining-${type}`); if (node) node.textContent = Math.max(0, effective[type] - consumed[type]); });
}
function generateRoutes() {
  const totals = normalisedTotals();
  const target = stationCount();
  const routes = [];
  const route = [];
  const remaining = Object.fromEntries(TYPES.map((type) => [type, totals[type]]));

  // Enumerate every distinct multiset permutation. The route length is at
  // most 15, so the largest supported pool (5/5/5) is 756,756 routes.
  const visit = () => {
    if (route.length === target) {
      routes.push(route.slice());
      return;
    }
    TYPES.forEach((type) => {
      if (!remaining[type]) return;
      remaining[type] -= 1;
      route.push(type);
      visit();
      route.pop();
      remaining[type] += 1;
    });
  };
  if (target) visit();
  state.routes = routes;
  state.candidates = routes;
}
function matchesHint(route, start, hintId) { const window = route.slice(start, Math.min(route.length, start + 3)); if (!window.length) return false; const counts = Object.fromEntries(TYPES.map((type) => [type, window.filter((x) => x === type).length])); const max = Math.max(...TYPES.map((type) => counts[type])); if (hintId === "equal") { const presentCounts = TYPES.map((type) => counts[type]).filter((count) => count > 0); return presentCounts.length >= 2 && new Set(presentCounts).size === 1; } const type = hintId.replace("-most", ""); return counts[type] === max; }
function filteredCandidates(includePendingCurrent = true) { let routes = state.routes; state.hints.forEach((hint, index) => { routes = routes.filter((route) => matchesHint(route, index, hint)); }); state.confirmedTypes.slice(0, state.currentIndex).forEach((type, index) => { routes = routes.filter((route) => route[index] === type); }); if (state.pendingHint) { const hintStart = state.phase === "station" ? state.currentIndex + 1 : state.currentIndex; routes = routes.filter((route) => matchesHint(route, hintStart, state.pendingHint)); } if (includePendingCurrent && state.pendingCurrent && state.pendingCurrent !== ORIGIN_TYPE) routes = routes.filter((route) => route[state.currentIndex] === state.pendingCurrent); return routes; }
function probabilityAt(routes, position) { const count = routes.length || 1; return Object.fromEntries(TYPES.map((type) => [type, Math.round(routes.filter((route) => route[position] === type).length * 100 / count)])); }
function stationOptionsMarkup(selected = "", lockSelection = "", routes = state.routes) {
  return `<div class="station-option-grid${lockSelection ? " is-locked" : ""}" role="group" aria-label="当前站点">${CURRENT_STATION_TYPES.map((type) => {
    const isSelected = type === selected;
    const isOrigin = type === ORIGIN_TYPE;
    const available = isOrigin || (routes.length > 0 && routes.some((route) => route[state.currentIndex] === type));
    const disabled = Boolean(lockSelection) || isOrigin || !available;
    return `<button type="button" class="station-option station-option-${type}${isSelected ? " is-selected" : ""}${isOrigin && disabled ? " is-origin-disabled" : ""}" data-current-type="${type}" aria-pressed="${isSelected}" ${disabled ? "disabled" : ""}>${TYPE_LABELS[type]}</button>`;
  }).join("")}</div>`;
}
function hintOptionsMarkup(selected = "", routes = state.routes, start = state.currentIndex) {
  return `<div class="hint-option-grid" role="group" aria-label="未来三站信息">${HINTS.map((hint) => {
    const available = routes.length > 0 && routes.some((route) => matchesHint(route, start, hint.id));
    return `<button type="button" class="hint-option${selected === hint.id ? " is-selected" : ""}" data-hint-id="${hint.id}" aria-pressed="${selected === hint.id}" ${available ? "" : "disabled"}>${hint.label}</button>`;
  }).join("")}</div>`;
}
function probabilityValuesMarkup(probability) {
  const max = Math.max(...TYPES.map((type) => probability[type]));
  return `<div class="station-probability-values">${TYPES.map((type) => {
    const leading = max > 0 && probability[type] === max;
    return `<span class="station-probability-value ${type}${leading ? " is-leading" : ""}${probability[type] === 100 ? " is-certain" : ""}"><b>${TYPE_LABELS[type]}</b><strong>${probability[type]}%</strong></span>`;
  }).join("")}</div>`;
}
function stationProbabilitiesMarkup(routes, start) {
  const positions = Array.from({ length: 3 }, (_, index) => start + index).filter((position) => position < stationCount());
  return `<div class="station-probability-list">${positions.map((position) => `<article class="station-probability-row"><div class="station-probability-station"><strong>第 ${position + 2} 站</strong></div>${probabilityValuesMarkup(probabilityAt(routes, position))}</article>`).join("")}</div>`;
}
function renderStationStrip() {
  const total = stationCount();
  const displayTotal = total + 1;
  const routes = state.routes.length ? state.candidates : state.routes;
  const visible = Math.min(6, Math.max(3, displayTotal || 3));
  const maxOffset = Math.max(0, displayTotal - visible);
  const offset = Math.min(maxOffset, state.stationOffset || 0);
  const node = $("confirmed-stations");
  if (!node) return;
  node.innerHTML = Array.from({ length: visible }, (_, slot) => {
    const displayIndex = offset + slot;
    if (displayIndex === 0) {
      const originCurrent = state.phase === "setup" || state.phase === "strategy";
      const classes = `station-cell station-origin ${originCurrent ? "is-current" : "is-confirmed"}`;
      return `<article class="${classes}"><small>第 1 站</small><strong>始发站</strong></article>`;
    }
    const routeIndex = displayIndex - 1;
    const probability = routes.length ? probabilityAt(routes, routeIndex) : {};
    const certain = TYPES.find((type) => probability[type] === 100);
    const known = state.confirmedTypes[routeIndex];
    const label = known ? TYPE_LABELS[known] : certain ? TYPE_LABELS[certain] : "待确认";
    const isCurrent = state.phase === "station" && routeIndex === state.currentIndex;
    const isConfirmed = state.phase === "finished" || routeIndex < state.currentIndex;
    const classes = ["station-cell", isConfirmed ? "is-confirmed" : "", isCurrent ? "is-current" : "", !known && !isCurrent && !isConfirmed ? "is-window" : ""].join(" ");
    return `<article class="${classes}"><small>第 ${routeIndex + 2} 站</small><strong>${label}</strong></article>`;
  }).join("");
  if ($("station-prev")) $("station-prev").disabled = offset === 0;
  if ($("station-next")) $("station-next").disabled = offset >= maxOffset;
  if ($("progress-readout")) $("progress-readout").textContent = state.difficulty ? `${state.currentIndex}/${total} 站` : "选择路线后开始";
}
function renderHistory() {
  const list = $("history-list");
  if (!list) return;
  list.innerHTML = state.hints.length ? state.hints.map((hint, index) => {
    const stationType = index === 0 ? ORIGIN_TYPE : state.confirmedTypes[index - 1];
    const rangeStart = index + 2;
    const rangeEnd = Math.min(stationCount() + 1, index + 4);
    const hintLabel = HINTS.find((item) => item.id === hint)?.label || hint;
    return `<li class="history-entry"><div class="history-entry-body"><div class="history-entry-meta"><strong>第 ${index + 1} 站</strong><span>${TYPE_LABELS[stationType] || "待确认"}</span></div><small>第 ${rangeStart}-${rangeEnd} 站 · ${hintLabel}</small></div></li>`;
  }).join("") : `<li class="history-empty">暂无站点提示记录</li>`;
  $("history-count").textContent = `${state.hints.length} 条`;
}
function nextStationProbability() {
  const routes = state.routes.length ? state.candidates : state.routes;
  const position = state.phase === "strategy" ? 0 : Math.min(state.currentIndex + 1, Math.max(0, stationCount() - 1));
  return probabilityAt(routes, position);
}
function strategyStationType(card) {
  const value = card?.triggerConditions?.find((condition) => condition.ConditionType === "NEXT_STATION_TYPE")?.Value;
  return value === "Wine_Station" ? "winery" : value === "Food_Station" ? "food" : value === "Artwork_Station" ? "trade" : "";
}
function strategyActivationChance(card, probability) {
  const type = strategyStationType(card);
  if (!type) return 100;
  const chance = probability[type] || 0;
  return String(card.name || "").includes("·非") ? 100 - chance : chance;
}
function strategyScore(card) {
  if (!card) return 0;
  const inverseTrigger = String(card.name || "").includes("·非");
  const effects = inverseTrigger ? (card.notEffects || []) : (card.effects || []);
  return effects.reduce((score, effect) => {
    const values = Array.isArray(effect.Value) ? effect.Value : [effect.Value];
    const magnitude = values.reduce((sum, value) => sum + (typeof value === "number" ? Math.abs(value) : 0), 0);
    const weight = effect.EffectType === "GAIN_COIN" ? 1
      : effect.EffectType === "GAIN_COIN_PERCENT" ? Math.max(1, magnitude / 10)
        : effect.EffectType === "MODIFY_NEXT_STATION_PRICE" ? Math.max(1, magnitude / 20)
          : effect.EffectType === "PERSISTENT_PRICE_CHANGE" ? Math.max(1, magnitude / 15)
            : effect.EffectType === "GAIN_ITEM_PERCENT" ? Math.max(1, magnitude / 25)
              : effect.EffectType === "GAIN_ITEM" ? Math.max(1, magnitude / 20)
                : effect.EffectType === "TRANSFORM_ITEM" ? Math.max(1, magnitude)
                  : 1;
    return score + weight;
  }, 0);
}
function renderStrategySlots() {
  const probability = nextStationProbability();
  const ranked = state.strategySelections.filter(Boolean).map((id) => {
    const card = strategyById(id);
    return { id, activation: strategyActivationChance(card, probability), score: strategyScore(card) };
  }).sort((a, b) => b.activation - a.activation || b.score - a.score);
  state.recommendedStrategy = ranked[0]?.id || "";
  return state.strategySelections.map((id, index) => {
    const card = id ? strategyById(id) : null;
    const recommended = card && String(id) === String(state.recommendedStrategy);
    const selected = card && String(id) === String(state.selectedStrategy);
    return `<div class="strategy-slot"><button type="button" class="strategy-picker${card ? ` ${strategyLevelClass(card)}` : ""}${recommended ? " is-recommended" : ""}${selected ? " is-selected" : ""}" data-strategy-slot="${index}" aria-pressed="${selected}" aria-label="${card ? `采用策略卡 ${index + 1}：${card.name}` : `选择策略卡 ${index + 1}`}" title="${card ? "点击采用此策略卡" : "选择策略卡"}">${card ? `<span class="strategy-picker-main"><strong>${escapeHtml(card.name)}</strong>${recommended ? `<span class="strategy-recommendation">推荐</span>` : ""}</span>` : `<span class="supply-placeholder">＋</span><span>选择策略卡</span>`}</button>${card ? `<button type="button" class="strategy-edit-button" data-strategy-edit="${index}" aria-label="更换策略卡 ${index + 1}" title="更换策略卡"><span aria-hidden="true">↻</span></button>` : ""}</div>`;
  }).join("");
}
function renderStrategyCards() { return `<div class="strategy-choice"><label>策略卡</label><div class="strategy-picker-row">${renderStrategySlots()}</div></div>`; }
function renderStation() { const routes = state.routes.length ? state.candidates : state.routes; const currentBaseRoutes = filteredCandidates(false); const currentProbability = probabilityAt(currentBaseRoutes, state.currentIndex); const currentCertain = state.pendingCurrent ? "" : TYPES.find((type) => currentProbability[type] === 100) || ""; const current = currentCertain || state.pendingCurrent; const currentStation = state.currentIndex + 2; const currentMarkup = stationOptionsMarkup(current, currentCertain, currentBaseRoutes); const candidateMessage = state.pendingCurrent && state.pendingHint && !filteredCandidates().length ? `<p class="sequence-note error-note">当前站点与未来提示没有可行路线，请调整选择。</p>` : ""; return `<section class="flow-card station-flow"><div class="flow-card-heading"><strong>第 ${currentStation} 站</strong><span>当前决策</span></div><div class="decision-input-grid"><div class="decision-field"><label>当前站点</label>${currentMarkup}</div><div class="decision-field"><label>未来三站信息</label><div class="hint-picker">${hintOptionsMarkup(state.pendingHint, routes, state.currentIndex + 1)}</div></div>${renderStrategyCards()}</div>${candidateMessage}</section><div class="resolved-window"><div class="window-meta"><span class="window-title">站点概率</span></div><div class="probability-section">${stationProbabilitiesMarkup(routes, state.currentIndex)}</div></div>`; }
function renderDecisionToolbar() { if (!state.difficulty) return ""; if (state.phase === "setup") return `<div class="bottom-actions is-setup"><button class="action-button action-restart" id="restart-step" type="button"><span class="action-icon" aria-hidden="true">↻</span><span>重新开始</span></button></div>`; const canAdvance = state.phase === "strategy" ? Boolean(state.pendingHint) : Boolean(state.pendingHint && (state.pendingCurrent || TYPES.some((type) => probabilityAt(state.candidates, state.currentIndex)[type] === 100)) && filteredCandidates().length); const canGoBack = state.phase !== "setup"; return `<nav class="bottom-actions" aria-label="推演操作"><button class="action-button action-back" id="undo-step" type="button" aria-label="返回上一步" ${canGoBack ? "" : "disabled"}><span class="action-icon" aria-hidden="true">←</span><span>返回上一步</span></button><button class="action-button action-restart" id="restart-step" type="button"><span class="action-icon" aria-hidden="true">↻</span><span>重新开始</span></button><button class="action-button action-primary" id="advance-step" type="button" ${canAdvance ? "" : "disabled"}><span>开启下一站</span><span class="action-icon" aria-hidden="true">→</span></button></nav>`; }
function renderInitialDecision() { const routes = state.routes.length ? state.candidates : state.routes; return `<section class="flow-card station-flow"><div class="flow-card-heading"><strong>始发站</strong><span>开局决策</span></div><div class="decision-input-grid"><div class="decision-field"><label>当前站点</label>${stationOptionsMarkup(ORIGIN_TYPE, ORIGIN_TYPE, routes)}</div><div class="decision-field"><label>未来三站信息</label><div class="hint-picker">${hintOptionsMarkup(state.pendingHint, routes, 0)}</div></div>${renderStrategyCards()}</div></section><div class="resolved-window"><div class="window-meta"><span class="window-title">站点概率</span></div><div class="probability-section">${stationProbabilitiesMarkup(routes, 0, "下一站")}</div></div>`; }
function renderForecast() { renderStationStrip(); renderHistory(); const intro = $("forecast-intro"); const content = $("forecast-content"); $("decision-toolbar").innerHTML = renderDecisionToolbar(); if (!state.difficulty) { intro.innerHTML = `<div class="setup-empty setup-empty--difficulty"><strong>请先在左侧选择难度</strong><span>填写站点统计后，再开始铁路大亨推演。</span></div>`; intro.classList.remove("is-hidden"); content.classList.add("is-hidden"); return; } if (state.phase === "setup") { intro.innerHTML = `<div class="setup-empty setup-empty--data"><strong>请先填写左侧站点数据</strong><button class="confirm-step setup-start-button" id="start-route-button" type="button">开始推演</button></div>`; intro.classList.remove("is-hidden"); content.classList.add("is-hidden"); return; } intro.classList.add("is-hidden"); content.classList.remove("is-hidden"); if (state.phase === "strategy") { content.innerHTML = renderInitialDecision(); return; } if (state.phase === "finished") { content.innerHTML = `<section class="flow-card"><div class="flow-card-heading"><strong>路线已完成</strong><span>${stationCount()} 站</span></div><p class="flow-copy">本次推演已完成。</p></section>`; return; } content.innerHTML = renderStation(); }
function resetPlanner() { Object.assign(state, { difficulty: "", phase: "setup", totals: { winery: 0, food: 0, trade: 0 }, recommendedTypes: ["", ""], strategySelections: [null, null, null], strategyPickerSlot: 0, strategySearch: "", strategyPrefixFilter: "all", strategyOptions: [], selectedStrategy: "", recommendedStrategy: "", pendingHint: "", pendingCurrent: "", hints: [], confirmedTypes: [], currentIndex: 0, routes: [], candidates: [], stationOffset: 0 }); renderRecommendedOptions(); renderDifficulty(); syncTotalsInputs(); renderQuotaStatus(); renderForecast(); }
function beginRoute() { state.totals = readTotals(); generateRoutes(); state.phase = "strategy"; state.currentIndex = 0; state.pendingHint = ""; state.pendingCurrent = ORIGIN_TYPE; state.hints = []; state.confirmedTypes = []; state.strategySelections = [null, null, null]; renderQuotaStatus(); renderForecast(); }
function enterStrategy() { state.phase = "strategy"; state.strategySelections = [null, null, null]; state.strategyOptions = []; state.selectedStrategy = ""; renderForecast(); }
function selectStrategy(id) { state.selectedStrategy = id; renderForecast(); }
function clearSelectedStrategy() { const selected = state.selectedStrategy; if (!selected) return; const remaining = state.strategySelections.filter((id) => id && String(id) !== String(selected)); state.strategySelections = [...remaining, ...Array(3 - remaining.length).fill(null)]; state.selectedStrategy = ""; state.recommendedStrategy = ""; }
function confirmStrategy() { if (!state.pendingHint) return; clearSelectedStrategy(); state.phase = "station"; state.currentIndex = 0; state.stationOffset = 0; state.confirmedTypes = []; state.hints = [state.pendingHint]; state.pendingHint = ""; state.pendingCurrent = ""; state.candidates = filteredCandidates(); renderForecast(); }
function confirmStation() { const current = state.pendingCurrent || TYPES.find((type) => probabilityAt(state.candidates, state.currentIndex)[type] === 100); if (!current || !state.pendingHint) return; clearSelectedStrategy(); state.confirmedTypes = state.confirmedTypes.slice(0, state.currentIndex); state.hints = state.hints.slice(0, state.currentIndex + 1); state.confirmedTypes.push(current); state.hints.push(state.pendingHint); state.currentIndex += 1; state.stationOffset = state.currentIndex; state.pendingCurrent = ""; state.pendingHint = ""; state.candidates = filteredCandidates(); if (state.currentIndex >= stationCount()) state.phase = "finished"; renderQuotaStatus(); renderForecast(); }

$("difficulty-select").addEventListener("change", (event) => { state.difficulty = event.target.value; state.totals = state.difficulty ? balancedTotals(stationCount()) : { winery: 0, food: 0, trade: 0 }; state.phase = "setup"; state.routes = []; state.candidates = []; state.confirmedTypes = []; state.strategySelections = [null, null, null]; state.selectedStrategy = ""; state.currentIndex = 0; state.stationOffset = 0; renderDifficulty(); syncTotalsInputs(); renderQuotaStatus(); renderForecast(); });
$("totals-form").addEventListener("input", () => { state.totals = readTotals(); renderQuotaStatus(); if (state.phase === "setup") renderForecast(); });
$("forecast-intro").addEventListener("click", (event) => { if (event.target.closest("#start-route-button")) beginRoute(); });
$("reset-button")?.addEventListener("click", resetPlanner);
$("recommend-category-1")?.addEventListener("change", (event) => { state.recommendedTypes[0] = event.target.value; renderRecommendedOptions(); if (state.phase === "strategy") renderForecast(); });
$("recommend-category-2")?.addEventListener("change", (event) => { state.recommendedTypes[1] = event.target.value; if (state.phase === "strategy") renderForecast(); });
$("strategy-picker-grid")?.addEventListener("click", (event) => { const button = event.target.closest("[data-strategy-choice]"); if (!button) return; const previous = state.strategySelections[state.strategyPickerSlot]; if (previous && String(previous) === String(state.selectedStrategy)) state.selectedStrategy = ""; state.strategySelections[state.strategyPickerSlot] = button.dataset.strategyChoice; $("strategy-picker-dialog")?.close(); renderForecast(); });
$("strategy-search")?.addEventListener("input", (event) => { state.strategySearch = event.target.value; renderStrategyPicker(); });
$("strategy-prefix-options")?.addEventListener("click", (event) => { const button = event.target.closest("[data-strategy-prefix]"); if (!button) return; state.strategyPrefixFilter = button.dataset.strategyPrefix; renderStrategyPicker(); });
$("strategy-picker-close")?.addEventListener("click", () => $("strategy-picker-dialog")?.close());
$("strategy-picker-dialog")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
$("decision-toolbar").addEventListener("click", (event) => { if (event.target.closest("#restart-step")) { resetPlanner(); return; } if (event.target.closest("#undo-step")) { if (state.phase === "station" && state.currentIndex > 0) { state.currentIndex -= 1; state.stationOffset = state.currentIndex; state.hints = state.hints.slice(0, state.currentIndex + 1); state.confirmedTypes = state.confirmedTypes.slice(0, state.currentIndex); state.pendingCurrent = ""; state.pendingHint = ""; state.candidates = filteredCandidates(); renderForecast(); } else if (state.phase === "station") { state.phase = "strategy"; state.stationOffset = 0; state.pendingHint = state.hints[0] || ""; state.hints = []; state.confirmedTypes = []; state.candidates = state.routes; renderForecast(); } else if (state.phase === "strategy") { state.phase = "setup"; state.stationOffset = 0; state.routes = []; state.candidates = []; state.pendingHint = ""; state.strategySelections = [null, null, null]; renderForecast(); } return; } if (!event.target.closest("#advance-step")) return; if (state.phase === "strategy") confirmStrategy(); else if (state.phase === "station") confirmStation(); });
$("forecast-content").addEventListener("click", (event) => { const editSlot = event.target.closest("[data-strategy-edit]"); if (editSlot) { state.strategyPickerSlot = Number(editSlot.dataset.strategyEdit); renderStrategyPicker(); $("strategy-picker-dialog")?.showModal(); return; } const strategySlot = event.target.closest("[data-strategy-slot]"); if (strategySlot) { const slot = Number(strategySlot.dataset.strategySlot); const id = state.strategySelections[slot]; if (id) { state.selectedStrategy = String(id); renderForecast(); } else { state.strategyPickerSlot = slot; renderStrategyPicker(); $("strategy-picker-dialog")?.showModal(); } return; } const currentOption = event.target.closest("[data-current-type]"); if (currentOption && !currentOption.disabled) { state.pendingCurrent = currentOption.dataset.currentType; state.candidates = filteredCandidates(); if (!state.candidates.length && state.pendingHint) { state.pendingHint = ""; state.candidates = filteredCandidates(); } renderQuotaStatus(); renderForecast(); return; } const hintOption = event.target.closest("[data-hint-id]"); if (hintOption && !hintOption.disabled) { state.pendingHint = hintOption.dataset.hintId; state.candidates = filteredCandidates(); renderQuotaStatus(); renderForecast(); } });
$("station-prev").addEventListener("click", () => { state.stationOffset = Math.max(0, (state.stationOffset || 0) - 1); renderStationStrip(); });
$("station-next").addEventListener("click", () => { state.stationOffset += 1; renderStationStrip(); });
window.addEventListener("resize", renderStationStrip);
resetPlanner();

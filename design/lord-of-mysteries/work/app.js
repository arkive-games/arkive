const TYPES = ["winery", "food", "trade"];
const TYPE_LABELS = { winery: "酒庄", food: "食铺", trade: "商行" };
const DIFFICULTIES = [
  { id: "beginner", name: "新手路线", description: "从这里轻松启程，有限的选择能降低风险。", stops: 15, price: "买入 0.7–1.2 倍 · 卖出 1.0–1.4 倍", stock: "合同库存加成 10% / 50% / 100% / 150%" },
  { id: "normal", name: "普通路线", description: "更多策略卡在此登场，每次判断带来全新结果。", stops: 15, price: "买入 0.7–1.2 倍 · 卖出 0.7–1.4 倍", stock: "合同库存加成 10% / 50% / 100% / 150%" },
  { id: "advanced", name: "进阶路线", description: "需要更多许可证解锁的高级路线，权衡你的选择吧。", stops: 15, price: "买入 0.7–1.2 倍 · 卖出 0.7–1.4 倍", stock: "合同库存加成 10% / 50% / 100% / 150%" },
  { id: "hard", name: "困难路线", description: "在收益与风险并行的路线上，你将如何下注？", stops: 14, price: "买入 0.7–1.4 倍 · 卖出 0.6–1.5 倍", stock: "合同库存加成 10% / 75% / 150% / 225%" },
  { id: "challenge", name: "挑战路线", description: "在复杂地图中追逐最优解，铁路大亨的试炼场。", stops: 15, price: "买入 0.7–1.4 倍 · 卖出 0.6–1.5 倍", stock: "合同库存加成 10% / 75% / 150% / 225%" },
];
const HINTS = [
  { id: "winery-most", label: "酒庄最多" },
  { id: "food-most", label: "食铺最多" },
  { id: "trade-most", label: "商行最多" },
  { id: "equal", label: "各站点相同" },
];

const state = {
  difficulty: "",
  totals: { winery: 5, food: 5, trade: 5 },
  originHint: "",
  steps: [],
  pendingCurrent: "",
  pendingHint: "",
  quotaConfirmed: false,
  sequences: [],
  stationOffset: null,
};
const $ = (id) => document.getElementById(id);
const GOODS_TYPE_LABELS = { WINE: "酒类", FOOD: "食品", CLOTH: "服装", ART: "艺术品" };
const GOODS = { items: [], filter: "all", quality: "all", query: "" };
const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
function cleanGoodsText(value) { return String(value || "").replace(/<[^>]+>/g, "").replace(/\s+<\/?\s*>/g, "").trim(); }
function updateGoodsFilterCounts() {
  const counts = { all: GOODS.items.length };
  GOODS.items.forEach((item) => {
    counts[item.GoodsType] = (counts[item.GoodsType] || 0) + 1;
    const key = `quality-${item.Quality}`;
    counts[key] = (counts[key] || 0) + 1;
  });
  document.querySelectorAll("[data-goods-count]").forEach((count) => {
    count.textContent = `${counts[count.dataset.goodsCount] || 0} 件`;
  });
  const qualityAll = document.querySelector('[data-goods-count="quality-all"]');
  if (qualityAll) qualityAll.textContent = `${GOODS.items.filter((item) => Number(item.Quality) >= 1 && Number(item.Quality) <= 5).length} 件`;
}
function goodsRouteMarkup(value) {
  const lines = cleanGoodsText(value).split("\n").filter(Boolean);
  const buy = lines.find((line) => line.startsWith("可买入站点："));
  const sell = lines.find((line) => line.startsWith("可卖出站点："));
  if (!buy && !sell) return "站点流向：暂无资料";
  return `<span><small>可买入站点</small><b>${escapeHtml(buy ? buy.replace("可买入站点：", "") : "暂无资料")}</b></span><span><small>可卖出站点</small><b>${escapeHtml(sell ? sell.replace("可卖出站点：", "") : "暂无资料")}</b></span>`;
}
function renderGoods() {
  const grid = $("goods-grid");
  if (!grid) return;
  const query = GOODS.query.trim().toLowerCase();
  const items = GOODS.items.filter((item) => {
    const category = GOODS_TYPE_LABELS[item.GoodsType] || item.GoodsType;
    return (GOODS.filter === "all" || item.GoodsType === GOODS.filter) && (GOODS.quality === "all" || String(item.Quality) === GOODS.quality) && (!query || `${item.GoodsNameTextID} ${category} ${item.GoodsDesc}`.toLowerCase().includes(query));
  });
  grid.innerHTML = items.map((item) => `<article class="goods-card goods-category-${item.GoodsType.toLowerCase()} quality-${item.Quality}"><div class="goods-art"><img src="./assets/traintrade/${item.SystemItemID}.webp" alt="${escapeHtml(item.GoodsNameTextID)}" loading="lazy" /></div><div class="goods-card-body"><div class="goods-card-top"><h3>${escapeHtml(item.GoodsNameTextID)}</h3><div class="goods-meta"><span class="goods-category">${escapeHtml(GOODS_TYPE_LABELS[item.GoodsType] || item.GoodsType)}</span><span class="goods-quality">品质 ${item.Quality}</span></div></div><p class="goods-desc">${escapeHtml(cleanGoodsText(item.GoodsDesc))}</p><div class="goods-prices"><span><small>基础买入</small><b>${item.BaseBuyPrice}</b></span><span><small>基础卖出</small><b>${item.BaseSellPrice}</b></span><span><small>余货回收</small><b>${item.LeftOverSellPrice}</b></span></div><div class="goods-route${item.GoodsDescStation ? "" : " goods-route-muted"}">${item.GoodsDescStation ? goodsRouteMarkup(item.GoodsDescStation) : "站点流向：暂无资料"}</div></div></article>`).join("");
  $("goods-empty").classList.toggle("is-hidden", items.length > 0);
}
function renderView() {
  const goodsView = location.hash === "#goods";
  $("planner").classList.toggle("is-hidden", goodsView);
  $("goods").classList.toggle("is-hidden", !goodsView);
  document.querySelectorAll(".topbar-nav a").forEach((link) => { const active = link.getAttribute("href") === (goodsView ? "#goods" : "#planner"); link.classList.toggle("is-active", active); if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current"); });
  if (goodsView) renderGoods();
}
function activeDifficulty() {
  return DIFFICULTIES.find((route) => route.id === state.difficulty) || null;
}
function stationCount() {
  return activeDifficulty()?.stops || 15;
}

function resetRoute() {
  state.originHint = "";
  state.steps = [];
  state.pendingCurrent = "";
  state.pendingHint = "";
  state.quotaConfirmed = false;
  state.stationOffset = null;
}

function renderDifficulty() {
  const select = $("difficulty-select");
  select.innerHTML = `<option value="">点这里选择</option>${DIFFICULTIES.map((route) => `<option value="${route.id}">${route.name}</option>`).join("")}`;
  select.value = state.difficulty;
  const profile = activeDifficulty();
  const note = $("difficulty-description");
  if (note) note.innerHTML = profile ? `<strong>${profile.name}</strong><span>${profile.description}</span><small>${profile.price}<br />${profile.stock}</small>` : "选择路线后查看该难度的规则摘要。";
}

function applyDifficulty(id) {
  state.difficulty = id;
  state.sequences = [];
  resetRoute();
  renderDifficulty();
  renderQuotaStatus();
  renderForecast();
}

function readTotals() {
  return Object.fromEntries(TYPES.map((type) => [type, Math.max(0, Number($(`${type}-total`).value) || 0)]));
}

function renderQuotaStatus() {
  state.totals = readTotals();
  document.querySelectorAll("#totals-form input").forEach((input) => { input.disabled = !state.difficulty; });
  const total = TYPES.reduce((sum, type) => sum + state.totals[type], 0);
  const target = stationCount();
  const message = $("quota-message");
  const valid = Boolean(state.difficulty) && total === target;
  message.textContent = !state.difficulty ? "" : valid ? "配额有效，可以开始推演。" : `还需要配置 ${Math.abs(target - total)} 站（当前合计 ${total}）。`;
  message.classList.toggle("is-valid", valid);
  const confirmButton = $("quota-confirm-button");
  confirmButton.disabled = !valid;
  confirmButton.textContent = state.quotaConfirmed ? "总站点配额已确认" : "确认总站点配额";
  return valid;
}

function renderStationStrip() {
  const totalStops = stationCount();
  const confirmed = confirmedStationTypes();
  const currentIndex = state.originHint ? state.steps.length : -1;
  const currentType = state.steps.at(-1)?.currentType || "";
  const windowStart = state.originHint ? state.steps.length : -1;
  const visibleCount = Math.min(6, totalStops);
  const maxOffset = Math.max(0, totalStops - visibleCount);
  const autoOffset = Math.max(0, Math.min(maxOffset, currentIndex > 0 ? currentIndex - 1 : 0));
  const offset = Math.max(0, Math.min(maxOffset, state.stationOffset ?? autoOffset));
  $("confirmed-stations").innerHTML = Array.from({ length: visibleCount }, (_, slot) => {
    const index = offset + slot;
    const number = index + 1;
    const typeKey = confirmed.get(index);
    const type = typeKey ? TYPE_LABELS[typeKey] : "";
    const isWindow = !type && windowStart >= 0 && index >= windowStart && index < windowStart + 3;
    const isCurrent = index === currentIndex;
    return `<div class="station-cell ${type ? "is-confirmed" : isWindow ? "is-window" : ""} ${isCurrent ? `is-current${currentType ? ` is-${currentType}` : ""}` : ""}"><strong>${number}</strong><small>${type || (isWindow ? "已推演" : "待确认")}</small></div>`;
  }).join("");
  $("station-prev").disabled = offset === 0;
  $("station-next").disabled = offset === maxOffset;
  $("confirmed-stations").setAttribute("aria-label", `第 ${offset + 1}-${offset + visibleCount} 站`);
}

function confirmedStationTypes() {
  const confirmed = new Map(state.steps.map((step, index) => [index, step.currentType]));
  if (!state.sequences.length || !state.originHint) return confirmed;
  const possible = filteredSequences();
  const starts = [0, ...state.steps.map((_, index) => index + 1)];
  starts.flatMap((start) => [start, start + 1, start + 2]).forEach((position) => {
    if (confirmed.has(position) || position >= stationCount() || !possible.length) return;
    const type = TYPES.find((candidate) => possible.every((sequence) => sequence[position] === candidate));
    if (type) confirmed.set(position, type);
  });
  return confirmed;
}

function renderRemainingStations() {
  const confirmed = confirmedStationTypes();
  const remaining = Object.fromEntries(TYPES.map((type) => [type, state.totals[type]]));
  confirmed.forEach((type) => { remaining[type] = Math.max(0, remaining[type] - 1); });
  TYPES.forEach((type) => { $(`remaining-${type}`).textContent = remaining[type]; });
}

function renderHistory() {
  const entries = [];
  const historyPanel = document.querySelector(".history-panel");
  historyPanel.classList.toggle("is-hidden", state.difficulty !== "challenge");
  if (state.originHint) {
    entries.push({ range: "第 1-3 站", hint: HINTS.find((item) => item.id === state.originHint).label, detail: "始发站提示" });
  }
  state.steps.forEach((step, index) => {
    entries.push({
      range: `第 ${index + 2}-${index + 4} 站`,
      hint: HINTS.find((item) => item.id === step.hintId).label,
      detail: `第 ${index + 1} 站：${TYPE_LABELS[step.currentType]}`,
    });
  });
  $("history-count").textContent = `${entries.length} 条`;
  $("history-list").innerHTML = entries.length
    ? entries.map((entry, index) => `<li class="history-entry"><span class="history-marker" aria-hidden="true">${index === 0 && state.originHint ? 0 : index}</span><div class="history-entry-body"><div class="history-entry-meta"><strong>${entry.range}</strong><span>${entry.hint}</span></div><small>${entry.detail}</small></div></li>`).join("")
    : `<li class="history-empty">暂无已确认提示</li>`;
}

function enumerateSequences(totals, totalStops) {
  const result = [];
  const remaining = { ...totals };
  const current = [];
  function visit() {
    if (current.length === totalStops) { result.push(current.slice()); return; }
    TYPES.forEach((type) => {
      if (!remaining[type]) return;
      remaining[type] -= 1;
      current.push(type);
      visit();
      current.pop();
      remaining[type] += 1;
    });
  }
  visit();
  return result;
}

function matchesHint(sequence, start, hintId) {
  const counts = Object.fromEntries(TYPES.map((type) => [type, 0]));
  sequence.slice(start, start + 3).forEach((type) => { counts[type] += 1; });
  if (hintId === "equal") return TYPES.every((type) => counts[type] === 1);
  const winner = hintId.replace("-most", "");
  return counts[winner] >= 2;
}

function filteredSequences() {
  return state.sequences.filter((sequence) => {
    if (state.originHint && !matchesHint(sequence, 0, state.originHint)) return false;
    return state.steps.every((step, index) => sequence[index] === step.currentType && matchesHint(sequence, index + 1, step.hintId));
  });
}

function prospectiveSequences(currentType = state.pendingCurrent, pendingHint = state.pendingHint) {
  const index = state.steps.length;
  return state.sequences.filter((sequence) => {
    if (state.originHint && !matchesHint(sequence, 0, state.originHint)) return false;
    if (!state.steps.every((step, stepIndex) => sequence[stepIndex] === step.currentType && matchesHint(sequence, stepIndex + 1, step.hintId))) return false;
    if (currentType && sequence[index] !== currentType) return false;
    if (pendingHint && !matchesHint(sequence, index + 1, pendingHint)) return false;
    return true;
  });
}

function probabilityFor(sequenceSet, position) {
  const counts = Object.fromEntries(TYPES.map((type) => [type, 0]));
  sequenceSet.forEach((sequence) => { counts[sequence[position]] += 1; });
  const total = sequenceSet.length || 1;
  return Object.fromEntries(TYPES.map((type) => [type, counts[type] / total]));
}

function windowDistribution(sequenceSet, start) {
  const counts = new Map();
  sequenceSet.forEach((sequence) => {
    const key = sequence.slice(start, start + 3).join(",");
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function comboMarkup(sequenceSet, start) {
  const combos = windowDistribution(sequenceSet, start);
  if (!combos.length) return "";
  const comboTotal = sequenceSet.length || 1;
  return `<div class="combo-block"><div class="combo-heading"><strong>第${start + 1}-${start + 3}站组合情况罗列</strong></div><div class="combo-grid">${combos.map(([key, count]) => `<div class="combo-item"><span>${key.split(",").map((type) => TYPE_LABELS[type]).join(" → ")}</span><b>${Math.round((count / comboTotal) * 100)}%</b></div>`).join("")}</div></div>`;
}

function probabilityMarkup(probability) {
  const raw = TYPES.map((type) => probability[type] * 100);
  const values = raw.map(Math.floor);
  let remainder = 100 - values.reduce((sum, value) => sum + value, 0);
  raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => { if (remainder > 0) { values[index] += 1; remainder -= 1; } });
  const leadingValue = Math.max(...values);
  return `<div class="probability-grid">${TYPES.map((type) => {
    const value = values[TYPES.indexOf(type)];
    const isLeading = value === leadingValue;
    return `<article class="probability-cell ${type}${isLeading ? " is-leading" : ""}"><header><b>${TYPE_LABELS[type]}</b>${isLeading ? `<span class="probability-lead">最高</span>` : ""}</header><strong class="probability-value">${value}%</strong><div class="probability-bar"><i style="width:${value}%"></i></div></article>`;
  }).join("")}</div>`;
}

function hintMarkup(selected = "", id = "hint-select", sequenceSet = null, start = 0) {
  const available = sequenceSet ? new Set(HINTS.filter((hint) => sequenceSet.some((sequence) => matchesHint(sequence, start, hint.id))).map((hint) => hint.id)) : null;
  return `<select class="hint-select" id="${id}" aria-label="未来三站提示"><option value="" hidden></option>${HINTS.map((hint) => {
    const disabled = available && !available.has(hint.id);
    return `<option value="${hint.id}" ${selected === hint.id ? "selected" : ""} ${disabled ? "disabled" : ""}>${hint.label}</option>`;
  }).join("")}</select>`;
}

function renderResolvedWindow(possible, start, detail) {
  return `<div class="resolved-window"><div class="window-meta"><span class="window-title">第${start + 1}站概率</span><span class="window-state">${detail}</span></div><div class="probability-section next-probability">${probabilityMarkup(probabilityFor(possible, start))}</div>${comboMarkup(possible, start)}</div>`;
}

function renderForecast() {
  const intro = $("forecast-intro");
  const content = $("forecast-content");
  renderStationStrip();
  renderHistory();
  const totalStops = stationCount();
  $("undo-step").disabled = !state.originHint && state.steps.length === 0;
  renderRemainingStations();
  if (!state.sequences.length) { intro.classList.remove("is-hidden"); content.classList.add("is-hidden"); return; }
  intro.classList.add("is-hidden"); content.classList.remove("is-hidden");

  if (!state.originHint) {
    content.innerHTML = `<div class="window-card origin-card"><div class="window-meta"><span class="window-title"><span class="step-number">3</span>站点信息</span></div><div class="station-entry"><div class="current-picker is-origin"><label for="origin-station-select">当前站点</label><select id="origin-station-select" disabled><option>始发站</option></select></div><div class="hint-picker"><label for="origin-hint-select">未来三站</label>${hintMarkup(state.pendingHint, "origin-hint-select", state.sequences, 0)}</div><button class="confirm-step" id="confirm-origin" type="button" disabled>确认并推演第 1-3 站</button></div></div>`;
    const confirm = $("confirm-origin");
    $("origin-hint-select").addEventListener("change", (event) => { state.pendingHint = event.target.value; renderForecast(); });
    confirm.disabled = !state.pendingHint;
    confirm.addEventListener("click", () => { state.originHint = state.pendingHint; state.pendingHint = ""; renderForecast(); });
    return;
  }

  const possible = filteredSequences();
  const latestStart = state.steps.length;
  const latestStep = state.steps.at(-1);
  const latestDetail = latestStep ? `当前站：${TYPE_LABELS[latestStep.currentType]} · ${HINTS.find((hint) => hint.id === latestStep.hintId).label}` : `始发站提示：${HINTS.find((hint) => hint.id === state.originHint).label}`;
  const resolved = renderResolvedWindow(possible, latestStart, latestDetail);
  const complete = state.steps.length >= totalStops - 3;
  if (complete) {
    content.innerHTML = `${resolved}<p class="sequence-note"><strong>${totalStops} 站信息链已完成。</strong></p>`;
    return;
  }

  const currentNumber = state.steps.length + 1;
  const certainCurrentType = TYPES.find((type) => possible.length && possible.every((sequence) => sequence[state.steps.length] === type)) || "";
  const effectiveCurrentType = certainCurrentType || state.pendingCurrent;
  const currentOptions = TYPES.map((type) => `<option value="${type}" ${effectiveCurrentType === type ? "selected" : ""}>${TYPE_LABELS[type]}</option>`).join("");
  const hintCandidates = prospectiveSequences(effectiveCurrentType, "");
  const candidateCount = effectiveCurrentType && state.pendingHint ? prospectiveSequences(effectiveCurrentType).length : possible.length;
  const candidateMessage = effectiveCurrentType && state.pendingHint && candidateCount === 0 ? `<p class="sequence-note error-note">当前站点与提示组合没有可行路线，请更换其中一项。</p>` : "";
  const currentControl = certainCurrentType
    ? `<div class="current-picker is-locked" role="status" aria-label="当前站点已锁定为${TYPE_LABELS[certainCurrentType]}"><label>当前站点</label><strong class="locked-station-value">${TYPE_LABELS[certainCurrentType]}</strong><small class="certainty-note">100% 已锁定</small></div>`
    : `<div class="current-picker"><label for="current-select">当前站点</label><select id="current-select"><option value="" hidden></option>${currentOptions}</select></div>`;
  const nextPrompt = `<div class="window-card"><div class="window-meta"><span class="window-title"><span class="step-number">3</span>第 ${currentNumber} 站 · 确认</span></div><div class="station-entry">${currentControl}<div class="hint-picker"><label for="hint-select">未来三站</label>${hintMarkup(state.pendingHint, "hint-select", hintCandidates, currentNumber)}</div><button class="confirm-step" id="confirm-step" type="button" disabled>确认并推演第 ${currentNumber + 1}-${currentNumber + 3} 站</button></div>${candidateMessage}</div>`;
  content.innerHTML = `${nextPrompt}${resolved}`;
  const currentSelect = $("current-select");
  if (!certainCurrentType) currentSelect.addEventListener("change", () => { state.pendingCurrent = currentSelect.value; renderForecast(); });
  $("hint-select").addEventListener("change", (event) => { state.pendingHint = event.target.value; renderForecast(); });
  const confirm = $("confirm-step");
  confirm.disabled = !effectiveCurrentType || !state.pendingHint || candidateCount === 0;
  confirm.addEventListener("click", () => {
    if (!effectiveCurrentType || !state.pendingHint) return;
    state.steps.push({ currentType: effectiveCurrentType, hintId: state.pendingHint });
    state.pendingCurrent = "";
    state.pendingHint = "";
    renderForecast();
  });
}

$("totals-form").addEventListener("input", () => {
  state.quotaConfirmed = false;
  state.sequences = [];
  resetRoute();
  renderQuotaStatus();
  renderForecast();
});
$("difficulty-select").addEventListener("change", (event) => applyDifficulty(event.target.value));
$("station-prev").addEventListener("click", () => {
  const currentIndex = state.originHint ? state.steps.length : 0;
  const maxOffset = Math.max(0, stationCount() - 6);
  const autoOffset = Math.max(0, Math.min(maxOffset, currentIndex > 0 ? currentIndex - 1 : 0));
  const currentOffset = state.stationOffset ?? autoOffset;
  state.stationOffset = Math.max(0, currentOffset - 1);
  renderStationStrip();
});
$("station-next").addEventListener("click", () => {
  const currentIndex = state.originHint ? state.steps.length : 0;
  const maxOffset = Math.max(0, stationCount() - 6);
  const autoOffset = Math.max(0, Math.min(maxOffset, currentIndex > 0 ? currentIndex - 1 : 0));
  const currentOffset = state.stationOffset ?? autoOffset;
  state.stationOffset = Math.min(maxOffset, currentOffset + 1);
  renderStationStrip();
});
$("undo-step").addEventListener("click", () => {
  if (state.steps.length) {
    state.steps.pop();
  } else if (state.originHint) {
    state.originHint = "";
  }
  state.pendingCurrent = "";
  state.pendingHint = "";
  state.stationOffset = null;
  renderForecast();
});
$("quota-confirm-button").addEventListener("click", () => {
  if (!renderQuotaStatus()) return;
  const sequences = enumerateSequences(state.totals, stationCount());
  resetRoute();
  state.quotaConfirmed = true;
  state.sequences = sequences;
  renderQuotaStatus();
  renderForecast();
});
document.querySelectorAll("[data-goods-filter]").forEach((button) => button.addEventListener("click", () => {
  GOODS.filter = button.dataset.goodsFilter;
  document.querySelectorAll("[data-goods-filter]").forEach((item) => item.classList.toggle("is-active", item === button));
  renderGoods();
}));
document.querySelectorAll("[data-goods-quality]").forEach((button) => button.addEventListener("click", () => {
  GOODS.quality = button.dataset.goodsQuality;
  document.querySelectorAll("[data-goods-quality]").forEach((item) => item.classList.toggle("is-active", item === button));
  renderGoods();
}));
$("goods-search").addEventListener("input", (event) => { GOODS.query = event.target.value; renderGoods(); });
window.addEventListener("hashchange", renderView);
renderDifficulty();
renderQuotaStatus();
renderForecast();
fetch("./assets/traintrade/goods.json")
  .then((response) => { if (!response.ok) throw new Error(`goods.json: ${response.status}`); return response.json(); })
  .then((items) => { GOODS.items = items.filter((item) => item.ID < 40000 && Number(item.Quality) >= 1 && Number(item.Quality) <= 5); updateGoodsFilterCounts(); renderView(); })
  .catch(() => { $("goods-empty").textContent = "货物资料暂时无法加载。"; renderView(); });

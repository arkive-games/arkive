const TYPES = ["winery", "food", "trade"];
const TYPE_LABELS = { winery: "酒庄", food: "食铺", trade: "商行" };
const DIFFICULTIES = [
  { id: "beginner", name: "新手线路", description: "低难度提供更明确的后续站点信息。", stops: 8, areas: "4 + 4", contractInterval: 4, priceGroup: 0, pool: "200101", price: "买入 0.7–1.2 倍 · 卖出 1.0–1.4 倍", stock: "合同库存加成 10% / 50% / 100% / 150%" },
  { id: "normal", name: "普通线路", description: "低难度提供更明确的后续站点信息。", stops: 8, areas: "4 + 4", contractInterval: 4, priceGroup: 1, pool: "200201", price: "买入 0.7–1.2 倍 · 卖出 0.7–1.4 倍", stock: "合同库存加成 10% / 50% / 100% / 150%" },
  { id: "advanced", name: "进阶线路", description: "区域数量增加，策略卡开始成为路线判断的核心。", stops: 12, areas: "4 + 4 + 4", contractInterval: 4, priceGroup: 2, pool: "200301", price: "买入 0.7–1.2 倍 · 卖出 0.7–1.4 倍", stock: "合同库存加成 10% / 50% / 100% / 150%" },
  { id: "hard", name: "困难线路", description: "高难度区域没有连续站点保护，价格波动更大。", stops: 15, areas: "5 + 5 + 5", contractInterval: 5, priceGroup: 3, pool: "200401", price: "买入 0.7–1.4 倍 · 卖出 0.6–1.5 倍", stock: "合同库存加成 10% / 75% / 150% / 225%" },
  { id: "challenge", name: "挑战线路", description: "只能看到未来三站最多类型，需要结合预测信息判断。", stops: 16, areas: "4 + 4 + 4 + 4", contractInterval: 4, priceGroup: 4, pool: "200501", price: "买入 0.7–1.4 倍 · 卖出 0.6–1.5 倍", stock: "合同库存加成 10% / 75% / 150% / 225%" },
];
const STATION_POOLS = {
  "200101": { label: "200101 · 起始区域", entries: [["start", 1], ["winery", 3], ["food", 2], ["trade", 2]] },
  "200201": { label: "200201 · 区域池 A", entries: [["winery", 3], ["food", 2], ["trade", 3]] },
  "200202": { label: "200202 · 区域池 B", entries: [["winery", 3], ["food", 3], ["trade", 2]] },
  "200203": { label: "200203 · 区域池 C", entries: [["winery", 2], ["food", 3], ["trade", 3]] },
  "200301": { label: "200301 · 区域池", entries: [["winery", 4], ["food", 4], ["trade", 4]] },
  "200302": { label: "200302 · 区域池", entries: [["winery", 4], ["food", 4], ["trade", 4]] },
  "200303": { label: "200303 · 区域池", entries: [["winery", 4], ["food", 4], ["trade", 4]] },
  "200401": { label: "200401 · 区域池", entries: [["winery", 5], ["food", 5], ["trade", 5]] },
  "200402": { label: "200402 · 区域池", entries: [["winery", 5], ["food", 5], ["trade", 5]] },
  "200403": { label: "200403 · 区域池", entries: [["winery", 5], ["food", 5], ["trade", 5]] },
  "200501": { label: "200501 · 艺术偏重", entries: [["winery", 5], ["food", 5], ["trade", 6]] },
  "200502": { label: "200502 · 酒庄偏重", entries: [["winery", 6], ["food", 5], ["trade", 5]] },
  "200503": { label: "200503 · 食铺偏重", entries: [["winery", 5], ["food", 6], ["trade", 5]] },
};
const STATION_GOODS = {
  winery: { buy: [30307, 30504, 30505], sell: [30104, 30105, 30107] },
  food: { buy: [30104, 30507, 30105], sell: [30304, 30305, 30307] },
  trade: { buy: [30107, 30304, 30305], sell: [30504, 30505, 30507] },
};
const PRICE_RANGES = [
  { label: "价格组 0", buy: "1.0–1.0（始发站） / 0.7–1.2", sell: "1.0–1.0（始发站） / 1.0–1.4" },
  { label: "价格组 1", buy: "0.7–1.2", sell: "0.7–1.4" },
  { label: "价格组 2", buy: "0.7–1.2", sell: "0.7–1.4" },
  { label: "价格组 3", buy: "0.7–1.4", sell: "0.6–1.5" },
  { label: "价格组 4", buy: "0.7–1.4", sell: "0.6–1.5" },
];
const DRIVER_UPGRADES = [
  { level: 1, value: "1 → 2" },
  { level: 2, value: "2 → 3" },
  { level: 3, value: "达到 3" },
];
const GOODS_BY_ID = new Map();
let goodsLoadPromise = null;
let goodsLoadState = "loading";
const HINTS = [
  { id: "winery-most", label: "酒庄最多" },
  { id: "food-most", label: "食铺最多" },
  { id: "trade-most", label: "商行最多" },
  { id: "equal", label: "各站点相同" },
];

const state = {
  recommendedTypes: ["WINE", "FOOD"],
  supplies: [null, null, null],
  pickerSlot: 0,
  difficulty: "challenge",
  totals: { winery: 5, food: 5, trade: 5 },
  originHint: "",
  steps: [],
  pendingCurrent: "",
  pendingHint: "",
  quotaConfirmed: true,
  sequences: [],
  stationOffset: null,
  designPreview: true,
};
const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value ?? "").replace(/[&<>\"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
function renderSupplyOptions(items) {
  items.forEach((item) => GOODS_BY_ID.set(Number(item.ID), item));
  renderGoodsPicker();
  renderSupplyButtons();
}
function renderSupplyButtons() {
  document.querySelectorAll("[data-supply-slot]").forEach((button) => {
    const slot = Number(button.dataset.supplySlot);
    const item = state.supplies[slot] ? GOODS_BY_ID.get(state.supplies[slot]) : null;
    button.innerHTML = item ? `<img src="./assets/traintrade/${escapeHtml(item.SystemItemID)}.webp" alt="" /><span>${escapeHtml(item.GoodsNameTextID)}</span>` : `<span class="supply-placeholder">＋</span><span>选择物资</span>`;
    button.classList.toggle("has-value", Boolean(item));
    button.setAttribute("aria-label", item ? `初始物资 ${slot + 1}：${item.GoodsNameTextID}` : `选择初始物资 ${slot + 1}`);
  });
}
function renderGoodsPicker() {
  const grid = $("goods-picker-grid");
  if (!grid) return;
  const items = [...GOODS_BY_ID.values()].filter((item) => item.ID < 40000 && Number(item.Quality) >= 1 && Number(item.Quality) <= 5);
  if (items.length) {
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = items.map((item) => `<button type="button" class="goods-picker-item" data-goods-id="${item.ID}"><img src="./assets/traintrade/${escapeHtml(item.SystemItemID)}.webp" alt="" /><span>${escapeHtml(item.GoodsNameTextID)}</span><small><b>买 ${item.BaseBuyPrice}</b><b>卖 ${item.BaseSellPrice}</b></small></button>`).join("");
    return;
  }
  if (goodsLoadState === "error") {
    grid.setAttribute("aria-busy", "false");
    grid.innerHTML = `<div class="goods-picker-error" role="alert"><strong>货物清单加载失败</strong><span>请重新加载货物数据后再选择。</span><button type="button" data-goods-retry>重新加载</button></div>`;
    return;
  }
  grid.setAttribute("aria-busy", "true");
  grid.innerHTML = Array.from({ length: 8 }, () => `<span class="goods-picker-skeleton" aria-hidden="true"><i></i><b></b><small></small></span>`).join("");
}
function loadRailwayGoods(force = false) {
  if (GOODS_BY_ID.size && !force) return Promise.resolve([...GOODS_BY_ID.values()]);
  if (goodsLoadPromise && !force) return goodsLoadPromise;
  goodsLoadState = "loading";
  renderGoodsPicker();
  goodsLoadPromise = fetch("./assets/traintrade/goods.json", { cache: "no-store" })
    .then((response) => {
      if (!response.ok) throw new Error(`goods.json: ${response.status}`);
      return response.json();
    })
    .then((items) => {
      if (!Array.isArray(items)) throw new Error("goods.json: invalid catalogue");
      goodsLoadState = "ready";
      renderSupplyOptions(items.filter((item) => item.ID < 40000 && Number(item.Quality) >= 1 && Number(item.Quality) <= 5));
      renderGoodsReference($("rule-goods-type")?.value || "winery");
      return items;
    })
    .catch((error) => {
      goodsLoadState = "error";
      renderGoodsPicker();
      throw error;
    })
    .finally(() => { goodsLoadPromise = null; });
  return goodsLoadPromise;
}
function renderRecommendedOptions() {
  const labels = { WINE: "酒类", FOOD: "食物类", ART: "艺术类" };
  [1, 2].forEach((slot) => {
    const select = $(`recommend-category-${slot}`);
    if (!select) return;
    const selected = state.recommendedTypes[slot - 1];
    select.innerHTML = Object.entries(labels).map(([value, label]) => `<option value="${value}" ${value === selected ? "selected" : ""}>${label}</option>`).join("");
  });
  const second = $("recommend-category-2");
  const first = state.recommendedTypes[0];
  if (second) [...second.options].forEach((option) => { option.disabled = option.value === first; });
}
function renderRulePanel() {
  const profile = activeDifficulty();
  const interval = $("rule-contract-interval");
  const areas = $("rule-area-count");
  const refresh = $("rule-refresh-base");
  const price = $("rule-price-range");
  if (!profile || !interval) return;
  interval.textContent = `${profile.contractInterval} 站 / 区域`;
  areas.textContent = `${profile.areas}（共 ${profile.stops} 站）`;
  refresh.textContent = "3 槽位 · 基础 1 次";
  price.textContent = profile.price;
  const poolSelect = $("rule-pool-select");
  if (poolSelect && !poolSelect.options.length) {
    poolSelect.innerHTML = Object.entries(STATION_POOLS).map(([id, pool]) => `<option value="${id}">${pool.label}</option>`).join("");
  }
  if (poolSelect) poolSelect.value = profile.pool;
  renderPoolSummary(poolSelect?.value || profile.pool);
  renderDriverUpgrades();
  renderGoodsReference($("rule-goods-type")?.value || "winery");
  renderPriceRanges();
}
function renderPoolSummary(poolId) {
  const node = $("rule-pool-summary");
  const pool = STATION_POOLS[poolId];
  if (!node || !pool) return;
  const total = pool.entries.reduce((sum, [, weight]) => sum + weight, 0);
  node.innerHTML = pool.entries.map(([type, weight]) => `<div class="rule-bar-row"><span>${type === "start" ? "始发站" : TYPE_LABELS[type]}</span><b>${weight}/${total}</b><i><em style="width:${(weight / total) * 100}%"></em></i></div>`).join("");
}
function renderDriverUpgrades() {
  const node = $("rule-driver-list");
  if (!node) return;
  node.innerHTML = DRIVER_UPGRADES.map((upgrade) => `<div class="rule-inline"><span>驾驶舱 ${upgrade.level} 级</span><strong>${upgrade.value}</strong><small>进入新区时回复</small></div>`).join("");
}
function renderGoodsReference(type) {
  const node = $("rule-goods-reference");
  if (!node) return;
  const goods = STATION_GOODS[type] || STATION_GOODS.winery;
  const names = (ids) => ids.map((id) => GOODS_BY_ID.get(id)?.GoodsNameTextID || `ID ${id}`).join("、");
  node.innerHTML = `<div class="goods-reference-row"><span>可买入</span><strong>${names(goods.buy)}</strong></div><div class="goods-reference-row"><span>可卖出</span><strong>${names(goods.sell)}</strong></div><small class="rule-disclaimer">包体未提供单品出现概率；以上为固定候选集合。</small>`;
}
function renderPriceRanges() {
  const node = $("rule-price-ranges");
  if (!node) return;
  node.innerHTML = PRICE_RANGES.map((range, index) => `<div class="price-row ${index === activeDifficulty()?.priceGroup ? "is-active" : ""}"><b>${range.label}</b><span>买 ${range.buy}</span><span>卖 ${range.sell}</span></div>`).join("") + `<small class="rule-disclaimer">价格区间内部的具体概率由包体未公开。</small>`;
}
function renderView() {
  $("planner").classList.remove("is-hidden");
}
function activeDifficulty() {
  return DIFFICULTIES.find((route) => route.id === state.difficulty) || null;
}
function stationCount() {
  return activeDifficulty()?.stops || 15;
}
function balancedTotals(total) {
  const base = Math.floor(total / TYPES.length);
  const remainder = total % TYPES.length;
  return Object.fromEntries(TYPES.map((type, index) => [type, base + (index < remainder ? 1 : 0)]));
}
function syncTotalsInputs() {
  TYPES.forEach((type) => { const input = $(`${type}-total`); if (input) input.value = state.totals[type]; });
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
  renderRulePanel();
}

function applyDifficulty(id) {
  state.designPreview = false;
  state.difficulty = id;
  state.totals = balancedTotals(stationCount());
  syncTotalsInputs();
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
  const totalNode = $("quota-total");
  const remainingNode = $("quota-remaining");
  if (totalNode) totalNode.textContent = total;
  if (remainingNode) remainingNode.innerHTML = `${state.designPreview ? Math.max(0, total - 4) : Math.max(0, target - total)}<small>站</small>`;
  const message = $("quota-message");
  const valid = Boolean(state.difficulty) && total === target;
  message.textContent = !state.difficulty ? "" : valid ? "配额有效，可以开始推演。" : `还需要配置 ${Math.abs(target - total)} 站（当前合计 ${total}）。`;
  message.classList.toggle("is-valid", valid);
  message.classList.toggle("is-hidden", state.quotaConfirmed);
  const confirmButton = $("quota-confirm-button");
  confirmButton.disabled = !valid;
  confirmButton.textContent = state.quotaConfirmed ? "总站点配额已确认" : "确认总站点配额";
  confirmButton.classList.toggle("is-hidden", state.quotaConfirmed);
  return valid;
}

function renderStationStrip() {
  if (state.designPreview) {
    const progress = $("progress-readout");
    if (progress) progress.textContent = "已确认 4 站 · 最多显示 6 站";
    $("confirmed-stations").innerHTML = `<article class="station-cell is-confirmed"><small>第 1 站</small><strong>酒庄</strong><span>已确认</span></article><article class="station-cell is-confirmed"><small>第 2 站</small><strong>商行</strong><span>已确认</span></article><article class="station-cell is-confirmed"><small>第 3 站</small><strong>酒庄</strong><span>已确认</span></article><article class="station-cell is-confirmed"><small>第 4 站</small><strong>食铺</strong><span>已确认</span></article><article class="station-cell is-current"><small>第 5 站</small><strong>酒庄</strong><span>当前位置</span></article><article class="station-cell is-window"><small>第 6 站</small><strong>待确认</strong><span>下一站</span></article>`;
    $("station-prev").disabled = true;
    $("station-next").disabled = false;
    $("confirmed-stations").setAttribute("aria-label", "第 1-6 站");
    return;
  }
  const totalStops = stationCount();
  const confirmed = confirmedStationTypes();
  const currentIndex = state.originHint ? state.steps.length : -1;
  const currentType = state.steps.at(-1)?.currentType || "";
  const windowStart = state.originHint ? state.steps.length : -1;
  const visibleCount = Math.min(6, totalStops);
  const maxOffset = Math.max(0, totalStops - visibleCount);
  const autoOffset = Math.max(0, Math.min(maxOffset, currentIndex > 0 ? currentIndex - 1 : 0));
  const offset = Math.max(0, Math.min(maxOffset, state.stationOffset ?? autoOffset));
  const progress = $("progress-readout");
  if (progress) progress.textContent = `已确认 ${state.steps.length + (state.originHint ? 1 : 0)} 站 · 最多显示 ${visibleCount} 站`;
  $("confirmed-stations").innerHTML = Array.from({ length: visibleCount }, (_, slot) => {
    const index = offset + slot;
    const number = index + 1;
    const typeKey = confirmed.get(index);
    const type = typeKey ? TYPE_LABELS[typeKey] : "";
    const isWindow = !type && windowStart >= 0 && index >= windowStart && index < windowStart + 3;
    const isCurrent = index === currentIndex;
    const status = isCurrent ? "当前位置" : type ? "已确认" : isWindow ? "已推演" : index === offset + visibleCount - 1 ? "下一站" : "待确认";
    return `<article class="station-cell ${type ? "is-confirmed" : isWindow ? "is-window" : ""} ${isCurrent ? `is-current${currentType ? ` is-${currentType}` : ""}` : ""}"><small>第 ${number} 站</small><strong>${type || (isWindow ? "待确认" : "待确认")}</strong><span>${status}</span></article>`;
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
  if (state.designPreview) {
    $("remaining-winery").textContent = "3";
    $("remaining-food").textContent = "4";
    $("remaining-trade").textContent = "4";
    return;
  }
  const confirmed = confirmedStationTypes();
  const remaining = Object.fromEntries(TYPES.map((type) => [type, state.totals[type]]));
  confirmed.forEach((type) => { remaining[type] = Math.max(0, remaining[type] - 1); });
  TYPES.forEach((type) => { $(`remaining-${type}`).textContent = remaining[type]; });
}

function renderHistory() {
  const entries = [];
  const historyPanel = document.querySelector(".history-panel");
  historyPanel.classList.remove("is-hidden");
  if (state.designPreview) {
    $("history-count").textContent = "4 条";
    $("history-list").innerHTML = `<li class="history-entry"><div class="history-entry-body"><div class="history-entry-meta"><strong>第 1-3 站</strong><span>酒庄最多</span></div></div></li><li class="history-entry"><div class="history-entry-body"><div class="history-entry-meta"><strong>第 2-4 站</strong><span>各站相同</span></div></div></li><li class="history-entry"><div class="history-entry-body"><div class="history-entry-meta"><strong>第 3-5 站</strong><span>食铺最多</span></div></div></li><li class="history-entry latest"><div class="history-entry-body"><div class="history-entry-meta"><strong>第 4-6 站</strong><span>商行最多</span></div></div></li>`;
    return;
  }
  if (state.originHint) {
    entries.push({ range: "第 1-3 站", hint: HINTS.find((item) => item.id === state.originHint).label, detail: "" });
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
    ? entries.map((entry) => `<li class="history-entry"><div class="history-entry-body"><div class="history-entry-meta"><strong>${entry.range}</strong><span>${entry.hint}</span></div></div></li>`).join("")
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
  return `<div class="combo-block"><div class="combo-heading"><strong>第 ${start + 1}–${start + 3} 站组合情况罗列</strong></div><div class="combo-grid">${combos.map(([key, count]) => `<div class="combo-item"><span>${key.split(",").map((type) => TYPE_LABELS[type]).join(" → ")}</span><b>${Math.round((count / comboTotal) * 100)}%</b></div>`).join("")}</div></div>`;
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
    return `<article class="probability-cell ${type}${isLeading ? " is-leading" : ""}${value === 0 ? " is-zero" : ""}${value === 100 ? " is-certain" : ""}"><header><b>${TYPE_LABELS[type]}</b>${isLeading ? `<span class="probability-lead">最高</span>` : ""}</header><strong class="probability-value">${value}%</strong><div class="probability-bar"><i style="width:${value}%"></i></div></article>`;
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
  return `<div class="resolved-window"><div class="window-meta"><span class="window-title">第 ${start + 1} 站概率</span><span class="window-state">${detail}</span></div><div class="probability-section next-probability">${probabilityMarkup(probabilityFor(possible, start))}</div>${comboMarkup(possible, start)}</div>`;
}

function renderDecisionToolbar(markup = "") {
  const toolbar = $("decision-toolbar");
  if (!toolbar) return;
  toolbar.innerHTML = markup || `<div class="decision-block decision-back"><label for="undo-step">返回上一步</label><button class="back-step-button" id="undo-step" type="button" aria-label="返回上一步" disabled>←</button></div>`;
}

function renderDesignPreview() {
  renderDecisionToolbar(`<div class="decision-block decision-back"><label for="undo-step">返回上一步</label><button class="back-step-button" id="undo-step" type="button" aria-label="返回上一步" disabled>←</button></div><div class="decision-block decision-current"><label for="preview-current-select">当前站点确认</label><div class="current-picker"><select id="preview-current-select" aria-label="当前站点确认"><option selected>酒庄</option><option>食铺</option><option>商行</option></select></div></div><div class="decision-block decision-future"><label for="preview-hint-select">未来三站信息</label><div class="hint-picker"><select id="preview-hint-select" class="hint-select" aria-label="未来三站信息"><option selected>酒庄最多</option><option>食铺最多</option><option>商行最多</option><option>各站点相同</option></select></div></div><div class="decision-block decision-submit"><label for="preview-submit">推演下三站</label><button class="confirm-step" id="preview-submit" type="button" aria-label="推演下三站">→</button></div>`);
  $("forecast-intro").classList.add("is-hidden");
  $("forecast-content").classList.remove("is-hidden");
  $("forecast-content").innerHTML = `<div class="resolved-window"><div class="window-meta"><span class="window-title">第 5 站概率</span><span class="window-state">未来三站信息：酒庄最多</span></div><div class="probability-section next-probability"><div class="probability-grid"><article class="probability-cell winery is-leading"><header><b>酒庄</b><span class="probability-lead">最高</span></header><strong class="probability-value">67%</strong></article><article class="probability-cell food"><header><b>食铺</b></header><strong class="probability-value">17%</strong></article><article class="probability-cell trade"><header><b>商行</b></header><strong class="probability-value">16%</strong></article></div></div><div class="combo-block"><div class="combo-heading"><strong>第 6–8 站组合情况罗列</strong></div><div class="combo-grid"><div class="combo-item"><span>酒庄 → 酒庄 → 食铺</span><b>28%</b></div><div class="combo-item"><span>酒庄 → 食铺 → 酒庄</span><b>22%</b></div><div class="combo-item"><span>酒庄 → 酒庄 → 商行</span><b>17%</b></div><div class="combo-item"><span>食铺 → 酒庄 → 酒庄</span><b>12%</b></div><div class="combo-item"><span>酒庄 → 商行 → 酒庄</span><b>9%</b></div><div class="combo-item"><span>商行 → 酒庄 → 酒庄</span><b>7%</b></div><div class="combo-item"><span>酒庄 → 酒庄 → 酒庄</span><b>5%</b></div></div></div></div>`;
  [$("preview-current-select"), $("preview-hint-select"), $("preview-submit")].forEach((node) => node?.addEventListener(node.tagName === "BUTTON" ? "click" : "change", leaveDesignPreview));
}

function leaveDesignPreview() {
  state.designPreview = false;
  state.totals = balancedTotals(stationCount());
  syncTotalsInputs();
  state.sequences = [];
  resetRoute();
  renderQuotaStatus();
  renderForecast();
}

function renderForecast() {
  const intro = $("forecast-intro");
  const content = $("forecast-content");
  renderStationStrip();
  renderHistory();
  const totalStops = stationCount();
  if (state.designPreview) {
    renderStationStrip();
    renderHistory();
    renderRemainingStations();
    renderDesignPreview();
    return;
  }
  renderDecisionToolbar();
  $("undo-step").disabled = !state.originHint && state.steps.length === 0;
  renderRemainingStations();
  if (!state.sequences.length) { intro.classList.remove("is-hidden"); content.classList.add("is-hidden"); return; }
  intro.classList.add("is-hidden"); content.classList.remove("is-hidden");

  if (!state.originHint) {
    renderDecisionToolbar(`<div class="decision-block decision-back"><label for="undo-step">返回上一步</label><button class="back-step-button" id="undo-step" type="button" aria-label="返回上一步" disabled>←</button></div><div class="decision-block decision-current"><label for="origin-station-select">当前站点确认</label><div class="current-picker is-origin"><select id="origin-station-select" disabled><option>始发站</option></select></div></div><div class="decision-block decision-future"><label for="origin-hint-select">未来三站信息</label><div class="hint-picker">${hintMarkup(state.pendingHint, "origin-hint-select", state.sequences, 0)}</div></div><div class="decision-block decision-submit"><label for="confirm-origin">推演下三站</label><button class="confirm-step" id="confirm-origin" type="button" disabled aria-label="确认并推演第 1-3 站">→</button></div>`);
    content.innerHTML = "";
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
  const currentControlMarkup = certainCurrentType
    ? `<div class="current-picker is-locked" role="status" aria-label="当前站点已锁定为${TYPE_LABELS[certainCurrentType]}"><strong class="locked-station-value">${TYPE_LABELS[certainCurrentType]}</strong><small class="certainty-note">100% 已锁定</small></div>`
    : `<div class="current-picker"><select id="current-select" aria-label="当前站点"><option value="" hidden></option>${currentOptions}</select></div>`;
  renderDecisionToolbar(`<div class="decision-block decision-back"><label for="undo-step">返回上一步</label><button class="back-step-button" id="undo-step" type="button" aria-label="返回上一步">←</button></div><div class="decision-block decision-current"><label for="current-select">当前站点确认</label>${currentControlMarkup}</div><div class="decision-block decision-future"><label for="hint-select">未来三站信息</label><div class="hint-picker">${hintMarkup(state.pendingHint, "hint-select", hintCandidates, currentNumber)}</div></div><div class="decision-block decision-submit"><label for="confirm-step">推演下三站</label><button class="confirm-step" id="confirm-step" type="button" disabled aria-label="确认并推演第 ${currentNumber + 1}-${currentNumber + 3} 站">→</button></div>`);
  content.innerHTML = `${resolved}${candidateMessage}`;
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
  state.designPreview = false;
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
$("decision-toolbar").addEventListener("click", (event) => {
  if (!event.target.closest("#undo-step")) return;
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
  state.designPreview = false;
  if (!renderQuotaStatus()) return;
  const sequences = enumerateSequences(state.totals, stationCount());
  resetRoute();
  state.quotaConfirmed = true;
  state.sequences = sequences;
  renderQuotaStatus();
  renderForecast();
});
document.querySelectorAll("[data-supply-slot]").forEach((button) => button.addEventListener("click", () => {
  state.pickerSlot = Number(button.dataset.supplySlot);
  renderGoodsPicker();
  $("goods-picker-dialog")?.showModal();
  loadRailwayGoods().catch(() => {});
}));
$("goods-picker-grid")?.addEventListener("click", (event) => {
  if (event.target.closest("[data-goods-retry]")) {
    loadRailwayGoods(true).catch(() => {});
    return;
  }
  const button = event.target.closest("[data-goods-id]");
  if (!button) return;
  state.supplies[state.pickerSlot] = Number(button.dataset.goodsId);
  renderSupplyButtons();
  $("goods-picker-dialog")?.close();
});
$("goods-picker-close")?.addEventListener("click", () => $("goods-picker-dialog")?.close());
$("goods-picker-dialog")?.addEventListener("click", (event) => { if (event.target === event.currentTarget) event.currentTarget.close(); });
$("recommend-category-1")?.addEventListener("change", (event) => {
  state.recommendedTypes[0] = event.target.value;
  if (state.recommendedTypes[1] === state.recommendedTypes[0]) state.recommendedTypes[1] = ["WINE", "FOOD", "ART"].find((type) => type !== state.recommendedTypes[0]);
  renderRecommendedOptions();
});
$("recommend-category-2")?.addEventListener("change", (event) => { state.recommendedTypes[1] = event.target.value; renderRecommendedOptions(); });
$("rule-pool-select")?.addEventListener("change", (event) => renderPoolSummary(event.target.value));
$("rule-goods-type")?.addEventListener("change", (event) => renderGoodsReference(event.target.value));
renderRecommendedOptions();
renderDifficulty();
renderQuotaStatus();
renderForecast();
loadRailwayGoods().catch(() => {});

function notifyParentHeight() {
  if (window.parent === window) return;
  window.parent.postMessage({ type: "traintrade-height", height: document.documentElement.scrollHeight }, "*");
}

new ResizeObserver(notifyParentHeight).observe(document.documentElement);
window.addEventListener("load", notifyParentHeight);
notifyParentHeight();

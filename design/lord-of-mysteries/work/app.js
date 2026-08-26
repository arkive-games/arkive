const TYPES = ["winery", "food", "trade"];
const TYPE_LABELS = { winery: "酒庄", food: "食铺", trade: "商行" };
const DIFFICULTIES = [
  { id: "beginner", name: "新手路线", stops: 15 },
  { id: "normal", name: "普通路线", stops: 15 },
  { id: "advanced", name: "进阶路线", stops: 15 },
  { id: "hard", name: "困难路线", stops: 14 },
  { id: "challenge", name: "挑战路线", stops: 15 },
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
  select.innerHTML = `<option value="">请选择难度</option>${DIFFICULTIES.map((route) => `<option value="${route.id}">${route.name}</option>`).join("")}`;
  select.value = state.difficulty;
  $("route-label").textContent = activeDifficulty()?.name || "选择难度";
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
  $("quota-total-value").textContent = total;
  $("quota-target-value").textContent = target;
  const message = $("quota-message");
  const valid = Boolean(state.difficulty) && total === target;
  message.textContent = !state.difficulty ? "选择难度后，才能填写配额。" : valid ? "配额有效，可以开始推演。" : `还需要配置 ${Math.abs(target - total)} 站（当前合计 ${total}）。`;
  message.classList.toggle("is-valid", valid);
  const confirmButton = $("quota-confirm-button");
  confirmButton.disabled = !valid;
  confirmButton.textContent = state.quotaConfirmed ? "总站点配额已确认" : "确认总站点配额";
  return valid;
}

function renderStationStrip() {
  const totalStops = stationCount();
  const confirmed = new Map(state.steps.map((step, index) => [index, TYPE_LABELS[step.currentType]]));
  const currentIndex = state.originHint ? state.steps.length : -1;
  const currentType = state.steps.at(-1)?.currentType || "";
  if (state.sequences.length) {
    const possible = filteredSequences();
    const starts = state.originHint ? [0, ...state.steps.map((_, index) => index + 1)] : [];
    starts.flatMap((start) => [start, start + 1, start + 2]).forEach((position) => {
      if (confirmed.has(position) || position >= totalStops || !possible.length) return;
      const type = TYPES.find((candidate) => possible.every((sequence) => sequence[position] === candidate));
      if (type) confirmed.set(position, `${TYPE_LABELS[type]}`);
    });
  }
  const windowStart = state.originHint ? state.steps.length : -1;
  const visibleCount = Math.min(6, totalStops);
  const maxOffset = Math.max(0, totalStops - visibleCount);
  const autoOffset = Math.max(0, Math.min(maxOffset, currentIndex > 0 ? currentIndex - 1 : 0));
  const offset = Math.max(0, Math.min(maxOffset, state.stationOffset ?? autoOffset));
  $("confirmed-stations").innerHTML = Array.from({ length: visibleCount }, (_, slot) => {
    const index = offset + slot;
    const number = index + 1;
    const type = confirmed.get(index);
    const isWindow = !type && windowStart >= 0 && index >= windowStart && index < windowStart + 3;
    const isCurrent = index === currentIndex;
    return `<div class="station-cell ${type ? "is-confirmed" : isWindow ? "is-window" : ""} ${isCurrent ? `is-current${currentType ? ` is-${currentType}` : ""}` : ""}"><strong>${number}</strong><small>${type || (isWindow ? "已推演" : "待确认")}</small></div>`;
  }).join("");
  $("station-prev").disabled = offset === 0;
  $("station-next").disabled = offset === maxOffset;
  $("confirmed-stations").setAttribute("aria-label", `第 ${offset + 1}-${offset + visibleCount} 站`);
}

function renderHistory() {
  const entries = [];
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

function prospectiveSequences() {
  const index = state.steps.length;
  return state.sequences.filter((sequence) => {
    if (state.originHint && !matchesHint(sequence, 0, state.originHint)) return false;
    if (!state.steps.every((step, stepIndex) => sequence[stepIndex] === step.currentType && matchesHint(sequence, stepIndex + 1, step.hintId))) return false;
    if (state.pendingCurrent && sequence[index] !== state.pendingCurrent) return false;
    if (state.pendingHint && !matchesHint(sequence, index + 1, state.pendingHint)) return false;
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
  return `<div class="combo-block"><div class="combo-heading"><strong>未来三站组合</strong></div><div class="combo-grid">${combos.map(([key, count]) => `<div class="combo-item"><span>${key.split(",").map((type) => TYPE_LABELS[type]).join(" → ")}</span><b>${Math.round((count / comboTotal) * 100)}%</b></div>`).join("")}</div></div>`;
}

function probabilityMarkup(probability) {
  const raw = TYPES.map((type) => probability[type] * 100);
  const values = raw.map(Math.floor);
  let remainder = 100 - values.reduce((sum, value) => sum + value, 0);
  raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => { if (remainder > 0) { values[index] += 1; remainder -= 1; } });
  return `<div class="probability-grid">${TYPES.map((type) => {
    const value = values[TYPES.indexOf(type)];
    return `<article class="probability-cell ${type}"><header><b>${TYPE_LABELS[type]}</b><span>${value}%</span></header><strong class="probability-value">${value}%</strong><div class="probability-bar"><i style="width:${value}%"></i></div></article>`;
  }).join("")}</div>`;
}

function hintMarkup(selected = "", id = "hint-select") {
  return `<select class="hint-select" id="${id}" aria-label="未来三站提示"><option value="">请选择提示</option>${HINTS.map((hint) => `<option value="${hint.id}" ${selected === hint.id ? "selected" : ""}>${hint.label}</option>`).join("")}</select>`;
}

function renderResolvedWindow(possible, start, detail) {
  return `<div class="resolved-window"><div class="window-meta"><span class="window-title">已解锁 · 第 <span>${start + 1}-${start + 3}</span> 站</span><span class="window-state">${detail}</span></div><div class="probability-section next-probability"><div class="probability-heading"><strong>下一站 · 第 ${start + 1} 站</strong></div>${probabilityMarkup(probabilityFor(possible, start))}</div>${comboMarkup(possible, start)}</div>`;
}

function renderForecast() {
  const intro = $("forecast-intro");
  const content = $("forecast-content");
  renderStationStrip();
  renderHistory();
  const totalStops = stationCount();
  const currentStation = state.originHint ? Math.min(totalStops, state.steps.length + 1) : 0;
  $("current-station").textContent = currentStation;
  $("remaining-stations").textContent = Math.max(0, totalStops - currentStation);
  if (!state.sequences.length) { intro.classList.remove("is-hidden"); content.classList.add("is-hidden"); return; }
  intro.classList.add("is-hidden"); content.classList.remove("is-hidden");

  if (!state.originHint) {
    content.innerHTML = `<div class="window-card origin-card"><div class="window-meta"><span class="window-title"><span class="step-number">3</span>站点信息</span></div><div class="station-entry"><div class="current-picker is-origin"><label for="origin-station-select">当前站点</label><select id="origin-station-select" disabled><option>始发站</option></select></div><div class="hint-picker"><label for="origin-hint-select">未来三站</label>${hintMarkup(state.pendingHint, "origin-hint-select")}</div></div><button class="confirm-step" id="confirm-origin" type="button" disabled>确认并推演第 1-3 站</button></div>`;
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
  const currentOptions = TYPES.map((type) => `<option value="${type}" ${state.pendingCurrent === type ? "selected" : ""}>${TYPE_LABELS[type]}</option>`).join("");
  const candidateCount = state.pendingCurrent && state.pendingHint ? prospectiveSequences().length : possible.length;
  const candidateMessage = state.pendingCurrent && state.pendingHint && candidateCount === 0 ? `<p class="sequence-note error-note">当前站点与提示组合没有可行路线，请更换其中一项。</p>` : "";
  const nextPrompt = `<div class="window-card"><div class="window-meta"><span class="window-title"><span class="step-number">3</span>第 ${currentNumber} 站 · 确认</span></div><div class="station-entry"><div class="current-picker"><label for="current-select">当前站点</label><select id="current-select"><option value="">请选择</option>${currentOptions}</select></div><div class="hint-picker"><label for="hint-select">未来三站</label>${hintMarkup(state.pendingHint)}</div></div><button class="confirm-step" id="confirm-step" type="button" disabled>确认并推演第 ${currentNumber + 1}-${currentNumber + 3} 站</button>${candidateMessage}</div>`;
  content.innerHTML = `${nextPrompt}${resolved}`;
  const currentSelect = $("current-select");
  currentSelect.addEventListener("change", () => { state.pendingCurrent = currentSelect.value; renderForecast(); });
  $("hint-select").addEventListener("change", (event) => { state.pendingHint = event.target.value; renderForecast(); });
  const confirm = $("confirm-step");
  confirm.disabled = !state.pendingCurrent || !state.pendingHint || candidateCount === 0;
  confirm.addEventListener("click", () => {
    if (!state.pendingCurrent || !state.pendingHint) return;
    state.steps.push({ currentType: state.pendingCurrent, hintId: state.pendingHint });
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
$("quota-confirm-button").addEventListener("click", () => {
  if (!renderQuotaStatus()) return;
  const sequences = enumerateSequences(state.totals, stationCount());
  resetRoute();
  state.quotaConfirmed = true;
  state.sequences = sequences;
  renderQuotaStatus();
  renderForecast();
});
renderDifficulty();
renderQuotaStatus();
renderStationStrip();

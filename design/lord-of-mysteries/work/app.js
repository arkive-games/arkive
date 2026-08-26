const TYPES = ["winery", "food", "trade"];
const TYPE_LABELS = { winery: "酒庄", food: "食铺", trade: "商行" };
const DIFFICULTIES = [
  { id: "beginner", name: "新手路线", en: "BEGINNER", stops: 15 },
  { id: "normal", name: "普通路线", en: "NORMAL", stops: 15 },
  { id: "advanced", name: "进阶路线", en: "ADVANCED", stops: 15 },
  { id: "hard", name: "困难路线", en: "HARD", stops: 15 },
  { id: "challenge", name: "挑战路线", en: "CHALLENGE", stops: 15 },
];
const HINTS = [
  { id: "winery-most", label: "酒庄最多", detail: "酒庄 > 食铺、商行" },
  { id: "food-most", label: "食铺最多", detail: "食铺 > 酒庄、商行" },
  { id: "trade-most", label: "商行最多", detail: "商行 > 酒庄、食铺" },
  { id: "equal", label: "各站点相同", detail: "三类各出现 1 次" },
];

const state = {
  difficulty: "",
  totals: { winery: 5, food: 5, trade: 5 },
  originHint: "",
  steps: [],
  pendingCurrent: "",
  pendingHint: "",
  sequences: [],
};
const $ = (id) => document.getElementById(id);

function resetRoute() {
  state.originHint = "";
  state.steps = [];
  state.pendingCurrent = "";
  state.pendingHint = "";
}

function renderDifficulty() {
  $("difficulty-options").innerHTML = DIFFICULTIES.map((route) => `
    <button class="difficulty-button ${route.id === state.difficulty ? "is-active" : ""}" data-difficulty="${route.id}" type="button">
      <strong>${route.name}</strong><small>${route.en}</small>
    </button>`).join("");
  document.querySelectorAll("[data-difficulty]").forEach((button) => button.addEventListener("click", () => {
    state.difficulty = button.dataset.difficulty;
    resetRoute();
    updateRouteCopy();
    renderDifficulty();
    renderQuotaStatus();
    renderForecast();
  }));
}

function updateRouteCopy() {
  const route = DIFFICULTIES.find((item) => item.id === state.difficulty);
  if (!route) {
    $("route-badge").textContent = "请先选择路线";
    $("route-description").textContent = "先选择铁路大亨难度，再输入本局总站点配额。挑战路线是当前重点推演模式。";
    return;
  }
  $("route-badge").textContent = `${route.name} · ${route.stops} 站`;
  $("route-description").textContent = route.id === "challenge"
    ? "先录入始发站提示，再逐轮确认当前站点与下一波提示。系统只展示已经获得信息的未来 3 站。"
    : `${route.name}已切换。当前原型沿用 15 站配额模型，按信息链逐步推演。`;
}

function readTotals() {
  return Object.fromEntries(TYPES.map((type) => [type, Math.max(0, Number($(`${type}-total`).value) || 0)]));
}

function renderQuotaStatus() {
  state.totals = readTotals();
  document.querySelectorAll("#totals-form input").forEach((input) => { input.disabled = !state.difficulty; });
  const total = TYPES.reduce((sum, type) => sum + state.totals[type], 0);
  $("quota-total-value").textContent = total;
  const message = $("quota-message");
  const valid = Boolean(state.difficulty) && total === 15;
  message.textContent = !state.difficulty ? "选择路线后，才能填写配额。" : valid ? "配额有效，可以开始推演。" : `还需要配置 ${Math.abs(15 - total)} 站（当前合计 ${total}）。`;
  message.classList.toggle("is-valid", valid);
  $("start-button").disabled = !valid;
  return valid;
}

function enumerateSequences(totals) {
  const result = [];
  const remaining = { ...totals };
  const current = [];
  function visit() {
    if (current.length === 15) { result.push(current.slice()); return; }
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
  return counts[winner] > Math.max(...TYPES.filter((type) => type !== winner).map((type) => counts[type]));
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

function probabilityMarkup(probability, sequenceSet, start, includeCombos = false) {
  const raw = TYPES.map((type) => probability[type] * 100);
  const values = raw.map(Math.floor);
  let remainder = 100 - values.reduce((sum, value) => sum + value, 0);
  raw.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => { if (remainder > 0) { values[index] += 1; remainder -= 1; } });
  const combos = windowDistribution(sequenceSet, start);
  const comboTotal = sequenceSet.length || 1;
  const comboMarkup = includeCombos && combos.length ? `<div class="combo-block"><div class="combo-heading"><strong>未来 3 站联合组合</strong><span>${combos.length} 种可行排列 · 按配额等可能排列</span></div><div class="combo-grid">${combos.map(([key, count]) => `<div class="combo-item"><span>${key.split(",").map((type) => TYPE_LABELS[type]).join(" → ")}</span><b>${Math.round((count / comboTotal) * 100)}%</b></div>`).join("")}</div></div>` : "";
  return `<div class="probability-grid">${TYPES.map((type) => {
    const value = values[TYPES.indexOf(type)];
    return `<article class="probability-cell ${type}"><header><b>${TYPE_LABELS[type]}</b><span>${value}%</span></header><strong class="probability-value">${value}%</strong><div class="probability-bar"><i style="width:${value}%"></i></div></article>`;
  }).join("")}</div>${comboMarkup}`;
}

function hintMarkup(selected = "") {
  return HINTS.map((hint) => `<button class="hint-button ${selected === hint.id ? "is-selected" : ""}" data-hint="${hint.id}" type="button"><strong>${hint.label}</strong><small>${hint.detail}</small></button>`).join("");
}

function renderResolvedWindow(possible, start, detail) {
  return `<div class="resolved-window"><div class="window-meta"><span class="window-title">已解锁 · 第 <span>${start + 1}-${start + 3}</span> 站</span><span class="window-state">${detail}</span></div><p class="sequence-note">单站数字是边际概率，不代表三站彼此独立；下方联合组合展示同一条三站路线的整体概率。</p>${[0, 1, 2].map((offset) => `<div class="probability-section"><div class="probability-heading"><strong>第 ${start + offset + 1} 站</strong><span>边际概率</span></div>${probabilityMarkup(probabilityFor(possible, start + offset), possible, start, offset === 0)}</div>`).join("")}</div>`;
}

function renderForecast() {
  const intro = $("forecast-intro");
  const content = $("forecast-content");
  const disclosed = (state.originHint ? 1 : 0) + state.steps.length;
  $("progress-count").textContent = disclosed;
  if (!state.sequences.length) { intro.classList.remove("is-hidden"); content.classList.add("is-hidden"); return; }
  intro.classList.add("is-hidden"); content.classList.remove("is-hidden");

  if (!state.originHint) {
    content.innerHTML = `<div class="window-card origin-card"><div class="window-meta"><span class="window-title">始发站 · 第一波提示</span><span class="window-state">${state.sequences.length.toLocaleString()} 种序列待筛选</span></div><p class="sequence-note">选择游戏内显示的未来 3 站提示，确认后才会展示第 1 至 3 站概率。</p><div class="hint-grid">${hintMarkup(state.pendingHint)}</div><button class="confirm-step" id="confirm-origin" type="button" disabled>确认始发站提示并推演第 1-3 站</button></div>`;
    content.querySelectorAll("[data-hint]").forEach((button) => button.addEventListener("click", () => { state.pendingHint = button.dataset.hint; renderForecast(); }));
    const confirm = $("confirm-origin");
    confirm.disabled = !state.pendingHint;
    confirm.addEventListener("click", () => { state.originHint = state.pendingHint; state.pendingHint = ""; renderForecast(); });
    return;
  }

  const possible = filteredSequences();
  const latestStart = state.steps.length;
  const latestStep = state.steps.at(-1);
  const latestDetail = latestStep ? `当前站：${TYPE_LABELS[latestStep.currentType]} · ${HINTS.find((hint) => hint.id === latestStep.hintId).label}` : `始发站提示：${HINTS.find((hint) => hint.id === state.originHint).label}`;
  const resolved = renderResolvedWindow(possible, latestStart, latestDetail);
  const complete = state.steps.length >= 12;
  if (complete) {
    content.innerHTML = `${resolved}<p class="sequence-note"><strong>15 站信息链已完成。</strong>以上仅展示每次获得提示后对应的未来 3 站概率。</p>`;
    return;
  }

  const currentNumber = state.steps.length + 1;
  const currentOptions = TYPES.map((type) => `<option value="${type}" ${state.pendingCurrent === type ? "selected" : ""}>${TYPE_LABELS[type]}</option>`).join("");
  const candidateCount = state.pendingCurrent && state.pendingHint ? prospectiveSequences().length : possible.length;
  const candidateMessage = state.pendingCurrent && state.pendingHint && candidateCount === 0 ? `<p class="sequence-note error-note">当前站点与提示组合没有可行路线，请更换其中一项。</p>` : "";
  const nextPrompt = `<div class="window-card"><div class="window-meta"><span class="window-title">第 <span>${currentNumber}</span> 站 · 确认当前站点</span><span class="window-state">${candidateCount.toLocaleString()} 种序列可继续</span></div><div class="current-picker"><label for="current-select">当前站点类型</label><select id="current-select"><option value="">请选择</option>${currentOptions}</select></div><p class="sequence-note">确认当前站点后，选择刚解锁的下一波未来 3 站提示。</p><div class="hint-grid">${hintMarkup(state.pendingHint)}</div><button class="confirm-step" id="confirm-step" type="button" disabled>确认第 ${currentNumber} 站并推演第 ${currentNumber + 1}-${currentNumber + 3} 站</button>${candidateMessage}</div>`;
  content.innerHTML = `${nextPrompt}${resolved}`;
  const currentSelect = $("current-select");
  currentSelect.addEventListener("change", () => { state.pendingCurrent = currentSelect.value; renderForecast(); });
  content.querySelectorAll("[data-hint]").forEach((button) => button.addEventListener("click", () => { state.pendingHint = button.dataset.hint; renderForecast(); }));
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

$("totals-form").addEventListener("input", renderQuotaStatus);
$("start-button").addEventListener("click", () => {
  if (!renderQuotaStatus()) return;
  state.sequences = enumerateSequences(state.totals);
  resetRoute();
  renderForecast();
});
renderDifficulty();
updateRouteCopy();
renderQuotaStatus();

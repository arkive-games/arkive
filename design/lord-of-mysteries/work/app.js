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

const state = { difficulty: "challenge", totals: { winery: 5, food: 5, trade: 5 }, steps: [], pendingCurrent: "", pendingHint: "", sequences: [] };
const $ = (id) => document.getElementById(id);

function renderDifficulty() {
  $("difficulty-options").innerHTML = DIFFICULTIES.map((route) => `
    <button class="difficulty-button ${route.id === state.difficulty ? "is-active" : ""}" data-difficulty="${route.id}" type="button">
      <strong>${route.name}</strong><small>${route.en}</small>
    </button>`).join("");
  document.querySelectorAll("[data-difficulty]").forEach((button) => button.addEventListener("click", () => {
    state.difficulty = button.dataset.difficulty;
    state.steps = [];
    state.pendingCurrent = "";
    state.pendingHint = "";
    updateRouteCopy();
    renderDifficulty();
    renderForecast();
  }));
}

function updateRouteCopy() {
  const route = DIFFICULTIES.find((item) => item.id === state.difficulty);
  $("route-badge").textContent = `${route.name} · ${route.stops} 站`;
  $("route-description").textContent = route.id === "challenge"
    ? "输入本局总站点配额，再按游戏内出现的顺序录入提示。每提交一条提示，推演台才会解锁下一站。"
    : `${route.name}已切换。当前原型沿用 15 站配额模型，输入提示后即可查看窗口概率。`;
}

function readTotals() {
  return Object.fromEntries(TYPES.map((type) => [type, Math.max(0, Number($( `${type}-total`).value) || 0)]));
}

function renderQuotaStatus() {
  state.totals = readTotals();
  const total = TYPES.reduce((sum, type) => sum + state.totals[type], 0);
  $("quota-total-value").textContent = total;
  const message = $("quota-message");
  const valid = total === 15;
  message.textContent = valid ? "配额有效，可以开始推演。" : `还需要配置 ${Math.abs(15 - total)} 站（当前合计 ${total}）。`;
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
      if (remaining[type] === 0) return;
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
  return state.sequences.filter((sequence) => state.steps.every((step, index) => sequence[index] === step.currentType && matchesHint(sequence, index + 1, step.hintId)));
}

function probabilityFor(sequenceSet, position) {
  const counts = Object.fromEntries(TYPES.map((type) => [type, 0]));
  sequenceSet.forEach((sequence) => { counts[sequence[position]] += 1; });
  const total = sequenceSet.length || 1;
  return Object.fromEntries(TYPES.map((type) => [type, counts[type] / total]));
}

function probabilityMarkup(probability) {
  return `<div class="probability-grid">${TYPES.map((type) => {
    const value = Math.round(probability[type] * 100);
    return `<article class="probability-cell ${type}"><header><b>${TYPE_LABELS[type]}</b><span>${value}%</span></header><strong class="probability-value">${value}%</strong><div class="probability-bar"><i style="width:${value}%"></i></div></article>`;
  }).join("")}</div>`;
}

function renderForecast() {
  const intro = $("forecast-intro");
  const content = $("forecast-content");
  $("progress-count").textContent = state.steps.length;
  if (!state.sequences.length) { intro.classList.remove("is-hidden"); content.classList.add("is-hidden"); return; }
  intro.classList.add("is-hidden"); content.classList.remove("is-hidden");
  const nextStart = state.steps.length;
  const possible = filteredSequences();
  const complete = nextStart >= 12;
  const latestStart = state.steps.length - 1;
  const latestStep = latestStart >= 0 ? state.steps[latestStart] : null;
  const forecastCards = latestStep
    ? `<div class="resolved-window"><div class="window-meta"><span class="window-title">已解锁 · 第 <span>${latestStart + 2}-${latestStart + 4}</span> 站</span><span class="window-state">当前站：${TYPE_LABELS[latestStep.currentType]} · ${HINTS.find((hint) => hint.id === latestStep.hintId).label}</span></div><p class="sequence-note">只展示本次提示覆盖的未来 3 站概率，当前站点已按你的选择锁定。</p>${[0, 1, 2].map((offset) => `<div class="probability-section"><div class="probability-heading"><strong>第 ${latestStart + offset + 2} 站</strong><span>条件概率</span></div>${probabilityMarkup(probabilityFor(possible, latestStart + offset + 1))}</div>`).join("")}</div>`
    : "";
  const currentOptions = TYPES.map((type) => `<option value="${type}" ${state.pendingCurrent === type ? "selected" : ""}>${TYPE_LABELS[type]}</option>`).join("");
  const nextHintButtons = HINTS.map((hint) => `<button class="hint-button ${state.pendingHint === hint.id ? "is-selected" : ""}" data-hint="${hint.id}" type="button"><strong>${hint.label}</strong><small>${hint.detail}</small></button>`).join("");
  const nextPrompt = complete ? `<p class="sequence-note"><strong>15 站提示已全部录入。</strong>以上仅展示每次提示解锁的三站窗口。</p>` : `<div class="window-card"><div class="window-meta"><span class="window-title">第 <span>${nextStart + 1}</span> 站 · 先确认当前站点</span><span class="window-state">${possible.length.toLocaleString()} 种序列仍符合</span></div><div class="current-picker"><label for="current-select">当前站点类型</label><select id="current-select"><option value="">请选择</option>${currentOptions}</select></div><div class="hint-grid">${nextHintButtons}</div><button class="confirm-step" id="confirm-step" type="button" disabled>确认当前站点并推演未来 3 站</button><div class="sequence-note">必须同时选择当前站点和刚解锁的未来 3 站提示。</div></div>`;
  content.innerHTML = `${forecastCards}${nextPrompt}${possible.length === 0 ? `<p class="sequence-note">当前提示与总站点配额冲突，请调整总站点数量后重新开始。</p>` : ""}`;
  const currentSelect = $("current-select");
  if (currentSelect) currentSelect.addEventListener("change", () => { state.pendingCurrent = currentSelect.value; renderForecast(); });
  content.querySelectorAll("[data-hint]").forEach((button) => button.addEventListener("click", () => { state.pendingHint = button.dataset.hint; renderForecast(); }));
  const confirmButton = $("confirm-step");
  if (confirmButton) {
    confirmButton.disabled = !state.pendingCurrent || !state.pendingHint;
    confirmButton.addEventListener("click", () => {
      if (!state.pendingCurrent || !state.pendingHint) return;
      state.steps.push({ currentType: state.pendingCurrent, hintId: state.pendingHint });
      state.pendingCurrent = "";
      state.pendingHint = "";
      renderForecast();
    });
  }
}

$("totals-form").addEventListener("input", () => { renderQuotaStatus(); });
$("start-button").addEventListener("click", () => { if (!renderQuotaStatus()) return; state.sequences = enumerateSequences(state.totals); state.steps = []; state.pendingCurrent = ""; state.pendingHint = ""; renderForecast(); });
renderDifficulty();
renderQuotaStatus();

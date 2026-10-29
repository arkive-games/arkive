/**
 * Strings added for the score page's relic area, merged over the namespaces of
 * `src/i18n.ts` (a key here wins over the same key there). Keyed by i18n
 * namespace, then key; zh-CN and zh-TW fall back to English when absent.
 */
export const relicMessages: Record<'en-US' | 'zh-CN' | 'zh-TW', Record<string, Record<string, string>>> = {
  'en-US': {
    relic: {
      eqAssembly: 'Score = {{marks}} (assembly Marks) × {{pct}} (material affix efficiency) ÷ 10, rounded down = {{score}}',
      eqResonance: 'Score = {{marks}} (resonance Marks) × {{pct}} (resonance efficiency) ÷ 10, rounded down = {{score}}',
      eqAffix: 'Score = {{marks}} (affix Marks in effect) × {{pct}} (material affix efficiency) ÷ 10, rounded down = {{score}}',
      tagMarkLabel: 'Assembly',
      formulaAssembly: 'Score = each relic\'s assembly Mark at the grade it is scored at × extraordinary material affix efficiency ÷ 10, the three added up and then rounded down once.',
      formulaResonance: 'Score = each relic\'s resonance Mark × extraordinary resonance efficiency ÷ 10, the three added up and then rounded down once. The Mark is read off the resonance ladder of the relic\'s scored grade at the number of affixes in effect on its material; with two materials in effect, the one with more affixes counts.',
      formulaAffix: 'Score = the Marks of every affix in effect × extraordinary material affix efficiency ÷ 10 for each relic, the three added up and then rounded down once. Only materials in effect count, and past the grade\'s cap affixes switch off from the last one back (rare affixes never do).',
      formulaLocal: 'On this server a grade-1 relic is scored as grade 2.',
      resonanceNone: 'No affix in effect yet, so no resonance.',
      affixScoreOf: 'Scores {{score}} = Mark {{mark}} × {{pct}} (material affix efficiency) ÷ 10',
    },
  },
  'zh-CN': {
    relic: {
      eqAssembly: '分数 = {{marks}}（装配分值）× {{pct}}（非凡物质词条效能）÷ 10，向下取整 = {{score}}',
      eqResonance: '分数 = {{marks}}（共鸣分值）× {{pct}}（非凡共鸣效能）÷ 10，向下取整 = {{score}}',
      eqAffix: '分数 = {{marks}}（生效词条分值）× {{pct}}（非凡物质词条效能）÷ 10，向下取整 = {{score}}',
      tagMarkLabel: '装配',
      formulaAssembly: '分数 = 每件封印物生效等级的装配分值 × 非凡物质词条效能 ÷ 10，三件相加后向下取整一次。',
      formulaResonance: '分数 = 每件封印物的共鸣分值 × 非凡共鸣效能 ÷ 10，三件相加后向下取整一次。共鸣分值按封印物生效等级的共鸣表、以其物质当前生效的词条数读取；两个物质同时生效时取生效词条更多的那个。',
      formulaAffix: '分数 = 每件封印物所有生效词条的分值之和 × 非凡物质词条效能 ÷ 10，三件相加后向下取整一次。只计生效的物质；超过等级上限的词条从最后一条往前依次失效（稀有词条不会失效）。',
      formulaLocal: '本服中 1 级封印物按 2 级计分。',
      resonanceNone: '还没有生效的词条，暂无共鸣。',
      affixScoreOf: '计 {{score}} 分 = 分值 {{mark}} × {{pct}}（非凡物质词条效能）÷ 10',
    },
  },
  'zh-TW': {
    relic: {
      eqAssembly: '分數 = {{marks}}（裝配分值）× {{pct}}（非凡物質詞條效能）÷ 10，向下取整 = {{score}}',
      eqResonance: '分數 = {{marks}}（共鳴分值）× {{pct}}（非凡共鳴效能）÷ 10，向下取整 = {{score}}',
      eqAffix: '分數 = {{marks}}（生效詞條分值）× {{pct}}（非凡物質詞條效能）÷ 10，向下取整 = {{score}}',
      tagMarkLabel: '裝配',
      formulaAssembly: '分數 = 每件封印物生效等級的裝配分值 × 非凡物質詞條效能 ÷ 10，三件相加後向下取整一次。',
      formulaResonance: '分數 = 每件封印物的共鳴分值 × 非凡共鳴效能 ÷ 10，三件相加後向下取整一次。共鳴分值按封印物生效等級的共鳴表、以其物質當前生效的詞條數讀取；兩個物質同時生效時取生效詞條更多的那個。',
      formulaAffix: '分數 = 每件封印物所有生效詞條的分值之和 × 非凡物質詞條效能 ÷ 10，三件相加後向下取整一次。只計生效的物質；超過等級上限的詞條從最後一條往前依次失效（稀有詞條不會失效）。',
      formulaLocal: '本服中 1 級封印物按 2 級計分。',
      resonanceNone: '還沒有生效的詞條，暫無共鳴。',
      affixScoreOf: '計 {{score}} 分 = 分值 {{mark}} × {{pct}}（非凡物質詞條效能）÷ 10',
    },
  },
}

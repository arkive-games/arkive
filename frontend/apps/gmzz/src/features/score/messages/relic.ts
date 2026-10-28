/**
 * Strings added for the score page's relic area, merged over the namespaces of
 * `src/i18n.ts` (a key here wins over the same key there). Keyed by i18n
 * namespace, then key; zh-CN and zh-TW fall back to English when absent.
 */
export const relicMessages: Record<'en-US' | 'zh-CN' | 'zh-TW', Record<string, Record<string, string>>> = {
  'en-US': {
    relic: {
      tagMarkLabel: 'Assembly',
      formulaAssembly: 'Score = each relic\'s assembly Mark at the grade it is scored at × k2, the three added up and then rounded down once.',
      formulaResonance: 'Score = each relic\'s resonance Mark × k1, the three added up and then rounded down once. The Mark is read off the resonance ladder of the relic\'s scored grade at the number of affixes in effect on its material; with two materials in effect, the one with more affixes counts.',
      formulaAffix: 'Score = the Marks of every affix in effect × k2 for each relic, the three added up and then rounded down once. Only materials in effect count, and past the grade\'s cap affixes switch off from the last one back (rare affixes never do).',
      formulaK1: 'k1 = {{k}}: the extraordinary resonance efficiency {{pct}} at extraordinary knowledge level {{level}}, ÷ 1000.',
      formulaK2: 'k2 = {{k}}: the extraordinary material affix efficiency {{pct}} at extraordinary knowledge level {{level}}, ÷ 1000.',
      formulaLocal: 'On this server a grade-1 relic is scored as grade 2.',
      formulaLineAssembly: '{{group}} · grade {{grade}}: {{mark}} × {{k}} = {{value}}',
      formulaLineResonance: '{{group}} · grade {{grade}}, {{n}} affixes: {{mark}} × {{k}} = {{value}}',
      formulaLineAffix: '{{group}}: ({{marks}}) × {{k}} = {{value}}',
      formulaSum: 'Total = floor({{sum}}) = {{total}}',
      tierTip: '{{tier}} · {{kind}}',
      resonanceNone: 'No affix in effect yet, so no resonance.',
      affixScoreOf: 'Scores {{score}} (Mark {{mark}} × k2)',
    },
  },
  'zh-CN': {
    relic: {
      tagMarkLabel: '装配',
      formulaAssembly: '分数 = 每件封印物生效等级的装配分值 × k2，三件相加后向下取整一次。',
      formulaResonance: '分数 = 每件封印物的共鸣分值 × k1，三件相加后向下取整一次。共鸣分值按封印物生效等级的共鸣表、以其物质当前生效的词条数读取；两个物质同时生效时取生效词条更多的那个。',
      formulaAffix: '分数 = 每件封印物所有生效词条的分值之和 × k2，三件相加后向下取整一次。只计生效的物质；超过等级上限的词条从最后一条往前依次失效（稀有词条不会失效）。',
      formulaK1: 'k1 = {{k}}：非凡知识等级 {{level}} 的非凡共鸣效能 {{pct}} ÷ 1000。',
      formulaK2: 'k2 = {{k}}：非凡知识等级 {{level}} 的非凡物质词条效能 {{pct}} ÷ 1000。',
      formulaLocal: '本服中 1 级封印物按 2 级计分。',
      formulaLineAssembly: '{{group}} · {{grade}}级：{{mark}} × {{k}} = {{value}}',
      formulaLineResonance: '{{group}} · {{grade}}级 · {{n}} 条词条：{{mark}} × {{k}} = {{value}}',
      formulaLineAffix: '{{group}}：({{marks}}) × {{k}} = {{value}}',
      formulaSum: '合计 = floor({{sum}}) = {{total}}',
      tierTip: '{{tier}} · {{kind}}',
      resonanceNone: '还没有生效的词条，暂无共鸣。',
      affixScoreOf: '计 {{score}} 分（分值 {{mark}} × k2）',
    },
  },
  'zh-TW': {
    relic: {
      tagMarkLabel: '裝配',
      formulaAssembly: '分數 = 每件封印物生效等級的裝配分值 × k2，三件相加後向下取整一次。',
      formulaResonance: '分數 = 每件封印物的共鳴分值 × k1，三件相加後向下取整一次。共鳴分值按封印物生效等級的共鳴表、以其物質當前生效的詞條數讀取；兩個物質同時生效時取生效詞條更多的那個。',
      formulaAffix: '分數 = 每件封印物所有生效詞條的分值之和 × k2，三件相加後向下取整一次。只計生效的物質；超過等級上限的詞條從最後一條往前依次失效（稀有詞條不會失效）。',
      formulaK1: 'k1 = {{k}}：非凡知識等級 {{level}} 的非凡共鳴效能 {{pct}} ÷ 1000。',
      formulaK2: 'k2 = {{k}}：非凡知識等級 {{level}} 的非凡物質詞條效能 {{pct}} ÷ 1000。',
      formulaLocal: '本服中 1 級封印物按 2 級計分。',
      formulaLineAssembly: '{{group}} · {{grade}}級：{{mark}} × {{k}} = {{value}}',
      formulaLineResonance: '{{group}} · {{grade}}級 · {{n}} 條詞條：{{mark}} × {{k}} = {{value}}',
      formulaLineAffix: '{{group}}：({{marks}}) × {{k}} = {{value}}',
      formulaSum: '合計 = floor({{sum}}) = {{total}}',
      tierTip: '{{tier}} · {{kind}}',
      resonanceNone: '還沒有生效的詞條，暫無共鳴。',
      affixScoreOf: '計 {{score}} 分（分值 {{mark}} × k2）',
    },
  },
}

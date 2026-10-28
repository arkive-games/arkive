/**
 * Strings added for the score page's pathway area, merged over the namespaces of
 * `src/i18n.ts` (a key here wins over the same key there). Keyed by i18n
 * namespace, then key; zh-CN and zh-TW fall back to English when absent.
 */
export const pathwayMessages: Record<'en-US' | 'zh-CN' | 'zh-TW', Record<string, Record<string, string>>> = {
  'en-US': {
    pathway: {
      // The old text said "before role level 47", which reads as the opposite of what the code does.
      skillFormula: 'Score = {{per}} × skill level + {{base}}, once every pathway skill is unlocked (from role level 47). The skill level is the one shared with puppets and connections; levels relics add do not count.',
      skillFormulaLive: '{{per}} × {{level}} + {{base}} = {{score}}',
      skillFormulaCurve: 'Not every pathway skill is unlocked at this progression, so the score is the game\'s own benchmark here, {{score}}: what the panel shows with every unlocked skill at its cap.',
      levelFormulaLive: 'Expected benchmark at this progression = {{score}}',
      levelRange: 'Role level runs 1–{{maxRole}}; divinity level (0–{{maxDivinity}}) only counts at role level {{maxRole}}.',
      formulaLive: '{{normal}} × {{points}} + {{special}} × {{cores}} = {{score}}',
      limitsTip: 'At this progression: {{points}} talent points, {{nodes}} talents open, each up to Lv{{level}}. A talent opens once the one before it has a level.',
      coreScore: 'Switches on with the first level of {{parent}}: +{{mark}}',
      statsTitle: 'Talent attributes',
      statsNone: 'No talent levels yet, so no attributes.',
    },
  },
  'zh-CN': {
    pathway: {
      skillFormula: '分数 = {{per}} × 技能等级 + {{base}}，在途径技能全部解锁后生效（扮演等级 47 起）。技能等级与秘偶、人脉共用；封印物额外提升的等级不计分。',
      skillFormulaLive: '{{per}} × {{level}} + {{base}} = {{score}}',
      skillFormulaCurve: '当前进度下途径技能尚未全部解锁，分数取游戏自身的基准值 {{score}}，即已解锁技能全部满级时面板显示的分数。',
      levelFormulaLive: '当前进度的期望值 = {{score}}',
      levelRange: '角色等级 1–{{maxRole}}；神性等级（0–{{maxDivinity}}）仅在角色等级 {{maxRole}} 时计入。',
      formulaLive: '{{normal}} × {{points}} + {{special}} × {{cores}} = {{score}}',
      limitsTip: '当前进度：{{points}} 天赋点，开放 {{nodes}} 个天赋，每个上限 {{level}} 级。前一个天赋有等级后才能点下一个。',
      coreScore: '{{parent}} 点出第 1 级时自动激活：+{{mark}}',
      statsTitle: '天赋属性',
      statsNone: '尚未点出天赋等级，暂无属性加成。',
    },
  },
  'zh-TW': {
    pathway: {
      skillFormula: '分數 = {{per}} × 技能等級 + {{base}}，在途徑技能全部解鎖後生效（扮演等級 47 起）。技能等級與秘偶、人脈共用；封印物額外提升的等級不計分。',
      skillFormulaLive: '{{per}} × {{level}} + {{base}} = {{score}}',
      skillFormulaCurve: '目前進度下途徑技能尚未全部解鎖，分數取遊戲自身的基準值 {{score}}，即已解鎖技能全部滿級時面板顯示的分數。',
      levelFormulaLive: '目前進度的期望值 = {{score}}',
      levelRange: '角色等級 1–{{maxRole}}；神性等級（0–{{maxDivinity}}）僅在角色等級 {{maxRole}} 時計入。',
      formulaLive: '{{normal}} × {{points}} + {{special}} × {{cores}} = {{score}}',
      limitsTip: '目前進度：{{points}} 天賦點，開放 {{nodes}} 個天賦，每個上限 {{level}} 級。前一個天賦有等級後才能點下一個。',
      coreScore: '{{parent}} 點出第 1 級時自動啟用：+{{mark}}',
      statsTitle: '天賦屬性',
      statsNone: '尚未點出天賦等級，暫無屬性加成。',
    },
  },
}

/**
 * Strings added for the score page's pathway area, merged over the namespaces of
 * `src/i18n.ts` (a key here wins over the same key there). Keyed by i18n
 * namespace, then key; zh-CN and zh-TW fall back to English when absent.
 */
export const pathwayMessages: Record<'en-US' | 'zh-CN' | 'zh-TW', Record<string, Record<string, string>>> = {
  'en-US': {
    score: {
      bandIs: 'Band: {{band}}',
      raiseWith: 'Raise it with: {{list}}',
        percentOfMax: '{{percent}}% of the maximum',
    },
    pathway: {
      eqLevel: 'Score = the expected value at this role and divinity level = {{score}}',
      eqSkill: 'Score = {{per}} × {{level}} (skill level) + {{base}} = {{score}}',
      eqSkillCurve: 'Score = the expected value at this progression = {{score}} (not every pathway skill is unlocked yet)',
      eqTalent: 'Score = {{normal}} × {{points}} (talent points) + {{special}} × {{cores}} (cores active) = {{score}}',
      // The old text said "before role level 47", which reads as the opposite of what the code does.
      skillFormula: 'Score = {{per}} × skill level + {{base}}, once every pathway skill is unlocked (from role level 47). The skill level is the one shared with puppets and connections; levels relics add do not count.',
      skillFormulaLive: '{{per}} × {{level}} + {{base}} = {{score}}',
      skillFormulaCurve: 'Not every pathway skill is unlocked at this progression, so the score is the game\'s own benchmark here, {{score}}: what the panel shows with every unlocked skill at its cap.',
      levelFormulaLive: 'Expected benchmark at this progression = {{score}}',
      levelRange: 'Role level runs 1–{{maxRole}}; divinity level (0–{{maxDivinity}}) only counts at role level {{maxRole}}.',
      formulaLive: '{{normal}} × {{points}} + {{special}} × {{cores}} = {{score}}',
      limitsTip: 'At this progression: {{points}} talent points, {{nodes}} talents open, each up to Lv{{level}}. A talent opens once the one before it has a level.',
      statsTitle: 'Talent attributes',
      statsNone: 'No talent levels yet, so no attributes.',
    },
  },
  'zh-CN': {
    score: {
      bandIs: '评级：{{band}}',
      raiseWith: '提升途径：{{list}}',
        percentOfMax: '达成上限的 {{percent}}%',
    },
    pathway: {
      eqLevel: '分数 = 当前扮演与神性等级的期望值 = {{score}}',
      eqSkill: '分数 = {{per}} × {{level}}（技能等级）+ {{base}} = {{score}}',
      eqSkillCurve: '分数 = 当前进度的期望值 = {{score}}（途径技能尚未全部解锁）',
      eqTalent: '分数 = {{normal}} × {{points}}（天赋点）+ {{special}} × {{cores}}（激活特效）= {{score}}',
      skillFormula: '分数 = {{per}} × 技能等级 + {{base}}，在途径技能全部解锁后生效（扮演等级 47 起）。技能等级与秘偶、人脉共用；封印物额外提升的等级不计分。',
      skillFormulaLive: '{{per}} × {{level}} + {{base}} = {{score}}',
      skillFormulaCurve: '当前进度下途径技能尚未全部解锁，分数取游戏自身的基准值 {{score}}，即已解锁技能全部满级时面板显示的分数。',
      levelFormulaLive: '当前进度的期望值 = {{score}}',
      levelRange: '角色等级 1–{{maxRole}}；神性等级（0–{{maxDivinity}}）仅在角色等级 {{maxRole}} 时计入。',
      formulaLive: '{{normal}} × {{points}} + {{special}} × {{cores}} = {{score}}',
      limitsTip: '当前进度：{{points}} 天赋点，开放 {{nodes}} 个天赋，每个上限 {{level}} 级。前一个天赋有等级后才能点下一个。',
      statsTitle: '天赋属性',
      statsNone: '尚未点出天赋等级，暂无属性加成。',
    },
  },
  'zh-TW': {
    score: {
      bandIs: '評級：{{band}}',
      raiseWith: '提升途徑：{{list}}',
        percentOfMax: '達成上限的 {{percent}}%',
    },
    pathway: {
      eqLevel: '分數 = 當前扮演與神性等級的期望值 = {{score}}',
      eqSkill: '分數 = {{per}} × {{level}}（技能等級）+ {{base}} = {{score}}',
      eqSkillCurve: '分數 = 當前進度的期望值 = {{score}}（途徑技能尚未全部解鎖）',
      eqTalent: '分數 = {{normal}} × {{points}}（天賦點）+ {{special}} × {{cores}}（啟用特效）= {{score}}',
      skillFormula: '分數 = {{per}} × 技能等級 + {{base}}，在途徑技能全部解鎖後生效（扮演等級 47 起）。技能等級與秘偶、人脈共用；封印物額外提升的等級不計分。',
      skillFormulaLive: '{{per}} × {{level}} + {{base}} = {{score}}',
      skillFormulaCurve: '目前進度下途徑技能尚未全部解鎖，分數取遊戲自身的基準值 {{score}}，即已解鎖技能全部滿級時面板顯示的分數。',
      levelFormulaLive: '目前進度的期望值 = {{score}}',
      levelRange: '角色等級 1–{{maxRole}}；神性等級（0–{{maxDivinity}}）僅在角色等級 {{maxRole}} 時計入。',
      formulaLive: '{{normal}} × {{points}} + {{special}} × {{cores}} = {{score}}',
      limitsTip: '目前進度：{{points}} 天賦點，開放 {{nodes}} 個天賦，每個上限 {{level}} 級。前一個天賦有等級後才能點下一個。',
      statsTitle: '天賦屬性',
      statsNone: '尚未點出天賦等級，暫無屬性加成。',
    },
  },
}

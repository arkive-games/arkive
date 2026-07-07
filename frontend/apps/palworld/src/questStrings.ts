import type { Language } from './i18n'

// Quest-log UI chrome, merged into the `translation` namespace under `quest`
// (see i18n.ts). Quest titles/descriptions themselves come from the locale data
// files (locales/<lng>/quests.json); this table only holds the page's own UI.
//
// Only a subset of languages is translated here; the rest fall back to en-US
// (i18n fallbackLng) — the data-driven quest text stays fully localized either
// way.
export interface QuestStrings {
  title: string
  searchPlaceholder: string
  count: string
  all: string
  notFound: string
  backToList: string
  exp: string
  expShort: string
  location: string
  section: { brief: string; rewards: string; next: string; info: string }
  type: { label: string; Main: string; Sub: string; Hidden: string }
}

export const QUEST_STRINGS: Partial<Record<Language, QuestStrings>> = {
  'en-US': {
    title: 'Quests',
    searchPlaceholder: 'Search quests…',
    count: '{{count}} quests',
    all: 'All',
    notFound: 'No quest found for "{{id}}".',
    backToList: 'Back to Quests',
    exp: 'EXP reward',
    expShort: '{{count}} EXP',
    location: 'Location',
    section: { brief: 'Brief', rewards: 'Rewards', next: 'Leads to', info: 'Details' },
    type: { label: 'Type', Main: 'Main', Sub: 'Side', Hidden: 'Hidden' },
  },
  'ja-JP': {
    title: 'クエスト',
    searchPlaceholder: 'クエストを検索…',
    count: '{{count}} 件',
    all: 'すべて',
    notFound: '「{{id}}」のクエストが見つかりません。',
    backToList: 'クエスト一覧に戻る',
    exp: '報酬EXP',
    expShort: '{{count}} EXP',
    location: '場所',
    section: { brief: '概要', rewards: '報酬', next: '次のクエスト', info: '基本情報' },
    type: { label: '種類', Main: 'メイン', Sub: 'サブ', Hidden: '隠し' },
  },
  'ko-KR': {
    title: '퀘스트',
    searchPlaceholder: '퀘스트 검색…',
    count: '{{count}}개',
    all: '전체',
    notFound: '"{{id}}"에 해당하는 퀘스트를 찾을 수 없습니다.',
    backToList: '퀘스트 목록으로',
    exp: '보상 EXP',
    expShort: '{{count}} EXP',
    location: '위치',
    section: { brief: '개요', rewards: '보상', next: '다음 퀘스트', info: '정보' },
    type: { label: '종류', Main: '메인', Sub: '서브', Hidden: '숨김' },
  },
  'zh-CN': {
    title: '任务',
    searchPlaceholder: '搜索任务…',
    count: '{{count}} 个任务',
    all: '全部',
    notFound: '未找到任务「{{id}}」。',
    backToList: '返回任务列表',
    exp: '经验奖励',
    expShort: '{{count}} 经验',
    location: '地点',
    section: { brief: '简介', rewards: '奖励', next: '后续任务', info: '信息' },
    type: { label: '类型', Main: '主线', Sub: '支线', Hidden: '隐藏' },
  },
  'zh-TW': {
    title: '任務',
    searchPlaceholder: '搜尋任務…',
    count: '{{count}} 個任務',
    all: '全部',
    notFound: '未找到任務「{{id}}」。',
    backToList: '返回任務列表',
    exp: '經驗獎勵',
    expShort: '{{count}} 經驗',
    location: '地點',
    section: { brief: '簡介', rewards: '獎勵', next: '後續任務', info: '資訊' },
    type: { label: '類型', Main: '主線', Sub: '支線', Hidden: '隱藏' },
  },
}

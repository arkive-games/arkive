import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { createLanguagePreference, detectLanguagePreference } from '@gamemap/state-memory'
import { bindArkiveDocumentLocale } from '@gamemap/map-shell'

/**
 * Languages offered in the switcher.
 *
 * These are the languages the game itself ships text for, plus zh-TW — which
 * the game does not ship, so its game data falls back to zh-CN (see
 * `loadBundle`). UI strings exist for en-US / zh-CN / zh-TW; the rest fall back
 * to English chrome around fully localized game text, which is the useful half.
 */
export const LANGUAGES = [
  'en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'de-DE', 'es-ES', 'es-MX',
  'fr-FR', 'it-IT', 'pl-PL', 'pt-BR', 'ru-RU', 'th-TH', 'tr-TR',
] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'de-DE': 'Deutsch',
  'es-ES': 'Español',
  'es-MX': 'Español (LA)',
  'fr-FR': 'Français',
  'it-IT': 'Italiano',
  'pl-PL': 'Polski',
  'pt-BR': 'Português (BR)',
  'ru-RU': 'Русский',
  'th-TH': 'ไทย',
  'tr-TR': 'Türkçe',
}

const en = {
  siteTitle: 'Lord of Mysteries Wiki',
  brand: 'Arkive.games',
  brandSlogan: 'Sail Games With Us.',
  brandHome: 'Arkive guide home',
  login: 'Log in',
  more: 'More',
  back: 'Back',
  loadError: 'Failed to load data. Please try again later.',
  loading: 'Loading…',
  notFound: 'Not found.',
  themeAuto: 'Auto',
  themeLight: 'Light',
  themeDark: 'Dark',
  themeMenu: 'Theme',
  languageMenu: 'Language',
  nav: {"home": "Home", "traintrade": "Train Trade", "utopia": "Utopian Theater", "changelog": "Changelog"},
  siteInfo: {
    tab: 'About',
    aboutTitle: 'About this site',
    arkiveName: 'Arkive',
    gameName: 'Lord of Mysteries',
    introTemplate: 'This unofficial {game} interactive database is built and maintained by {arkive}. All game data is extracted from the game files, and the site will always remain free to use.',
    disclaimerTemplate: 'This site is not affiliated with, authorized, or endorsed by {developer}. All rights to {game} and related game content belong to {developer}.',
    versionTitle: 'Version updates',
    viewVersionTemplate: 'View version {version}',
    recentUpdatesTitle: 'Recent updates',
    noRecentUpdates: 'No updates yet.',
    feedbackTitle: 'Community and feedback',
    feedbackHint: 'Use the feedback QQ group below to suggest improvements or report problems.',
    feedbackGroupLabel: 'Feedback QQ group',
    copy: 'Copy',
    copied: 'Copied',
    close: 'Close',
  },
  home: {
    "tagline": "Train Trade goods and Utopian Theater cards, straight from the game files.",
    "browse": "Browse Train Trade goods",
    "dataNote": "Data extracted from game build {{version}}."
  },
  changelog: {
    title: 'Changelog',
    current: 'Current',
    empty: 'No entries yet.',
    kind: { feature: 'Feature', improvement: 'Improvement', fix: 'Fix', data: 'Data' },
  },
  trainTrade: {
    "eyebrow": "Lord of Mysteries · Train Tycoon",
    "title": "Train Tycoon Goods",
    "description": "Browse {{count}} goods entries from the game package with fast price and route lookup.",
    "homeSummary": "Goods catalog",
    "homeDescription": "Find Train Tycoon cargo by category, quality, and keyword.",
    "filters": "Goods filters",
    "categoryLabel": "Category",
    "categoryHint": "Filter by goods category",
    "category": {
      "all": "All",
      "WINE": "Wine",
      "FOOD": "Food",
      "CLOTH": "Clothing",
      "ART": "Art",
      "CRAFTS": "Crafts"
    },
    "qualityLabel": "Quality",
    "qualityHint": "Filter by in-game goods quality",
    "qualityValue": "Quality {{value}}",
    "all": "All",
    "levelValue": "Level {{value}}",
    "buyPrice": "Base buy",
    "buyPriceShort": "Buy",
    "sellPrice": "Base sell",
    "sellPriceShort": "Sell",
    "leftoverPrice": "Leftover sell",
    "leftoverPriceShort": "Leftover",
    "buyStations": "Buy at",
    "sellStations": "Sell at",
    "searchLabel": "Search Train Tycoon goods",
    "searchPlaceholder": "Search by name, description, or station",
    "resultCount": "Showing {{count}} goods",
    "view": "View mode",
    "viewGrid": "Cards",
    "viewList": "List",
    "sourceNote": "Data and icons are parsed from the remote game package and update independently.",
    "noDescription": "No description",
    "empty": "No goods match these filters",
    "loadError": "Train Tycoon goods could not be loaded.",
    "stats": {
      "total": "Total goods",
      "categories": "Categories",
      "quality": "Top quality"
    },
    "station": {
      "start": "Start",
      "wine": "Winery",
      "food": "Food stall",
      "art": "Trade house"
    },
    "stationTool": {
      "productTitle": "Lord of Mysteries",
      "eyebrow": "Train Tycoon · Station tool",
      "title": "Station route planner",
      "description": "Choose your cargo and current state to project upcoming station combinations, ranked by the cargo's estimated sell range.",
      "controls": "Planner controls",
      "goods": "Cargo",
      "currentStation": "Current station",
      "stops": "Stops to project",
      "stopsValue": "Next {{value}} stops",
      "difficulty": "Price difficulty",
      "difficultyValue": "Difficulty {{value}}",
      "ruleLabel": "Station rule",
      "rule": {
        "standard": "Standard",
        "chaos": "Chaos",
        "free": "Free"
      },
      "ruleDescription": {
        "standard": "Adjacent stations cannot repeat, and the first stop differs from the current station.",
        "chaos": "Each block of three contains one winery, food stall, and trade house.",
        "free": "Apply no station restriction to see every possible combination."
      },
      "resultsEyebrow": "Route candidates",
      "resultsTitle": "Top {{count}} reference routes",
      "selectedGoods": "Cargo: {{goods}}",
      "route": "Route {{value}}",
      "estimatedRange": "Cumulative base-sell reference range",
      "priceNote": "Ranges come from the Train Tycoon package difficulty tables and exclude strategy cards, contracts, and temporary bonuses.",
      "loadError": "Station route data could not be loaded.",
      "planner": {
        "workspaceTitle": "Railway station planner",
        "difficultyHeading": "Choose route difficulty",
        "difficultyPlaceholder": "Select a route",
        "difficultySummary": "Select a route to see its rules and modifiers.",
        "difficultyProfile": {
          "beginner": {
            "name": "Beginner route",
            "description": "Start gently with fewer choices and lower risk.",
            "price": "Buy 0.7-1.2x · Sell 1.0-1.4x",
            "stock": "Contract stock bonus 10% / 50% / 100% / 150%"
          },
          "normal": {
            "name": "Normal route",
            "description": "More strategy cards appear, making every decision matter.",
            "price": "Buy 0.7-1.2x · Sell 0.7-1.4x",
            "stock": "Contract stock bonus 10% / 50% / 100% / 150%"
          },
          "advanced": {
            "name": "Advanced route",
            "description": "An advanced route that needs more permits and careful tradeoffs.",
            "price": "Buy 0.7-1.2x · Sell 0.7-1.4x",
            "stock": "Contract stock bonus 10% / 50% / 100% / 150%"
          },
          "hard": {
            "name": "Hard route",
            "description": "Returns and risks climb together. Choose your bets carefully.",
            "price": "Buy 0.7-1.4x · Sell 0.6-1.5x",
            "stock": "Contract stock bonus 10% / 75% / 150% / 225%"
          },
          "challenge": {
            "name": "Challenge route",
            "description": "Pursue the optimal line through Train Tycoon's most complex map.",
            "price": "Buy 0.7-1.4x · Sell 0.6-1.5x",
            "stock": "Contract stock bonus 10% / 75% / 150% / 225%"
          }
        },
        "quotaHeading": "Total station quota",
        "quotaValid": "The quota is valid. You can start planning.",
        "quotaInvalid": "Configure {{remaining}} more stops ({{current}} currently assigned).",
        "quotaConfirm": "Confirm station quota",
        "quotaConfirmed": "Station quota confirmed",
        "generating": "Generating feasible routes...",
        "forecastStart": "Choose a route and confirm its station quota to begin.",
        "undo": "Undo last step",
        "stationProgress": "Station progress",
        "previousStations": "Show previous stations",
        "nextStations": "Show next stations",
        "stationRange": "Stops {{start}}-{{end}}",
        "stationForecasted": "Projected",
        "stationPending": "Pending",
        "stationInfoHeading": "Station information",
        "currentStation": "Current station",
        "startStation": "Starting station",
        "futureHint": "Next three stops",
        "selectPlaceholder": "Select",
        "confirmOrigin": "Confirm and project stops 1-3",
        "hint": {
          "winery-most": "Mostly wineries",
          "food-most": "Mostly food stalls",
          "trade-most": "Mostly trade houses",
          "equal": "One of each station"
        },
        "stepConfirmHeading": "Stop {{station}} · Confirm",
        "lockedAt": "Locked at 100%",
        "noRoute": "That station and hint combination has no feasible route. Change one of them.",
        "confirmWindow": "Confirm and project stops {{start}}-{{end}}",
        "complete": "The {{count}}-stop information chain is complete.",
        "currentDetail": "Current stop: {{station}} · {{hint}}",
        "originHintDetail": "Starting hint: {{hint}}",
        "probabilityAt": "Stop {{station}} probability",
        "highest": "Highest",
        "combinationHeading": "Stop {{start}}-{{end}} combinations",
        "remainingHeading": "Remaining stations",
        "stationUnit": "left",
        "historyHeading": "Challenge route history",
        "historyCount": "{{count}} entries",
        "historyEmpty": "No confirmed hints yet",
        "historyRange": "Stops {{start}}-{{end}}",
        "originDetail": "Starting station hint",
        "stepDetail": "Stop {{station}}: {{type}}",
        "disclaimer": "Results enumerate feasible routes from the confirmed station quota and three-stop hints. Use them as planning guidance."
      }
    }
  },
  utopianTheater: {
    "eyebrow": "Lord of Mysteries · Utopian Theater",
    "siteTitle": "Lord of Mysteries Wiki",
    "title": "Utopian Theater",
    "description": "Browse {{count}} memory-fragment combat entries from the game package, grouped by the tag the client assigns.",
    "dungeonNote": "Dungeon length: 4 floors on Normal, 6 on Hard and Nightmare; candidate order is generated at runtime.",
    "homeSummary": "Memory fragments",
    "homeDescription": "Filter Utopian Theater combat bonuses by group, quality, and keyword.",
    "quality": "Quality",
    "qualityHint": "Filter by in-game fragment quality",
    "qualityValue": "Quality {{value}}",
    "searchLabel": "Search memory fragments",
    "searchPlaceholder": "Search by name, effect, or tag",
    "resultCount": "Showing {{count}} entries",
    "sourceNote": "Data parsed from the local game package",
    "view": "View mode",
    "viewGrid": "Cards",
    "viewList": "List",
    "runtimeNote": "In-run candidates are generated at runtime",
    "empty": "No memory fragments match these filters",
    "loadError": "Memory-fragment data could not be loaded.",
    "stats": {
      "total": "Total entries",
      "general": "Shared pool",
      "paths": "Pathways"
    },
    "tagLabel": "Group",
    "tagHint": "Filter by the group the client assigns",
    "tags": "Memory-fragment groups",
    "all": "All",
    "tagAll": "All"
  },
  catalogPagination: {
    "label": "Catalog pages",
    "previous": "Previous page",
    "next": "Next page",
    "status": "Page {{page}} / {{total}}"
  },
  common: {
    "loading": "Loading…"
  },
}

type Strings = typeof en

const zhCN: Strings = {
  siteTitle: '诡秘之主资料库',
  brand: '藏舟游戏攻略网',
  brandSlogan: '万千攻略，藏于一舟',
  brandHome: '藏舟攻略首页',
  login: '登录',
  more: '更多',
  back: '返回',
  loadError: '数据加载失败，请稍后重试。',
  loading: '加载中…',
  notFound: '未找到。',
  themeAuto: '跟随系统',
  themeLight: '浅色模式',
  themeDark: '深色模式',
  themeMenu: '主题',
  languageMenu: '语言',
  nav: {"home": "首页", "traintrade": "铁路大亨", "utopia": "乌托邦剧场", "changelog": "更新日志"},
  siteInfo: {
    tab: '关于',
    aboutTitle: '关于本站',
    arkiveName: '藏舟攻略网',
    gameName: '诡秘之主',
    introTemplate: '本站是由{arkive}搭建与维护的{game}非官方互动资料库，游戏数据均从游戏文件中提取，永久免费开放。',
    disclaimerTemplate: '本站与{developer}无隶属关系，也未获其授权或背书。{game}及相关游戏内容的一切权利均归{developer}所有。',
    versionTitle: '版本更新记录',
    viewVersionTemplate: '查看版本 {version}',
    recentUpdatesTitle: '近期更新',
    noRecentUpdates: '暂无更新记录。',
    feedbackTitle: '交流与反馈',
    feedbackHint: '欢迎通过下方反馈 QQ 群提出建议、反馈问题或报告错误。',
    feedbackGroupLabel: '反馈 QQ 群',
    copy: '复制',
    copied: '已复制',
    close: '关闭',
  },
  home: {
    "tagline": "直接从游戏文件提取的铁路大亨货物与乌托邦剧场卡牌资料。",
    "browse": "浏览铁路大亨货物",
    "dataNote": "数据提取自游戏版本 {{version}}。"
  },
  changelog: {
    title: '更新日志',
    current: '当前版本',
    empty: '暂无记录。',
    kind: { feature: '新功能', improvement: '改进', fix: '修复', data: '数据' },
  },
  trainTrade: {
    "eyebrow": "诡秘之主 · 铁路大亨",
    "title": "铁路大亨货物",
    "description": "收录包体内 {{count}} 条铁路大亨货物资料，快速查看货物属性与交易价格。",
    "homeSummary": "货物清单",
    "homeDescription": "按货物类别、品质和关键词查找铁路大亨的运输物产。",
    "filters": "货物筛选",
    "categoryLabel": "类别",
    "categoryHint": "按商品所属类别筛选",
    "category": {
      "all": "全部",
      "WINE": "酒类",
      "FOOD": "食物",
      "CLOTH": "衣物",
      "ART": "艺术品",
      "CRAFTS": "工艺品"
    },
    "qualityLabel": "品质",
    "qualityHint": "按游戏内货物品质筛选",
    "qualityValue": "品质 {{value}}",
    "all": "全部",
    "levelValue": "等级 {{value}}",
    "buyPrice": "基础买入",
    "buyPriceShort": "买入",
    "sellPrice": "基础卖出",
    "sellPriceShort": "卖出",
    "leftoverPrice": "余货卖出",
    "leftoverPriceShort": "余货",
    "buyStations": "可买入站点",
    "sellStations": "可卖出站点",
    "searchLabel": "搜索铁路大亨货物",
    "searchPlaceholder": "按名称、描述或站点搜索",
    "resultCount": "显示 {{count}} 条货物",
    "view": "查看方式",
    "viewGrid": "卡片",
    "viewList": "列表",
    "sourceNote": "数据来自远程游戏包体解析，图标与货物数据独立更新。",
    "noDescription": "暂无描述",
    "empty": "没有匹配的货物",
    "loadError": "铁路大亨货物数据加载失败，请稍后重试。",
    "stats": {
      "total": "货物总数",
      "categories": "货物类别",
      "quality": "最高品质"
    },
    "station": {
      "start": "出发站",
      "wine": "酒庄",
      "food": "食铺",
      "art": "商行"
    },
    "stationTool": {
      "productTitle": "诡秘之主",
      "eyebrow": "铁路大亨 · 站点工具",
      "title": "站点推演",
      "description": "选择车上物产和当前状态，推演未来站点组合，并按货物的预计卖出区间排列路线。",
      "controls": "推演参数",
      "goods": "车上物产",
      "currentStation": "当前站点",
      "stops": "推演站数",
      "stopsValue": "未来 {{value}} 站",
      "difficulty": "价格难度",
      "difficultyValue": "难度 {{value}}",
      "ruleLabel": "站点规则",
      "rule": {
        "standard": "标准",
        "chaos": "混沌",
        "free": "自由"
      },
      "ruleDescription": {
        "standard": "相邻站点不会重复，第一站也不会与当前站点相同。",
        "chaos": "每组三站各出现一次酒庄、食铺和商行。",
        "free": "不应用站点限制，查看所有可能组合。"
      },
      "resultsEyebrow": "候选路线",
      "resultsTitle": "前 {{count}} 条参考路线",
      "selectedGoods": "当前物产：{{goods}}",
      "route": "路线 {{value}}",
      "estimatedRange": "累计基础卖出参考区间",
      "priceNote": "价格区间来自铁路大亨包体的难度表，不包含策略卡、合同和临时增益。",
      "loadError": "站点推演数据加载失败，请稍后重试。",
      "planner": {
        "workspaceTitle": "铁路站点推演",
        "difficultyHeading": "选择路线难度",
        "difficultyPlaceholder": "点这里选择",
        "difficultySummary": "选择路线后查看该难度的规则摘要。",
        "difficultyProfile": {
          "beginner": {
            "name": "新手路线",
            "description": "从这里轻松启程，有限的选择能降低风险。",
            "price": "买入 0.7-1.2 倍 · 卖出 1.0-1.4 倍",
            "stock": "合同库存加成 10% / 50% / 100% / 150%"
          },
          "normal": {
            "name": "普通路线",
            "description": "更多策略卡在此登场，每次判断带来全新结果。",
            "price": "买入 0.7-1.2 倍 · 卖出 0.7-1.4 倍",
            "stock": "合同库存加成 10% / 50% / 100% / 150%"
          },
          "advanced": {
            "name": "进阶路线",
            "description": "需要更多许可证解锁的高级路线，权衡你的选择吧。",
            "price": "买入 0.7-1.2 倍 · 卖出 0.7-1.4 倍",
            "stock": "合同库存加成 10% / 50% / 100% / 150%"
          },
          "hard": {
            "name": "困难路线",
            "description": "在收益与风险并行的路线上，你将如何下注？",
            "price": "买入 0.7-1.4 倍 · 卖出 0.6-1.5 倍",
            "stock": "合同库存加成 10% / 75% / 150% / 225%"
          },
          "challenge": {
            "name": "挑战路线",
            "description": "在复杂地图中追逐最优解，铁路大亨的试炼场。",
            "price": "买入 0.7-1.4 倍 · 卖出 0.6-1.5 倍",
            "stock": "合同库存加成 10% / 75% / 150% / 225%"
          }
        },
        "quotaHeading": "总站点配额",
        "quotaValid": "配额有效，可以开始推演。",
        "quotaInvalid": "还需要配置 {{remaining}} 站（当前合计 {{current}}）。",
        "quotaConfirm": "确认总站点配额",
        "quotaConfirmed": "总站点配额已确认",
        "generating": "正在生成可行路线...",
        "forecastStart": "选择路线并确认总站点配额后开始推演。",
        "undo": "撤销上一步",
        "stationProgress": "站点进度",
        "previousStations": "查看前一组站点",
        "nextStations": "查看后一组站点",
        "stationRange": "第 {{start}}-{{end}} 站",
        "stationForecasted": "已推演",
        "stationPending": "待确认",
        "stationInfoHeading": "站点信息",
        "currentStation": "当前站点",
        "startStation": "始发站",
        "futureHint": "未来三站",
        "selectPlaceholder": "请选择",
        "confirmOrigin": "确认并推演第 1-3 站",
        "hint": {
          "winery-most": "酒庄最多",
          "food-most": "食铺最多",
          "trade-most": "商行最多",
          "equal": "各站点相同"
        },
        "stepConfirmHeading": "第 {{station}} 站 · 确认",
        "lockedAt": "100% 已锁定",
        "noRoute": "当前站点与提示组合没有可行路线，请更换其中一项。",
        "confirmWindow": "确认并推演第 {{start}}-{{end}} 站",
        "complete": "{{count}} 站信息链已完成。",
        "currentDetail": "当前站：{{station}} · {{hint}}",
        "originHintDetail": "始发站提示：{{hint}}",
        "probabilityAt": "第 {{station}} 站概率",
        "highest": "最高",
        "combinationHeading": "第 {{start}}-{{end}} 站组合情况",
        "remainingHeading": "剩余站点数",
        "stationUnit": "站",
        "historyHeading": "挑战路线记录",
        "historyCount": "{{count}} 条",
        "historyEmpty": "暂无已确认提示",
        "historyRange": "第 {{start}}-{{end}} 站",
        "originDetail": "始发站提示",
        "stepDetail": "第 {{station}} 站：{{type}}",
        "disclaimer": "推演结果根据已确认的站点总数与三站提示枚举可行路线，仅用于辅助路线判断。"
      }
    }
  },
  utopianTheater: {
    "eyebrow": "诡秘之主 · 乌托邦剧场",
    "siteTitle": "诡秘之主百科",
    "title": "乌托邦剧场",
    "description": "共 {{count}} 条乌托邦剧场记忆碎片，按游戏内标记的分组归类。",
    "dungeonNote": "副本层数：普通 4 层，困难与噩梦各 6 层；具体候选顺序由运行时生成。",
    "homeSummary": "记忆碎片词条",
    "homeDescription": "按分组、品质和关键词快速筛选乌托邦剧场的战斗增益。",
    "quality": "品质",
    "qualityHint": "按游戏内记忆碎片品质筛选",
    "qualityValue": "品质 {{value}}",
    "searchLabel": "搜索记忆碎片",
    "searchPlaceholder": "按名称、效果或标签搜索",
    "resultCount": "显示 {{count}} 条词条",
    "sourceNote": "数据来自本地游戏包体解析",
    "view": "查看方式",
    "viewGrid": "卡片",
    "viewList": "列表",
    "runtimeNote": "局内候选由副本运行时生成",
    "empty": "没有匹配的记忆碎片",
    "loadError": "记忆碎片数据加载失败，请稍后重试。",
    "stats": {
      "total": "词条总数",
      "general": "通用词条",
      "paths": "职业途径"
    },
    "tagLabel": "分组",
    "tagHint": "按游戏内标记的分组筛选",
    "tags": "记忆碎片分组",
    "all": "全部",
    "tagAll": "全部"
  },
  catalogPagination: {
    "label": "目录分页",
    "previous": "上一页",
    "next": "下一页",
    "status": "第 {{page}} / {{total}} 页"
  },
  common: {
    "loading": "加载中…"
  },
}

const zhTW: Strings = {
  ...zhCN,
  siteTitle: '詭祕之主資料庫',
  brand: '藏舟遊戲攻略網',
  brandSlogan: '萬千攻略，藏於一舟',
  brandHome: '藏舟攻略首頁',
  login: '登入',
  more: '更多',
  back: '返回',
  loadError: '資料載入失敗，請稍後再試。',
  loading: '載入中…',
  notFound: '找不到。',
  themeAuto: '跟隨系統',
  themeLight: '淺色模式',
  themeDark: '深色模式',
  themeMenu: '主題',
  languageMenu: '語言',
  nav: {"home": "首頁", "traintrade": "鐵路大亨", "utopia": "烏托邦劇場", "changelog": "更新日誌"},
  siteInfo: {
    tab: '關於',
    aboutTitle: '關於本站',
    arkiveName: '藏舟攻略網',
    gameName: '詭祕之主',
    introTemplate: '本站是由{arkive}搭建與維護的{game}非官方互動資料庫，遊戲資料均從遊戲檔案中擷取，永久免費開放。',
    disclaimerTemplate: '本站與{developer}無隸屬關係，也未獲其授權或背書。{game}及相關遊戲內容的一切權利均歸{developer}所有。',
    versionTitle: '版本更新記錄',
    viewVersionTemplate: '查看版本 {version}',
    recentUpdatesTitle: '近期更新',
    noRecentUpdates: '暫無更新記錄。',
    feedbackTitle: '交流與回饋',
    feedbackHint: '歡迎透過下方回饋 QQ 群提出建議、回報問題或提交錯誤。',
    feedbackGroupLabel: '回饋 QQ 群',
    copy: '複製',
    copied: '已複製',
    close: '關閉',
  },
  home: {
    "tagline": "直接從遊戲檔案擷取的鐵路大亨貨物與烏托邦劇場卡牌資料。",
    "browse": "瀏覽鐵路大亨貨物",
    "dataNote": "資料擷取自遊戲版本 {{version}}。"
  },
  changelog: {
    title: '更新日誌',
    current: '目前版本',
    empty: '暫無紀錄。',
    kind: { feature: '新功能', improvement: '改進', fix: '修復', data: '資料' },
  },
  trainTrade: {
    "eyebrow": "詭秘之主 · 鐵路大亨",
    "title": "鐵路大亨貨物",
    "description": "收錄包體內 {{count}} 條鐵路大亨貨物資料，快速查看貨物屬性與交易價格。",
    "homeSummary": "貨物清單",
    "homeDescription": "按貨物類別、品質和關鍵字查找鐵路大亨的運輸物產。",
    "filters": "貨物篩選",
    "categoryLabel": "類別",
    "categoryHint": "按商品所屬類別篩選",
    "category": {
      "all": "全部",
      "WINE": "酒類",
      "FOOD": "食物",
      "CLOTH": "衣物",
      "ART": "藝術品",
      "CRAFTS": "工藝品"
    },
    "qualityLabel": "品質",
    "qualityHint": "按遊戲內貨物品質篩選",
    "qualityValue": "品質 {{value}}",
    "all": "全部",
    "levelValue": "等級 {{value}}",
    "buyPrice": "基礎買入",
    "buyPriceShort": "買入",
    "sellPrice": "基礎賣出",
    "sellPriceShort": "賣出",
    "leftoverPrice": "餘貨賣出",
    "leftoverPriceShort": "餘貨",
    "buyStations": "可買入站點",
    "sellStations": "可賣出站點",
    "searchLabel": "搜尋鐵路大亨貨物",
    "searchPlaceholder": "按名稱、描述或站點搜尋",
    "resultCount": "顯示 {{count}} 條貨物",
    "view": "檢視方式",
    "viewGrid": "卡片",
    "viewList": "列表",
    "sourceNote": "資料來自遠程遊戲包體解析，圖示與貨物資料獨立更新。",
    "noDescription": "暫無描述",
    "empty": "沒有符合條件的貨物",
    "loadError": "鐵路大亨貨物資料載入失敗，請稍後再試。",
    "stats": {
      "total": "貨物總數",
      "categories": "貨物類別",
      "quality": "最高品質"
    },
    "station": {
      "start": "出發站",
      "wine": "酒莊",
      "food": "食鋪",
      "art": "商行"
    },
    "stationTool": {
      "productTitle": "詭秘之主",
      "eyebrow": "鐵路大亨 · 站點工具",
      "title": "站點推演",
      "description": "選擇車上物產和目前狀態，推演未來站點組合，並按貨物的預計賣出區間排列路線。",
      "controls": "推演參數",
      "goods": "車上物產",
      "currentStation": "目前站點",
      "stops": "推演站數",
      "stopsValue": "未來 {{value}} 站",
      "difficulty": "價格難度",
      "difficultyValue": "難度 {{value}}",
      "ruleLabel": "站點規則",
      "rule": {
        "standard": "標準",
        "chaos": "混沌",
        "free": "自由"
      },
      "ruleDescription": {
        "standard": "相鄰站點不會重複，第一站也不會與目前站點相同。",
        "chaos": "每组三站各出現一次酒莊、食鋪和商行。",
        "free": "不套用站點限制，查看所有可能組合。"
      },
      "resultsEyebrow": "候選路線",
      "resultsTitle": "前 {{count}} 條參考路線",
      "selectedGoods": "目前物產：{{goods}}",
      "route": "路線 {{value}}",
      "estimatedRange": "累計基礎賣出參考區間",
      "priceNote": "價格區間來自鐵路大亨包體的難度表，不包含策略卡、合約和臨時增益。",
      "loadError": "站點推演資料載入失敗，請稍後再試。",
      "planner": {
        "workspaceTitle": "鐵路站點推演",
        "difficultyHeading": "選擇路線難度",
        "difficultyPlaceholder": "點這裡選擇",
        "difficultySummary": "選擇路線後查看該難度的規則摘要。",
        "difficultyProfile": {
          "beginner": {
            "name": "新手路線",
            "description": "從這裡輕鬆啟程，有限的選擇能降低風險。",
            "price": "買入 0.7-1.2 倍 · 賣出 1.0-1.4 倍",
            "stock": "合約庫存加成 10% / 50% / 100% / 150%"
          },
          "normal": {
            "name": "普通路線",
            "description": "更多策略卡在此登場，每次判斷帶來全新結果。",
            "price": "買入 0.7-1.2 倍 · 賣出 0.7-1.4 倍",
            "stock": "合約庫存加成 10% / 50% / 100% / 150%"
          },
          "advanced": {
            "name": "進階路線",
            "description": "需要更多許可證解鎖的高級路線，權衡你的選擇吧。",
            "price": "買入 0.7-1.2 倍 · 賣出 0.7-1.4 倍",
            "stock": "合約庫存加成 10% / 50% / 100% / 150%"
          },
          "hard": {
            "name": "困難路線",
            "description": "在收益與風險並行的路線上，你將如何下注？",
            "price": "買入 0.7-1.4 倍 · 賣出 0.6-1.5 倍",
            "stock": "合約庫存加成 10% / 75% / 150% / 225%"
          },
          "challenge": {
            "name": "挑戰路線",
            "description": "在複雜地圖中追逐最優解，鐵路大亨的試煉場。",
            "price": "買入 0.7-1.4 倍 · 賣出 0.6-1.5 倍",
            "stock": "合約庫存加成 10% / 75% / 150% / 225%"
          }
        },
        "quotaHeading": "總站點配額",
        "quotaValid": "配額有效，可以開始推演。",
        "quotaInvalid": "還需要配置 {{remaining}} 站（目前合計 {{current}}）。",
        "quotaConfirm": "確認總站點配額",
        "quotaConfirmed": "總站點配額已確認",
        "generating": "正在產生可行路線...",
        "forecastStart": "選擇路線並確認總站點配額後開始推演。",
        "undo": "撤銷上一步",
        "stationProgress": "站點進度",
        "previousStations": "查看前一組站點",
        "nextStations": "查看後一組站點",
        "stationRange": "第 {{start}}-{{end}} 站",
        "stationForecasted": "已推演",
        "stationPending": "待確認",
        "stationInfoHeading": "站點資訊",
        "currentStation": "目前站點",
        "startStation": "始發站",
        "futureHint": "未來三站",
        "selectPlaceholder": "請選擇",
        "confirmOrigin": "確認並推演第 1-3 站",
        "hint": {
          "winery-most": "酒莊最多",
          "food-most": "食鋪最多",
          "trade-most": "商行最多",
          "equal": "各站點相同"
        },
        "stepConfirmHeading": "第 {{station}} 站 · 確認",
        "lockedAt": "100% 已鎖定",
        "noRoute": "目前站點與提示組合沒有可行路線，請更換其中一項。",
        "confirmWindow": "確認並推演第 {{start}}-{{end}} 站",
        "complete": "{{count}} 站資訊鏈已完成。",
        "currentDetail": "目前站：{{station}} · {{hint}}",
        "originHintDetail": "始發站提示：{{hint}}",
        "probabilityAt": "第 {{station}} 站機率",
        "highest": "最高",
        "combinationHeading": "第 {{start}}-{{end}} 站組合情況",
        "remainingHeading": "剩餘站點數",
        "stationUnit": "站",
        "historyHeading": "挑戰路線記錄",
        "historyCount": "{{count}} 條",
        "historyEmpty": "暫無已確認提示",
        "historyRange": "第 {{start}}-{{end}} 站",
        "originDetail": "始發站提示",
        "stepDetail": "第 {{station}} 站：{{type}}",
        "disclaimer": "推演結果根據已確認的站點總數與三站提示列舉可行路線，僅用於輔助路線判斷。"
      }
    }
  },
  utopianTheater: {
    "eyebrow": "詭秘之主 · 烏托邦劇場",
    "siteTitle": "詭秘之主百科",
    "title": "烏托邦劇場",
    "description": "共 {{count}} 條烏托邦劇場記憶碎片，依遊戲內標記的分組歸類。",
    "dungeonNote": "副本層數：普通 4 層，困難與噩夢各 6 層；具體候選順序由執行時產生。",
    "homeSummary": "記憶碎片詞條",
    "homeDescription": "按分組、品質和關鍵字快速篩選烏托邦劇場的戰鬥增益。",
    "quality": "品質",
    "qualityHint": "按遊戲內記憶碎片品質篩選",
    "qualityValue": "品質 {{value}}",
    "searchLabel": "搜尋記憶碎片",
    "searchPlaceholder": "按名稱、效果或標籤搜尋",
    "resultCount": "顯示 {{count}} 條詞條",
    "sourceNote": "資料來自本地遊戲包體解析",
    "view": "檢視方式",
    "viewGrid": "卡片",
    "viewList": "列表",
    "runtimeNote": "局內候選由副本執行時產生",
    "empty": "沒有符合條件的記憶碎片",
    "loadError": "記憶碎片資料載入失敗，請稍後再試。",
    "stats": {
      "total": "詞條總數",
      "general": "通用詞條",
      "paths": "職業途徑"
    },
    "tagLabel": "分組",
    "tagHint": "依遊戲內標記的分組篩選",
    "tags": "記憶碎片分組",
    "all": "全部",
    "tagAll": "全部"
  },
  catalogPagination: {
    "label": "目錄分頁",
    "previous": "上一頁",
    "next": "下一頁",
    "status": "第 {{page}} / {{total}} 頁"
  },
  common: {
    "loading": "載入中…"
  },
}

const UI: Partial<Record<Language, Strings>> = { 'en-US': en, 'zh-CN': zhCN, 'zh-TW': zhTW }

const languagePreference = createLanguagePreference(LANGUAGES, 'en-US')

/**
 * The top-bar and sheet language switchers.
 *
 * Writes this site's override and, while nothing has ever chosen a shared
 * language, seeds that too -- so a first-time visitor picking a language here
 * still sees it on the other Arkive sites, while a later change stays local.
 * The settings panel writes the layers explicitly instead.
 */
export function changeLanguagePreference(code: string) {
  languagePreference.setFromSiteControl(code as Language)
  return i18n.changeLanguage(code)
}

/** Switches the displayed language without writing a preference. */
export function applyLanguage(code: string) {
  return i18n.changeLanguage(code)
}

void i18n.use(initReactI18next).init({
  lng: detectLanguagePreference(LANGUAGES, 'en-US'),
  resources: Object.fromEntries(
    LANGUAGES.map((lng) => [lng, { translation: UI[lng] ?? en }]),
  ),
  supportedLngs: [...LANGUAGES],
  fallbackLng: 'en-US',
  interpolation: { escapeValue: false },
})

bindArkiveDocumentLocale(i18n)

export default i18n

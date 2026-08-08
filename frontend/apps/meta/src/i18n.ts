import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'

export const LANGUAGES = ['en-US', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR'] as const
export type Language = (typeof LANGUAGES)[number]

export const LANGUAGE_LABELS: Record<Language, string> = {
  'en-US': 'English',
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
}

const BRAND_NAME = '藏舟游戏攻略网'

const resources = {
  'zh-CN': {
    translation: {
      brand: {
        name: BRAND_NAME,
        slogan: '万千攻略，藏于一舟',
        blurb: '我们整理游戏里的知识、地图和发现，陪你慢慢走完每一个喜欢的世界。',
      },
      nav: {
        allGames: '全部游戏',
        mods: '模组库',
        forum: '论坛',
        favorites: '我的收藏',
      },
      language: '语言',
      theme: { auto: '自动', light: '白天', dark: '黑夜', menu: '切换主题', short: '主题' },
      auth: { login: '登录' },
      hero: {
        eyebrow: '欢迎来到藏舟',
        lead: '今天，从哪片',
        highlight: '游戏世界',
        tail: '启航？',
        description: '查任务、找地图、收好每一次发现。这里不催你通关，只陪你把喜欢的世界看得更完整。',
        recommendation: '人气游戏优先推荐',
      },
      search: { placeholder: '搜索游戏、任务、角色或地点', action: '开始查找' },
      action: {
        openGame: '进入 {{game}}',
        favorite: '收藏 {{game}}',
        browseAll: '浏览全部游戏',
      },
      explore: {
        title: '最近大家都在探索',
        description: '从互动地图到资料图鉴，每个游戏都有属于自己的资料入口。',
      },
      site: {
        aion2: {
          name: 'AION2',
          desc: '互动地图与游戏资料库',
          feature: '从地图出发，找到每一个重要坐标。',
        },
        palworld: {
          name: '幻兽帕鲁',
          desc: '地图、帕鲁图鉴与配种路线',
          feature: '从探索到配种，认识每一只帕鲁。',
        },
      },
      comingSoon: {
        kicker: '下一站正在整理',
        title: '更多游戏正在制作中',
        description: '新的地图与资料库正在陆续入馆。先把这片空位留给下一次启航。',
      },
      cta: {
        title: '把这次发现收进你的舟舱',
        description: '登录后收藏攻略、同步地图进度，并从任意设备继续上次的探索。',
        action: '免费登录 / 注册',
      },
      footer: {
        browse: '浏览',
        about: '关于',
        service: '服务',
        discoverGames: '发现游戏',
        guides: '攻略馆',
        maps: '互动地图',
        database: '资料图鉴',
        aboutArkive: '关于藏舟',
        standards: '内容规范',
        joinUs: '加入我们',
        contact: '联系我们',
        terms: '用户协议',
        privacy: '隐私政策',
        appeal: '侵权申诉',
        help: '帮助中心',
        icp: '渝ICP备2025152827号-1',
        copyright: '© 2026 重庆藏舟传媒有限公司 · Arkive.games',
      },
      notice: {
        title: '正在制作中',
        description: '这片区域还在整理，很快会与你见面。',
      },
    },
  },
  'zh-TW': {
    translation: {
      brand: {
        name: BRAND_NAME,
        slogan: '萬千攻略，藏於一舟',
        blurb: '我們整理遊戲裡的知識、地圖和發現，陪你慢慢走完每一個喜歡的世界。',
      },
      nav: { allGames: '全部遊戲', mods: '模組庫', forum: '論壇', favorites: '我的收藏' },
      language: '語言',
      theme: { auto: '自動', light: '白天', dark: '黑夜', menu: '切換主題', short: '主題' },
      auth: { login: '登入' },
      hero: {
        eyebrow: '歡迎來到藏舟',
        lead: '今天，從哪片',
        highlight: '遊戲世界',
        tail: '啟航？',
        description: '查任務、找地圖、收好每一次發現。這裡不催你通關，只陪你把喜歡的世界看得更完整。',
        recommendation: '人氣遊戲優先推薦',
      },
      search: { placeholder: '搜尋遊戲、任務、角色或地點', action: '開始查找' },
      action: {
        openGame: '進入 {{game}}',
        favorite: '收藏 {{game}}',
        browseAll: '瀏覽全部遊戲',
      },
      explore: {
        title: '最近大家都在探索',
        description: '從互動地圖到資料圖鑑，每個遊戲都有屬於自己的資料入口。',
      },
      site: {
        aion2: { name: 'AION2', desc: '互動地圖與遊戲資料庫', feature: '從地圖出發，找到每一個重要座標。' },
        palworld: { name: '幻獸帕魯', desc: '地圖、帕魯圖鑑與配種路線', feature: '從探索到配種，認識每一隻帕魯。' },
      },
      comingSoon: {
        kicker: '下一站正在整理',
        title: '更多遊戲正在製作中',
        description: '新的地圖與資料庫正在陸續入館。先把這片空位留給下一次啟航。',
      },
      cta: {
        title: '把這次發現收進你的舟艙',
        description: '登入後收藏攻略、同步地圖進度，並從任意裝置繼續上次的探索。',
        action: '免費登入 / 註冊',
      },
      footer: {
        browse: '瀏覽', about: '關於', service: '服務', discoverGames: '發現遊戲', guides: '攻略館', maps: '互動地圖', database: '資料圖鑑',
        aboutArkive: '關於藏舟', standards: '內容規範', joinUs: '加入我們', contact: '聯絡我們', terms: '使用者協議', privacy: '隱私政策', appeal: '侵權申訴', help: '幫助中心',
        icp: '渝ICP備2025152827號-1',
        copyright: '© 2026 重慶藏舟傳媒有限公司 · Arkive.games',
      },
      notice: { title: '正在製作中', description: '這片區域還在整理，很快會與你見面。' },
    },
  },
  'en-US': {
    translation: {
      brand: {
        name: BRAND_NAME,
        slogan: 'Sail Games With Us.',
        blurb: 'We gather game knowledge, maps, and discoveries so you can enjoy every world at your own pace.',
      },
      nav: { allGames: 'All games', mods: 'Mod library', forum: 'Forum', favorites: 'Favorites' },
      language: 'Language',
      theme: { auto: 'Auto', light: 'Light', dark: 'Dark', menu: 'Switch theme', short: 'Theme' },
      auth: { login: 'Log in' },
      hero: {
        eyebrow: 'Welcome to Arkive',
        lead: 'Today, which',
        highlight: 'game world',
        tail: 'will you sail into?',
        description: 'Find quests, maps, and every discovery worth keeping. Explore the worlds you love at your own pace.',
        recommendation: 'Popular game recommendation',
      },
      search: { placeholder: 'Search games, quests, characters, or places', action: 'Search' },
      action: { openGame: 'Enter {{game}}', favorite: 'Save {{game}}', browseAll: 'Browse all games' },
      explore: {
        title: 'What everyone is exploring',
        description: 'From interactive maps to connected databases, each game has its own place in the archive.',
      },
      site: {
        aion2: { name: 'AION2', desc: 'Interactive map and game database', feature: 'Start with the map and find every important coordinate.' },
        palworld: { name: 'Palworld', desc: 'Map, Paldeck, and breeding routes', feature: 'Explore, breed, and get to know every Pal.' },
      },
      comingSoon: {
        kicker: 'The next stop is being catalogued',
        title: 'More games are on the way',
        description: 'New maps and databases are joining the archive. This space is saved for your next voyage.',
      },
      cta: {
        title: 'Keep this discovery in your cabin',
        description: 'Log in to save guides, sync map progress, and continue your journey on any device.',
        action: 'Log in / Sign up',
      },
      footer: {
        browse: 'Browse', about: 'About', service: 'Services', discoverGames: 'Discover games', guides: 'Guide archive', maps: 'Interactive maps', database: 'Database',
        aboutArkive: 'About Arkive', standards: 'Content standards', joinUs: 'Join us', contact: 'Contact', terms: 'Terms', privacy: 'Privacy', appeal: 'IP appeal', help: 'Help center',
        icp: 'Yu ICP 2025152827-1',
        copyright: '© 2026 Chongqing Cangzhou Media Co., Ltd. · Arkive.games',
      },
      notice: { title: 'Work in progress', description: 'This part of the archive is still being prepared. See you there soon.' },
    },
  },
  'ja-JP': {
    translation: {
      brand: { name: BRAND_NAME, slogan: '万千の攻略を、一艘の舟に。', blurb: 'ゲームの知識、マップ、発見を整理し、好きな世界を自分のペースで旅できる資料館です。' },
      nav: { allGames: 'すべてのゲーム', mods: 'MODライブラリ', forum: 'フォーラム', favorites: 'お気に入り' },
      language: '言語',
      theme: { auto: '自動', light: 'ライト', dark: 'ダーク', menu: 'テーマを切り替える', short: 'テーマ' },
      auth: { login: 'ログイン' },
      hero: { eyebrow: '藏舟へようこそ', lead: '今日は、どの', highlight: 'ゲーム世界', tail: 'へ出航しますか？', description: 'クエストやマップを調べ、発見を大切に保存。好きな世界を自分のペースで楽しめます。', recommendation: '人気ゲームを優先表示' },
      search: { placeholder: 'ゲーム、クエスト、キャラクター、場所を検索', action: '検索する' },
      action: { openGame: '{{game}}へ', favorite: '{{game}}を保存', browseAll: 'すべてのゲームを見る' },
      explore: { title: 'みんなが探索している世界', description: 'インタラクティブマップから資料図鑑まで、ゲームごとの入口を用意しています。' },
      site: {
        aion2: { name: 'AION2', desc: 'インタラクティブマップとゲームデータベース', feature: 'マップから始めて、大切な座標を見つけましょう。' },
        palworld: { name: 'Palworld', desc: 'マップ、パル図鑑、配合ルート', feature: '探索と配合を通して、すべてのパルを知りましょう。' },
      },
      comingSoon: { kicker: '次の寄港地を整理中', title: 'さらに多くのゲームを制作中', description: '新しいマップとデータベースを順次追加しています。次の航海をお楽しみに。' },
      cta: { title: 'この発見を舟の中へ', description: 'ログインすると攻略の保存、マップ進捗の同期、別の端末からの再開ができます。', action: 'ログイン / 登録' },
      footer: {
        browse: '見る', about: '藏舟について', service: 'サービス', discoverGames: 'ゲームを探す', guides: '攻略館', maps: 'インタラクティブマップ', database: '資料図鑑',
        aboutArkive: '藏舟について', standards: 'コンテンツ基準', joinUs: '参加する', contact: 'お問い合わせ', terms: '利用規約', privacy: 'プライバシー', appeal: '権利侵害申立て', help: 'ヘルプ',
        icp: '渝ICP备2025152827号-1',
        copyright: '© 2026 Chongqing Cangzhou Media Co., Ltd. · Arkive.games',
      },
      notice: { title: '制作中です', description: 'このエリアは現在準備中です。もうしばらくお待ちください。' },
    },
  },
  'ko-KR': {
    translation: {
      brand: { name: BRAND_NAME, slogan: '수많은 공략을 한 척의 배에.', blurb: '게임 속 지식과 지도, 발견을 모아 좋아하는 세계를 천천히 여행할 수 있도록 돕습니다.' },
      nav: { allGames: '전체 게임', mods: '모드 보관함', forum: '포럼', favorites: '내 즐겨찾기' },
      language: '언어',
      theme: { auto: '자동', light: '라이트', dark: '다크', menu: '테마 전환', short: '테마' },
      auth: { login: '로그인' },
      hero: { eyebrow: '장저우에 오신 것을 환영합니다', lead: '오늘은 어느', highlight: '게임 세계', tail: '로 떠날까요?', description: '퀘스트와 지도를 찾고 모든 발견을 간직하세요. 좋아하는 세계를 자신의 속도로 탐험할 수 있습니다.', recommendation: '인기 게임 우선 추천' },
      search: { placeholder: '게임, 퀘스트, 캐릭터 또는 장소 검색', action: '검색' },
      action: { openGame: '{{game}} 열기', favorite: '{{game}} 저장', browseAll: '전체 게임 보기' },
      explore: { title: '모두가 탐험 중인 세계', description: '인터랙티브 지도부터 게임 데이터베이스까지, 게임마다 전용 입구가 있습니다.' },
      site: {
        aion2: { name: 'AION2', desc: '인터랙티브 지도와 게임 데이터베이스', feature: '지도에서 시작해 중요한 좌표를 모두 찾아보세요.' },
        palworld: { name: 'Palworld', desc: '지도, 팰 도감, 교배 경로', feature: '탐험과 교배를 통해 모든 팰을 알아보세요.' },
      },
      comingSoon: { kicker: '다음 기착지를 정리 중', title: '더 많은 게임을 제작하고 있어요', description: '새로운 지도와 데이터베이스가 차례로 들어옵니다. 다음 항해를 기대해 주세요.' },
      cta: { title: '이번 발견을 배 안에 보관하세요', description: '로그인하면 공략을 저장하고 지도 진행 상황을 동기화해 어느 기기에서든 이어갈 수 있습니다.', action: '로그인 / 가입' },
      footer: {
        browse: '둘러보기', about: '소개', service: '서비스', discoverGames: '게임 찾기', guides: '공략관', maps: '인터랙티브 지도', database: '자료 도감',
        aboutArkive: '장저우 소개', standards: '콘텐츠 기준', joinUs: '함께하기', contact: '문의하기', terms: '이용약관', privacy: '개인정보 처리방침', appeal: '권리 침해 신고', help: '도움말',
        icp: '渝ICP备2025152827号-1',
        copyright: '© 2026 Chongqing Cangzhou Media Co., Ltd. · Arkive.games',
      },
      notice: { title: '제작 중입니다', description: '이 공간은 아직 정리 중입니다. 곧 만나보실 수 있어요.' },
    },
  },
} as const

i18n.use(LanguageDetector).use(initReactI18next).init({
  resources,
  supportedLngs: [...LANGUAGES],
  fallbackLng: 'zh-CN',
  interpolation: { escapeValue: false },
})

export default i18n

import type { Language } from './i18n'

// Fishing-page strings, merged into the `translation` namespace under a
// `fishing` key (see i18n.ts). Bait/area/pal names come from the locale data
// files — this table only holds the page's own UI chrome. Game-derived terms
// (Fishing, fish shadow, bait) follow the game's own text tables
// (COMMON_WORK_TYPE_FishPond / FISHPOND_WORK_FISHSIZE_* / FISHING_SELECTBAIT_*).
export interface FishingStrings {
  title: string
  caption: string
  baits: string
  bait: string
  /** Bait attraction multiplier column. */
  attract: string
  /** Minigame hit-bar size multiplier column. */
  hitBar: string
  /** Fish fight-back penalty on a missed hit. */
  missFight: string
  /** Pal / item drop-rate bonus column. */
  dropBonus: string
  /** Region filter: the "all regions" chip. */
  all: string
  /** Count suffix after a number: "5 spot pools". */
  spots: string
  viewRegion: string
  /** Spot minigame difficulty (EPal FishingSpotDifficulty enum values). */
  tier: {
    Easy: string
    Normal: string
    Hard: string
  }
  /** Alpha (boss) catch badge / alpha-variant odds prefix. */
  alpha: string
  /** Fish-shadow size prefix ("Shadow M"). */
  shadow: string
  /** Rare-variant odds prefix. */
  rare: string
  /** King-size-variant odds prefix. */
  king: string
}

export const FISHING_STRINGS: Record<Language, FishingStrings> = {
  'en-US': {
    title: 'Fishing',
    caption:
      'Every fishing-spot pool by region: the fish each shadow resolves to, its draw share, catch-level band, night-only catches and special-variant odds — plus what each bait changes.',
    baits: 'Baits',
    bait: 'Bait',
    attract: 'Attraction',
    hitBar: 'Hit bar',
    missFight: 'Miss penalty',
    dropBonus: 'Drop bonus',
    all: 'All regions',
    spots: 'spot pools',
    viewRegion: 'Region page',
    tier: { Easy: 'Easy', Normal: 'Normal', Hard: 'Hard' },
    alpha: 'Alpha',
    shadow: 'Shadow',
    rare: 'Rare',
    king: 'King',
  },
  'de-DE': {
    title: 'Angeln',
    caption:
      'Alle Angelplatz-Pools nach Region: welcher Fisch sich hinter jeder Silhouette verbirgt, sein Anteil an der Ziehung, das Fangstufen-Band, Nachtfänge und die Chancen auf Sondervarianten – plus die Wirkung der einzelnen Köder.',
    baits: 'Köder',
    bait: 'Köder',
    attract: 'Anlockung',
    hitBar: 'Trefferleiste',
    missFight: 'Fehlschlag-Malus',
    dropBonus: 'Beute-Bonus',
    all: 'Alle Regionen',
    spots: 'Angelplatz-Pools',
    viewRegion: 'Regionsseite',
    tier: { Easy: 'Leicht', Normal: 'Normal', Hard: 'Schwer' },
    alpha: 'Alpha',
    shadow: 'Silhouette',
    rare: 'Selten',
    king: 'König',
  },
  'es-ES': {
    title: 'Pesca',
    caption:
      'Todos los grupos de puntos de pesca por región: el pez al que corresponde cada sombra, su probabilidad en el sorteo, el rango de nivel de captura, las capturas nocturnas y las probabilidades de variantes especiales, además de lo que cambia cada cebo.',
    baits: 'Cebos',
    bait: 'Cebo',
    attract: 'Atracción',
    hitBar: 'Barra de acierto',
    missFight: 'Penalización por fallo',
    dropBonus: 'Bonus de botín',
    all: 'Todas las regiones',
    spots: 'grupos de puntos de pesca',
    viewRegion: 'Página de la región',
    tier: { Easy: 'Fácil', Normal: 'Normal', Hard: 'Difícil' },
    alpha: 'Alfa',
    shadow: 'Sombra',
    rare: 'Raro',
    king: 'Rey',
  },
  'es-MX': {
    title: 'Pesca',
    caption:
      'Todos los grupos de puntos de pesca por región: el pez al que corresponde cada sombra, su probabilidad en el sorteo, el rango de nivel de captura, las capturas nocturnas y las probabilidades de variantes especiales, además de lo que cambia cada cebo.',
    baits: 'Cebos',
    bait: 'Cebo',
    attract: 'Atracción',
    hitBar: 'Barra de acierto',
    missFight: 'Penalización por fallo',
    dropBonus: 'Bonus de botín',
    all: 'Todas las regiones',
    spots: 'grupos de puntos de pesca',
    viewRegion: 'Página de la región',
    tier: { Easy: 'Fácil', Normal: 'Normal', Hard: 'Difícil' },
    alpha: 'Alfa',
    shadow: 'Sombra',
    rare: 'Raro',
    king: 'Rey',
  },
  'fr-FR': {
    title: 'Pêche',
    caption:
      'Tous les pools de spots de pêche par région : le poisson derrière chaque ombre, sa part de tirage, la plage de niveaux de capture, les prises nocturnes et les chances de variantes spéciales — plus l’effet de chaque appât.',
    baits: 'Appâts',
    bait: 'Appât',
    attract: 'Attraction',
    hitBar: 'Barre de capture',
    missFight: 'Pénalité d’échec',
    dropBonus: 'Bonus de butin',
    all: 'Toutes les régions',
    spots: 'pools de spots de pêche',
    viewRegion: 'Page de la région',
    tier: { Easy: 'Facile', Normal: 'Normal', Hard: 'Difficile' },
    alpha: 'Alpha',
    shadow: 'Ombre',
    rare: 'Rare',
    king: 'Roi',
  },
  'id-ID': {
    title: 'Memancing',
    caption:
      'Semua kumpulan titik pancing per wilayah: ikan di balik setiap bayangan, peluang undiannya, rentang level tangkapan, tangkapan khusus malam, dan peluang varian spesial — plus efek tiap umpan.',
    baits: 'Umpan',
    bait: 'Umpan',
    attract: 'Daya tarik',
    hitBar: 'Bilah tangkapan',
    missFight: 'Penalti meleset',
    dropBonus: 'Bonus jarahan',
    all: 'Semua wilayah',
    spots: 'kumpulan titik pancing',
    viewRegion: 'Halaman wilayah',
    tier: { Easy: 'Mudah', Normal: 'Normal', Hard: 'Sulit' },
    alpha: 'Alfa',
    shadow: 'Bayangan',
    rare: 'Langka',
    king: 'Raja',
  },
  'it-IT': {
    title: 'Pesca',
    caption:
      'Tutti i pool di punti di pesca per regione: il pesce dietro ogni sagoma, la sua probabilità di estrazione, la fascia di livello di cattura, le catture notturne e le probabilità delle varianti speciali — più l’effetto di ogni esca.',
    baits: 'Esche',
    bait: 'Esca',
    attract: 'Attrazione',
    hitBar: 'Barra di cattura',
    missFight: 'Penalità per errore',
    dropBonus: 'Bonus bottino',
    all: 'Tutte le regioni',
    spots: 'pool di punti di pesca',
    viewRegion: 'Pagina della regione',
    tier: { Easy: 'Facile', Normal: 'Normale', Hard: 'Difficile' },
    alpha: 'Alfa',
    shadow: 'Sagoma',
    rare: 'Raro',
    king: 'Re',
  },
  'ja-JP': {
    title: '釣り',
    caption:
      '地域ごとの釣り場プール一覧：各魚影に対応する魚、抽選の割合、捕獲レベル帯、夜限定の獲物、特殊個体の確率、そして各エサの効果。',
    baits: 'エサ',
    bait: 'エサ',
    attract: '誘引力',
    hitBar: 'ヒットバー',
    missFight: 'ミス時ペナルティ',
    dropBonus: 'ドロップボーナス',
    all: 'すべての地域',
    spots: '件の釣り場プール',
    viewRegion: '地域ページ',
    tier: { Easy: '初級', Normal: '中級', Hard: '上級' },
    alpha: 'ボス',
    shadow: '魚影',
    rare: 'レア',
    king: 'キング',
  },
  'ko-KR': {
    title: '낚시',
    caption:
      '지역별 낚시터 풀 목록: 각 그림자에 해당하는 물고기, 추첨 비율, 포획 레벨 범위, 밤 한정 어획물, 특수 개체 확률, 그리고 각 미끼의 효과.',
    baits: '미끼',
    bait: '미끼',
    attract: '유인력',
    hitBar: '히트 바',
    missFight: '실패 페널티',
    dropBonus: '드롭 보너스',
    all: '모든 지역',
    spots: '개 낚시터 풀',
    viewRegion: '지역 페이지',
    tier: { Easy: '초급', Normal: '중급', Hard: '고급' },
    alpha: '보스',
    shadow: '그림자',
    rare: '희귀',
    king: '킹',
  },
  'pl-PL': {
    title: 'Wędkowanie',
    caption:
      'Wszystkie pule łowisk według regionu: ryba kryjąca się za każdą sylwetką, jej udział w losowaniu, przedział poziomów połowu, połowy nocne i szanse na warianty specjalne — plus działanie każdej przynęty.',
    baits: 'Przynęty',
    bait: 'Przynęta',
    attract: 'Wabienie',
    hitBar: 'Pasek trafienia',
    missFight: 'Kara za pudło',
    dropBonus: 'Premia do łupu',
    all: 'Wszystkie regiony',
    spots: 'pul łowisk',
    viewRegion: 'Strona regionu',
    tier: { Easy: 'Łatwe', Normal: 'Normalne', Hard: 'Trudne' },
    alpha: 'Alfa',
    shadow: 'Sylwetka',
    rare: 'Rzadki',
    king: 'Król',
  },
  'pt-BR': {
    title: 'Pesca',
    caption:
      'Todos os grupos de pontos de pesca por região: o peixe por trás de cada silhueta, sua chance no sorteio, a faixa de nível de captura, as capturas noturnas e as chances de variantes especiais — além do efeito de cada isca.',
    baits: 'Iscas',
    bait: 'Isca',
    attract: 'Atração',
    hitBar: 'Barra de acerto',
    missFight: 'Penalidade por erro',
    dropBonus: 'Bônus de itens',
    all: 'Todas as regiões',
    spots: 'grupos de pontos de pesca',
    viewRegion: 'Página da região',
    tier: { Easy: 'Fácil', Normal: 'Normal', Hard: 'Difícil' },
    alpha: 'Alfa',
    shadow: 'Silhueta',
    rare: 'Raro',
    king: 'Rei',
  },
  'ru-RU': {
    title: 'Рыбалка',
    caption:
      'Все пулы рыбных мест по регионам: какая рыба скрывается за каждым силуэтом, её доля в розыгрыше, диапазон уровней улова, ночные уловы и шансы особых вариантов — плюс эффект каждой наживки.',
    baits: 'Наживки',
    bait: 'Наживка',
    attract: 'Приманивание',
    hitBar: 'Полоса подсечки',
    missFight: 'Штраф за промах',
    dropBonus: 'Бонус добычи',
    all: 'Все регионы',
    spots: 'пулов рыбных мест',
    viewRegion: 'Страница региона',
    tier: { Easy: 'Лёгкое', Normal: 'Обычное', Hard: 'Сложное' },
    alpha: 'Альфа',
    shadow: 'Силуэт',
    rare: 'Редкий',
    king: 'Король',
  },
  'th-TH': {
    title: 'ตกปลา',
    caption:
      'กลุ่มจุดตกปลาทั้งหมดแยกตามภูมิภาค: ปลาที่ซ่อนอยู่ในแต่ละเงา สัดส่วนการสุ่ม ช่วงเลเวลที่จับได้ การจับเฉพาะกลางคืน และโอกาสของร่างพิเศษ — พร้อมผลของเหยื่อแต่ละชนิด',
    baits: 'เหยื่อตกปลา',
    bait: 'เหยื่อ',
    attract: 'การดึงดูด',
    hitBar: 'แถบจับ',
    missFight: 'บทลงโทษเมื่อพลาด',
    dropBonus: 'โบนัสดรอป',
    all: 'ทุกภูมิภาค',
    spots: 'กลุ่มจุดตกปลา',
    viewRegion: 'หน้าภูมิภาค',
    tier: { Easy: 'ง่าย', Normal: 'ปกติ', Hard: 'ยาก' },
    alpha: 'บอส',
    shadow: 'เงาปลา',
    rare: 'หายาก',
    king: 'คิง',
  },
  'tr-TR': {
    title: 'Balık tutma',
    caption:
      'Bölgelere göre tüm balık noktası havuzları: her yansımanın ardındaki balık, çekiliş payı, yakalama seviyesi aralığı, geceye özel avlar ve özel varyant şansları — artı her yemin etkisi.',
    baits: 'Yemler',
    bait: 'Yem',
    attract: 'Cezbetme',
    hitBar: 'İsabet çubuğu',
    missFight: 'Iskalama cezası',
    dropBonus: 'Ganimet bonusu',
    all: 'Tüm bölgeler',
    spots: 'balık noktası havuzu',
    viewRegion: 'Bölge sayfası',
    tier: { Easy: 'Kolay', Normal: 'Normal', Hard: 'Zor' },
    alpha: 'Alfa',
    shadow: 'Yansıma',
    rare: 'Nadir',
    king: 'Kral',
  },
  'vi-VN': {
    title: 'Câu cá',
    caption:
      'Mọi nhóm điểm câu theo khu vực: con cá ứng với từng bóng, tỷ lệ quay, khoảng cấp bắt, cá chỉ xuất hiện ban đêm và tỷ lệ biến thể đặc biệt — cùng tác dụng của từng loại mồi.',
    baits: 'Mồi câu',
    bait: 'Mồi',
    attract: 'Thu hút',
    hitBar: 'Thanh bắt',
    missFight: 'Phạt khi trượt',
    dropBonus: 'Thưởng vật phẩm rơi',
    all: 'Mọi khu vực',
    spots: 'nhóm điểm câu',
    viewRegion: 'Trang khu vực',
    tier: { Easy: 'Dễ', Normal: 'Thường', Hard: 'Khó' },
    alpha: 'Alpha',
    shadow: 'Bóng cá',
    rare: 'Hiếm',
    king: 'Vua',
  },
  'zh-CN': {
    title: '垂钓',
    caption:
      '按区域列出所有钓点池：每个鱼影对应的鱼、抽取概率、捕获等级区间、夜间限定渔获与特殊个体概率，以及每种钓饵的效果。',
    baits: '钓饵',
    bait: '钓饵',
    attract: '吸引力',
    hitBar: '命中条',
    missFight: '失误惩罚',
    dropBonus: '掉落加成',
    all: '全部区域',
    spots: '个钓点池',
    viewRegion: '区域页面',
    tier: { Easy: '初级', Normal: '中级', Hard: '高级' },
    alpha: '头目',
    shadow: '鱼影',
    rare: '稀有',
    king: '王',
  },
  'zh-TW': {
    title: '釣魚',
    caption:
      '按區域列出所有釣點池：每個魚影對應的魚、抽取機率、捕獲等級區間、夜間限定漁獲與特殊個體機率，以及每種釣餌的效果。',
    baits: '釣餌',
    bait: '釣餌',
    attract: '吸引力',
    hitBar: '命中條',
    missFight: '失誤懲罰',
    dropBonus: '掉落加成',
    all: '全部區域',
    spots: '個釣點池',
    viewRegion: '區域頁面',
    tier: { Easy: '初級', Normal: '中級', Hard: '高級' },
    alpha: '頭目',
    shadow: '魚影',
    rare: '稀有',
    king: '王',
  },
}

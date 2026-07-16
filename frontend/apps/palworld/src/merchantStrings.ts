import type { Language } from './i18n'

// Merchant catalog UI chrome, merged into the `translation` namespace under the
// `merchant` key (see i18n.ts). Merchant display names are keyed by the
// vendor-type slug (`nameKey`) emitted in merchants.json — the vendor NPCs are
// generically named in-game, so these curated labels read better; the raw
// shop-group id (shown mono in the UI) disambiguates same-typed merchants.
export interface MerchantStrings {
  /** Page title / nav entry. */
  title: string
  /** Result count: "{{count}} merchants". */
  count: string
  searchPlaceholder: string
  /** Sidebar label for the merchant's currency. */
  currency: string
  /** Inventory section heading. */
  forSale: string
  /** Detail-page back link. */
  backToList: string
  /** Detail-page not-found note. */
  notFound: string
  /** Vendor-type display names (nameKey from merchants.json). */
  name: {
    general: string
    weapon: string
    caravan: string
    dungeon: string
    medal: string
    bounty: string
    arena: string
    vagrant: string
  }
}

export const MERCHANT_STRINGS: Record<Language, MerchantStrings> = {
  'en-US': {
    title: 'Merchants',
    count: '{{count}} merchants',
    searchPlaceholder: 'Search merchants…',
    currency: 'Currency',
    forSale: 'For sale',
    backToList: 'Back to merchants',
    notFound: 'Merchant “{{id}}” not found',
    name: {
      general: 'Merchant', weapon: 'Weapons Merchant', caravan: 'Wandering Caravan',
      dungeon: 'Dungeon Merchant', medal: 'Medal Merchant', bounty: 'Bounty Merchant',
      arena: 'Arena Shop', vagrant: 'Wandering Trader',
    },
  },
  'de-DE': {
    title: 'Händler',
    count: '{{count}} Händler',
    searchPlaceholder: 'Händler suchen…',
    currency: 'Währung',
    forSale: 'Im Angebot',
    backToList: 'Zurück zu den Händlern',
    notFound: 'Händler „{{id}}“ nicht gefunden',
    name: {
      general: 'Händler', weapon: 'Waffenhändler', caravan: 'Wanderkarawane',
      dungeon: 'Dungeon-Händler', medal: 'Medaillenhändler', bounty: 'Kopfgeld-Händler',
      arena: 'Arena-Shop', vagrant: 'Wanderhändler',
    },
  },
  'es-ES': {
    title: 'Mercaderes',
    count: '{{count}} mercaderes',
    searchPlaceholder: 'Buscar mercaderes…',
    currency: 'Moneda',
    forSale: 'En venta',
    backToList: 'Volver a los mercaderes',
    notFound: 'Mercader «{{id}}» no encontrado',
    name: {
      general: 'Mercader', weapon: 'Mercader de armas', caravan: 'Caravana errante',
      dungeon: 'Mercader de mazmorra', medal: 'Mercader de medallas', bounty: 'Mercader de recompensas',
      arena: 'Tienda de la arena', vagrant: 'Comerciante errante',
    },
  },
  'es-MX': {
    title: 'Mercaderes',
    count: '{{count}} mercaderes',
    searchPlaceholder: 'Buscar mercaderes…',
    currency: 'Moneda',
    forSale: 'En venta',
    backToList: 'Volver a los mercaderes',
    notFound: 'Mercader «{{id}}» no encontrado',
    name: {
      general: 'Mercader', weapon: 'Mercader de armas', caravan: 'Caravana errante',
      dungeon: 'Mercader de mazmorra', medal: 'Mercader de medallas', bounty: 'Mercader de recompensas',
      arena: 'Tienda de la arena', vagrant: 'Comerciante errante',
    },
  },
  'fr-FR': {
    title: 'Marchands',
    count: '{{count}} marchands',
    searchPlaceholder: 'Rechercher des marchands…',
    currency: 'Monnaie',
    forSale: 'En vente',
    backToList: 'Retour aux marchands',
    notFound: 'Marchand « {{id}} » introuvable',
    name: {
      general: 'Marchand', weapon: "Marchand d'armes", caravan: 'Caravane itinérante',
      dungeon: 'Marchand de donjon', medal: 'Marchand de médailles', bounty: 'Marchand de primes',
      arena: "Boutique de l'arène", vagrant: 'Marchand ambulant',
    },
  },
  'id-ID': {
    title: 'Pedagang',
    count: '{{count}} pedagang',
    searchPlaceholder: 'Cari pedagang…',
    currency: 'Mata uang',
    forSale: 'Dijual',
    backToList: 'Kembali ke pedagang',
    notFound: 'Pedagang “{{id}}” tidak ditemukan',
    name: {
      general: 'Pedagang', weapon: 'Pedagang senjata', caravan: 'Karavan pengembara',
      dungeon: 'Pedagang dungeon', medal: 'Pedagang medali', bounty: 'Pedagang buronan',
      arena: 'Toko arena', vagrant: 'Saudagar keliling',
    },
  },
  'it-IT': {
    title: 'Mercanti',
    count: '{{count}} mercanti',
    searchPlaceholder: 'Cerca mercanti…',
    currency: 'Valuta',
    forSale: 'In vendita',
    backToList: 'Torna ai mercanti',
    notFound: 'Mercante «{{id}}» non trovato',
    name: {
      general: 'Mercante', weapon: 'Armaiolo', caravan: 'Carovana errante',
      dungeon: 'Mercante del dungeon', medal: 'Mercante di medaglie', bounty: 'Mercante delle taglie',
      arena: "Negozio dell'arena", vagrant: 'Mercante ambulante',
    },
  },
  'ja-JP': {
    title: '商人',
    count: '商人 {{count}} 人',
    searchPlaceholder: '商人を検索…',
    currency: '通貨',
    forSale: '販売品',
    backToList: '商人一覧に戻る',
    notFound: '商人「{{id}}」が見つかりません',
    name: {
      general: '商人', weapon: '武器商人', caravan: '行商キャラバン',
      dungeon: 'ダンジョン商人', medal: 'メダル商人', bounty: '賞金首商人',
      arena: 'アリーナショップ', vagrant: '放浪の行商人',
    },
  },
  'ko-KR': {
    title: '상인',
    count: '상인 {{count}}명',
    searchPlaceholder: '상인 검색…',
    currency: '화폐',
    forSale: '판매 품목',
    backToList: '상인 목록으로',
    notFound: '상인 “{{id}}”을(를) 찾을 수 없습니다',
    name: {
      general: '상인', weapon: '무기 상인', caravan: '유랑 상단',
      dungeon: '던전 상인', medal: '메달 상인', bounty: '현상금 상인',
      arena: '아레나 상점', vagrant: '떠돌이 상인',
    },
  },
  'pl-PL': {
    title: 'Handlarze',
    count: '{{count}} handlarzy',
    searchPlaceholder: 'Szukaj handlarzy…',
    currency: 'Waluta',
    forSale: 'Na sprzedaż',
    backToList: 'Powrót do handlarzy',
    notFound: 'Nie znaleziono handlarza „{{id}}”',
    name: {
      general: 'Handlarz', weapon: 'Handlarz bronią', caravan: 'Wędrowna karawana',
      dungeon: 'Handlarz z lochu', medal: 'Handlarz medalami', bounty: 'Handlarz nagród',
      arena: 'Sklep areny', vagrant: 'Wędrowny kupiec',
    },
  },
  'pt-BR': {
    title: 'Mercadores',
    count: '{{count}} mercadores',
    searchPlaceholder: 'Buscar mercadores…',
    currency: 'Moeda',
    forSale: 'À venda',
    backToList: 'Voltar aos mercadores',
    notFound: 'Mercador “{{id}}” não encontrado',
    name: {
      general: 'Mercador', weapon: 'Mercador de armas', caravan: 'Caravana errante',
      dungeon: 'Mercador de masmorra', medal: 'Mercador de medalhas', bounty: 'Mercador de recompensas',
      arena: 'Loja da arena', vagrant: 'Comerciante errante',
    },
  },
  'ru-RU': {
    title: 'Торговцы',
    count: 'Торговцев: {{count}}',
    searchPlaceholder: 'Поиск торговцев…',
    currency: 'Валюта',
    forSale: 'В продаже',
    backToList: 'Назад к торговцам',
    notFound: 'Торговец «{{id}}» не найден',
    name: {
      general: 'Торговец', weapon: 'Торговец оружием', caravan: 'Странствующий караван',
      dungeon: 'Торговец подземелья', medal: 'Торговец медалями', bounty: 'Торговец наградами',
      arena: 'Магазин арены', vagrant: 'Бродячий торговец',
    },
  },
  'th-TH': {
    title: 'พ่อค้า',
    count: 'พ่อค้า {{count}} คน',
    searchPlaceholder: 'ค้นหาพ่อค้า…',
    currency: 'สกุลเงิน',
    forSale: 'สินค้าจำหน่าย',
    backToList: 'กลับไปหน้าพ่อค้า',
    notFound: 'ไม่พบพ่อค้า “{{id}}”',
    name: {
      general: 'พ่อค้า', weapon: 'พ่อค้าอาวุธ', caravan: 'กองคาราวานเร่ร่อน',
      dungeon: 'พ่อค้าดันเจียน', medal: 'พ่อค้าเหรียญ', bounty: 'พ่อค้าค่าหัว',
      arena: 'ร้านค้าอารีนา', vagrant: 'พ่อค้าเร่',
    },
  },
  'tr-TR': {
    title: 'Tüccarlar',
    count: '{{count}} tüccar',
    searchPlaceholder: 'Tüccar ara…',
    currency: 'Para birimi',
    forSale: 'Satışta',
    backToList: 'Tüccarlara dön',
    notFound: '“{{id}}” tüccarı bulunamadı',
    name: {
      general: 'Tüccar', weapon: 'Silah tüccarı', caravan: 'Gezgin kervan',
      dungeon: 'Zindan tüccarı', medal: 'Madalya tüccarı', bounty: 'Ödül tüccarı',
      arena: 'Arena dükkânı', vagrant: 'Gezgin satıcı',
    },
  },
  'vi-VN': {
    title: 'Thương nhân',
    count: '{{count}} thương nhân',
    searchPlaceholder: 'Tìm thương nhân…',
    currency: 'Tiền tệ',
    forSale: 'Đang bán',
    backToList: 'Quay lại danh sách thương nhân',
    notFound: 'Không tìm thấy thương nhân “{{id}}”',
    name: {
      general: 'Thương nhân', weapon: 'Người bán vũ khí', caravan: 'Đoàn lữ hành',
      dungeon: 'Thương nhân hầm ngục', medal: 'Thương nhân huy chương', bounty: 'Thương nhân tiền thưởng',
      arena: 'Cửa hàng đấu trường', vagrant: 'Thương nhân lang thang',
    },
  },
  'zh-CN': {
    title: '商人',
    count: '{{count}} 位商人',
    searchPlaceholder: '搜索商人…',
    currency: '货币',
    forSale: '出售物品',
    backToList: '返回商人列表',
    notFound: '未找到商人“{{id}}”',
    name: {
      general: '商人', weapon: '武器商人', caravan: '流浪商队',
      dungeon: '地牢商人', medal: '奖章商人', bounty: '悬赏商人',
      arena: '竞技场商店', vagrant: '流浪商人',
    },
  },
  'zh-TW': {
    title: '商人',
    count: '{{count}} 位商人',
    searchPlaceholder: '搜尋商人…',
    currency: '貨幣',
    forSale: '販售物品',
    backToList: '返回商人列表',
    notFound: '找不到商人「{{id}}」',
    name: {
      general: '商人', weapon: '武器商人', caravan: '流浪商隊',
      dungeon: '地城商人', medal: '獎章商人', bounty: '懸賞商人',
      arena: '競技場商店', vagrant: '流浪商人',
    },
  },
}

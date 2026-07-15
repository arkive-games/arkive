import type { Language } from './i18n'

// Blueprint (schematic) acquisition UI chrome, merged into the `translation`
// namespace under the `bp` key (see i18n.ts). Item / pal / island names come
// from the locale data files (labels.json carries the game-localized island
// and oil-rig names); this table only holds the page's own labels — the
// acquisition-channel row titles, the mainland biome nouns the game never
// names, and the merchant/arena chrome.
export interface BlueprintStrings {
  /** "Unlocks crafting" row label (schematic → craftable item). */
  unlocksCraft: string
  /** Obtain-section row label per acquisition channel. */
  kind: {
    chest: string
    fishing: string
    salvage: string
    supply: string
    camp: string
    oilrig: string
    treasureMap: string
    raid: string
    shrine: string
    merchant: string
    arena: string
    /** Relic-recycler inverse row ("From relic recycling: <relics>"). */
    recycler: string
  }
  /** Mainland biome area labels; island/rig names come from labels.json. */
  area: {
    Grass: string
    Forest: string
    Desert: string
    Snow: string
    Volcano: string
    Yakushima: string
  }
  /** Fishing-salvage rank chip: "Rank {{n}}". */
  rank: string
  /** Merchant shop labels (shop keys from the tools pipeline). */
  shop: {
    village: string
    desertWeapon: string
    volcanoWeapon: string
    medal: string
    arena: string
  }
  /** PvP arena rank names (DT_ArenaSoloRewardTable row keys). */
  arenaRank: { Bronze: string; Silver: string; Gold: string; Platinum: string }
  /** Arena reward chip badges. */
  firstClear: string
  repeatClear: string
  /** Detail-page note for schematics with no acquisition channel at all. */
  noSource: string
  /** Items-list filter chip for the same. */
  noSourceFilter: string
}

export const BLUEPRINT_STRINGS: Record<Language, BlueprintStrings> = {
  'en-US': {
    unlocksCraft: 'Unlocks crafting',
    kind: {
      chest: 'Treasure chests', fishing: 'Fishing spots', salvage: 'Fishing salvage',
      supply: 'Supply drops', camp: 'Faction camps', oilrig: 'Oil rigs',
      treasureMap: 'Treasure maps', raid: 'Summoning altar raids', shrine: 'Ancient Shrines',
      merchant: 'Merchants', arena: 'Arena rewards', recycler: 'Relic recycling',
    },
    area: { Grass: 'Grasslands', Forest: 'Forest', Desert: 'Desert', Snow: 'Snowfields', Volcano: 'Volcano', Yakushima: 'Yakushima' },
    rank: 'Rank {{n}}',
    shop: {
      village: 'Village merchant', desertWeapon: 'Weapon dealer (desert village)',
      volcanoWeapon: 'Weapon dealer (volcano village)', medal: 'Medal merchant', arena: 'Arena shop',
    },
    arenaRank: { Bronze: 'Bronze', Silver: 'Silver', Gold: 'Gold', Platinum: 'Platinum' },
    firstClear: 'First clear',
    repeatClear: 'Repeatable',
    noSource: 'No known way to obtain this schematic — it does not appear in any loot table, shop or reward.',
    noSourceFilter: 'No known source',
  },
  'de-DE': {
    unlocksCraft: 'Schaltet Herstellung frei',
    kind: {
      chest: 'Schatztruhen', fishing: 'Angelstellen', salvage: 'Angel-Bergung',
      supply: 'Versorgungsabwürfe', camp: 'Fraktionslager', oilrig: 'Bohrinseln',
      treasureMap: 'Schatzkarten', raid: 'Beschwörungsaltar-Raids', shrine: 'Antike Schreine',
      merchant: 'Händler', arena: 'Arena-Belohnungen', recycler: 'Relikt-Recycling',
    },
    area: { Grass: 'Grasland', Forest: 'Wald', Desert: 'Wüste', Snow: 'Schneefelder', Volcano: 'Vulkan', Yakushima: 'Yakushima' },
    rank: 'Rang {{n}}',
    shop: {
      village: 'Dorfhändler', desertWeapon: 'Waffenhändler (Wüstendorf)',
      volcanoWeapon: 'Waffenhändler (Vulkandorf)', medal: 'Medaillenhändler', arena: 'Arena-Shop',
    },
    arenaRank: { Bronze: 'Bronze', Silver: 'Silber', Gold: 'Gold', Platinum: 'Platin' },
    firstClear: 'Erster Sieg',
    repeatClear: 'Wiederholbar',
    noSource: 'Keine bekannte Bezugsquelle — dieser Bauplan erscheint in keiner Beutetabelle, keinem Shop und keiner Belohnung.',
    noSourceFilter: 'Keine bekannte Quelle',
  },
  'es-ES': {
    unlocksCraft: 'Desbloquea la fabricación',
    kind: {
      chest: 'Cofres del tesoro', fishing: 'Zonas de pesca', salvage: 'Chatarra de pesca',
      supply: 'Suministros aéreos', camp: 'Campamentos de facción', oilrig: 'Plataformas petrolíferas',
      treasureMap: 'Mapas del tesoro', raid: 'Incursiones del altar de invocación', shrine: 'Santuarios antiguos',
      merchant: 'Mercaderes', arena: 'Recompensas de arena', recycler: 'Reciclaje de reliquias',
    },
    area: { Grass: 'Praderas', Forest: 'Bosque', Desert: 'Desierto', Snow: 'Campos nevados', Volcano: 'Volcán', Yakushima: 'Yakushima' },
    rank: 'Rango {{n}}',
    shop: {
      village: 'Mercader del pueblo', desertWeapon: 'Vendedor de armas (pueblo del desierto)',
      volcanoWeapon: 'Vendedor de armas (pueblo del volcán)', medal: 'Mercader de medallas', arena: 'Tienda de la arena',
    },
    arenaRank: { Bronze: 'Bronce', Silver: 'Plata', Gold: 'Oro', Platinum: 'Platino' },
    firstClear: 'Primera victoria',
    repeatClear: 'Repetible',
    noSource: 'No hay forma conocida de obtener este plano: no aparece en ninguna tabla de botín, tienda ni recompensa.',
    noSourceFilter: 'Sin fuente conocida',
  },
  'es-MX': {
    unlocksCraft: 'Desbloquea la fabricación',
    kind: {
      chest: 'Cofres del tesoro', fishing: 'Zonas de pesca', salvage: 'Chatarra de pesca',
      supply: 'Suministros aéreos', camp: 'Campamentos de facción', oilrig: 'Plataformas petroleras',
      treasureMap: 'Mapas del tesoro', raid: 'Incursiones del altar de invocación', shrine: 'Santuarios antiguos',
      merchant: 'Mercaderes', arena: 'Recompensas de arena', recycler: 'Reciclaje de reliquias',
    },
    area: { Grass: 'Praderas', Forest: 'Bosque', Desert: 'Desierto', Snow: 'Campos nevados', Volcano: 'Volcán', Yakushima: 'Yakushima' },
    rank: 'Rango {{n}}',
    shop: {
      village: 'Mercader del pueblo', desertWeapon: 'Vendedor de armas (pueblo del desierto)',
      volcanoWeapon: 'Vendedor de armas (pueblo del volcán)', medal: 'Mercader de medallas', arena: 'Tienda de la arena',
    },
    arenaRank: { Bronze: 'Bronce', Silver: 'Plata', Gold: 'Oro', Platinum: 'Platino' },
    firstClear: 'Primera victoria',
    repeatClear: 'Repetible',
    noSource: 'No hay forma conocida de obtener este plano: no aparece en ninguna tabla de botín, tienda ni recompensa.',
    noSourceFilter: 'Sin fuente conocida',
  },
  'fr-FR': {
    unlocksCraft: 'Débloque la fabrication',
    kind: {
      chest: 'Coffres au trésor', fishing: 'Zones de pêche', salvage: 'Récupération de pêche',
      supply: 'Largages de ravitaillement', camp: 'Camps de faction', oilrig: 'Plates-formes pétrolières',
      treasureMap: 'Cartes au trésor', raid: "Raids de l'autel d'invocation", shrine: 'Sanctuaires antiques',
      merchant: 'Marchands', arena: "Récompenses d'arène", recycler: 'Recyclage de reliques',
    },
    area: { Grass: 'Prairies', Forest: 'Forêt', Desert: 'Désert', Snow: 'Champs de neige', Volcano: 'Volcan', Yakushima: 'Yakushima' },
    rank: 'Rang {{n}}',
    shop: {
      village: 'Marchand du village', desertWeapon: "Marchand d'armes (village du désert)",
      volcanoWeapon: "Marchand d'armes (village du volcan)", medal: 'Marchand de médailles', arena: "Boutique de l'arène",
    },
    arenaRank: { Bronze: 'Bronze', Silver: 'Argent', Gold: 'Or', Platinum: 'Platine' },
    firstClear: 'Première victoire',
    repeatClear: 'Répétable',
    noSource: "Aucun moyen connu d'obtenir ce plan : il n'apparaît dans aucune table de butin, boutique ni récompense.",
    noSourceFilter: 'Aucune source connue',
  },
  'id-ID': {
    unlocksCraft: 'Membuka pembuatan',
    kind: {
      chest: 'Peti harta', fishing: 'Titik memancing', salvage: 'Rongsokan pancingan',
      supply: 'Kiriman suplai', camp: 'Kamp faksi', oilrig: 'Anjungan minyak',
      treasureMap: 'Peta harta karun', raid: 'Raid altar pemanggilan', shrine: 'Kuil kuno',
      merchant: 'Pedagang', arena: 'Hadiah arena', recycler: 'Daur ulang relik',
    },
    area: { Grass: 'Padang rumput', Forest: 'Hutan', Desert: 'Gurun', Snow: 'Ladang salju', Volcano: 'Gunung berapi', Yakushima: 'Yakushima' },
    rank: 'Peringkat {{n}}',
    shop: {
      village: 'Pedagang desa', desertWeapon: 'Penjual senjata (desa gurun)',
      volcanoWeapon: 'Penjual senjata (desa gunung berapi)', medal: 'Pedagang medali', arena: 'Toko arena',
    },
    arenaRank: { Bronze: 'Perunggu', Silver: 'Perak', Gold: 'Emas', Platinum: 'Platina' },
    firstClear: 'Kemenangan pertama',
    repeatClear: 'Dapat diulang',
    noSource: 'Tidak ada cara yang diketahui untuk mendapatkan cetak biru ini — tidak muncul di tabel jarahan, toko, atau hadiah mana pun.',
    noSourceFilter: 'Sumber tidak diketahui',
  },
  'it-IT': {
    unlocksCraft: 'Sblocca la fabbricazione',
    kind: {
      chest: 'Forzieri del tesoro', fishing: 'Punti di pesca', salvage: 'Recupero di pesca',
      supply: 'Rifornimenti aerei', camp: 'Campi delle fazioni', oilrig: 'Piattaforme petrolifere',
      treasureMap: 'Mappe del tesoro', raid: "Raid dell'altare di evocazione", shrine: 'Santuari antichi',
      merchant: 'Mercanti', arena: "Ricompense dell'arena", recycler: 'Riciclo di reliquie',
    },
    area: { Grass: 'Praterie', Forest: 'Foresta', Desert: 'Deserto', Snow: 'Campi innevati', Volcano: 'Vulcano', Yakushima: 'Yakushima' },
    rank: 'Grado {{n}}',
    shop: {
      village: 'Mercante del villaggio', desertWeapon: 'Armaiolo (villaggio del deserto)',
      volcanoWeapon: 'Armaiolo (villaggio del vulcano)', medal: 'Mercante di medaglie', arena: "Negozio dell'arena",
    },
    arenaRank: { Bronze: 'Bronzo', Silver: 'Argento', Gold: 'Oro', Platinum: 'Platino' },
    firstClear: 'Prima vittoria',
    repeatClear: 'Ripetibile',
    noSource: 'Nessun modo noto per ottenere questo progetto: non compare in alcuna tabella del bottino, negozio o ricompensa.',
    noSourceFilter: 'Nessuna fonte nota',
  },
  'ja-JP': {
    unlocksCraft: '製作可能になるアイテム',
    kind: {
      chest: '宝箱', fishing: '釣りスポット', salvage: '釣りサルベージ',
      supply: '物資ドロップ', camp: '密猟団キャンプ', oilrig: '石油プラント',
      treasureMap: '宝の地図', raid: '召喚の祭壇レイド', shrine: '古代の祠',
      merchant: '商人', arena: 'アリーナ報酬', recycler: '遺物リサイクル',
    },
    area: { Grass: '草原', Forest: '森林', Desert: '砂漠', Snow: '雪原', Volcano: '火山', Yakushima: 'ヤクシマ' },
    rank: 'ランク{{n}}',
    shop: {
      village: '村の商人', desertWeapon: '武器商人（砂漠の村）',
      volcanoWeapon: '武器商人（火山の村）', medal: 'メダル商人', arena: 'アリーナショップ',
    },
    arenaRank: { Bronze: 'ブロンズ', Silver: 'シルバー', Gold: 'ゴールド', Platinum: 'プラチナ' },
    firstClear: '初回クリア',
    repeatClear: '繰り返し入手可',
    noSource: 'この設計図の入手方法は確認されていません。ルートテーブル・ショップ・報酬のいずれにも登場しません。',
    noSourceFilter: '入手方法なし',
  },
  'ko-KR': {
    unlocksCraft: '제작 해금',
    kind: {
      chest: '보물 상자', fishing: '낚시 포인트', salvage: '낚시 인양',
      supply: '보급 드롭', camp: '밀렵단 캠프', oilrig: '석유 시추 시설',
      treasureMap: '보물 지도', raid: '소환 제단 레이드', shrine: '고대의 사당',
      merchant: '상인', arena: '아레나 보상', recycler: '유물 재활용',
    },
    area: { Grass: '초원', Forest: '숲', Desert: '사막', Snow: '설원', Volcano: '화산', Yakushima: '야쿠시마' },
    rank: '랭크 {{n}}',
    shop: {
      village: '마을 상인', desertWeapon: '무기 상인(사막 마을)',
      volcanoWeapon: '무기 상인(화산 마을)', medal: '메달 상인', arena: '아레나 상점',
    },
    arenaRank: { Bronze: '브론즈', Silver: '실버', Gold: '골드', Platinum: '플래티넘' },
    firstClear: '최초 클리어',
    repeatClear: '반복 획득 가능',
    noSource: '이 도면의 입수 방법이 확인되지 않았습니다. 어떤 전리품 테이블, 상점, 보상에도 등장하지 않습니다.',
    noSourceFilter: '입수처 없음',
  },
  'pl-PL': {
    unlocksCraft: 'Odblokowuje wytwarzanie',
    kind: {
      chest: 'Skrzynie ze skarbami', fishing: 'Łowiska', salvage: 'Złom z wędkowania',
      supply: 'Zrzuty zaopatrzenia', camp: 'Obozy frakcji', oilrig: 'Platformy wiertnicze',
      treasureMap: 'Mapy skarbów', raid: 'Rajdy ołtarza przyzwania', shrine: 'Starożytne kapliczki',
      merchant: 'Handlarze', arena: 'Nagrody areny', recycler: 'Recykling reliktów',
    },
    area: { Grass: 'Łąki', Forest: 'Las', Desert: 'Pustynia', Snow: 'Pola śnieżne', Volcano: 'Wulkan', Yakushima: 'Yakushima' },
    rank: 'Ranga {{n}}',
    shop: {
      village: 'Handlarz wioskowy', desertWeapon: 'Handlarz bronią (pustynna wioska)',
      volcanoWeapon: 'Handlarz bronią (wulkaniczna wioska)', medal: 'Handlarz medalami', arena: 'Sklep areny',
    },
    arenaRank: { Bronze: 'Brąz', Silver: 'Srebro', Gold: 'Złoto', Platinum: 'Platyna' },
    firstClear: 'Pierwsze zwycięstwo',
    repeatClear: 'Powtarzalne',
    noSource: 'Nie ma znanego sposobu zdobycia tego schematu — nie występuje w żadnej tabeli łupów, sklepie ani nagrodzie.',
    noSourceFilter: 'Brak znanego źródła',
  },
  'pt-BR': {
    unlocksCraft: 'Desbloqueia a fabricação',
    kind: {
      chest: 'Baús de tesouro', fishing: 'Pontos de pesca', salvage: 'Sucata de pesca',
      supply: 'Suprimentos aéreos', camp: 'Acampamentos de facção', oilrig: 'Plataformas de petróleo',
      treasureMap: 'Mapas do tesouro', raid: 'Raids do altar de invocação', shrine: 'Santuários antigos',
      merchant: 'Mercadores', arena: 'Recompensas da arena', recycler: 'Reciclagem de relíquias',
    },
    area: { Grass: 'Campinas', Forest: 'Floresta', Desert: 'Deserto', Snow: 'Campos nevados', Volcano: 'Vulcão', Yakushima: 'Yakushima' },
    rank: 'Rank {{n}}',
    shop: {
      village: 'Mercador da vila', desertWeapon: 'Vendedor de armas (vila do deserto)',
      volcanoWeapon: 'Vendedor de armas (vila do vulcão)', medal: 'Mercador de medalhas', arena: 'Loja da arena',
    },
    arenaRank: { Bronze: 'Bronze', Silver: 'Prata', Gold: 'Ouro', Platinum: 'Platina' },
    firstClear: 'Primeira vitória',
    repeatClear: 'Repetível',
    noSource: 'Não há forma conhecida de obter este projeto — ele não aparece em nenhuma tabela de saque, loja ou recompensa.',
    noSourceFilter: 'Sem fonte conhecida',
  },
  'ru-RU': {
    unlocksCraft: 'Открывает создание',
    kind: {
      chest: 'Сундуки с сокровищами', fishing: 'Места рыбалки', salvage: 'Рыболовный хлам',
      supply: 'Сбросы припасов', camp: 'Лагеря фракций', oilrig: 'Нефтяные платформы',
      treasureMap: 'Карты сокровищ', raid: 'Рейды алтаря призыва', shrine: 'Древние святилища',
      merchant: 'Торговцы', arena: 'Награды арены', recycler: 'Переработка реликвий',
    },
    area: { Grass: 'Луга', Forest: 'Лес', Desert: 'Пустыня', Snow: 'Снежные поля', Volcano: 'Вулкан', Yakushima: 'Якусима' },
    rank: 'Ранг {{n}}',
    shop: {
      village: 'Деревенский торговец', desertWeapon: 'Торговец оружием (пустынная деревня)',
      volcanoWeapon: 'Торговец оружием (вулканическая деревня)', medal: 'Торговец медалями', arena: 'Магазин арены',
    },
    arenaRank: { Bronze: 'Бронза', Silver: 'Серебро', Gold: 'Золото', Platinum: 'Платина' },
    firstClear: 'Первая победа',
    repeatClear: 'Повторяемо',
    noSource: 'Способ получения этого чертежа неизвестен — он не встречается ни в таблицах добычи, ни в магазинах, ни в наградах.',
    noSourceFilter: 'Источник неизвестен',
  },
  'th-TH': {
    unlocksCraft: 'ปลดล็อกการคราฟต์',
    kind: {
      chest: 'หีบสมบัติ', fishing: 'จุดตกปลา', salvage: 'ของกู้จากการตกปลา',
      supply: 'กล่องเสบียงทางอากาศ', camp: 'แคมป์แก๊ง', oilrig: 'แท่นขุดเจาะน้ำมัน',
      treasureMap: 'แผนที่สมบัติ', raid: 'เรดแท่นบูชาอัญเชิญ', shrine: 'ศาลเจ้าโบราณ',
      merchant: 'พ่อค้า', arena: 'รางวัลอารีนา', recycler: 'รีไซเคิลวัตถุโบราณ',
    },
    area: { Grass: 'ทุ่งหญ้า', Forest: 'ป่า', Desert: 'ทะเลทราย', Snow: 'ทุ่งหิมะ', Volcano: 'ภูเขาไฟ', Yakushima: 'ยากูชิมะ' },
    rank: 'แรงก์ {{n}}',
    shop: {
      village: 'พ่อค้าหมู่บ้าน', desertWeapon: 'พ่อค้าอาวุธ (หมู่บ้านทะเลทราย)',
      volcanoWeapon: 'พ่อค้าอาวุธ (หมู่บ้านภูเขาไฟ)', medal: 'พ่อค้าเหรียญ', arena: 'ร้านค้าอารีนา',
    },
    arenaRank: { Bronze: 'บรอนซ์', Silver: 'ซิลเวอร์', Gold: 'โกลด์', Platinum: 'แพลตินัม' },
    firstClear: 'เคลียร์ครั้งแรก',
    repeatClear: 'รับซ้ำได้',
    noSource: 'ยังไม่พบวิธีได้รับพิมพ์เขียวนี้ — ไม่ปรากฏในตารางดรอป ร้านค้า หรือรางวัลใด ๆ',
    noSourceFilter: 'ไม่ทราบแหล่งที่มา',
  },
  'tr-TR': {
    unlocksCraft: 'Üretimi açar',
    kind: {
      chest: 'Hazine sandıkları', fishing: 'Balıkçılık noktaları', salvage: 'Balıkçılık hurdası',
      supply: 'İkmal paketleri', camp: 'Hizip kampları', oilrig: 'Petrol platformları',
      treasureMap: 'Hazine haritaları', raid: 'Çağırma sunağı baskınları', shrine: 'Kadim türbeler',
      merchant: 'Tüccarlar', arena: 'Arena ödülleri', recycler: 'Kalıntı geri dönüşümü',
    },
    area: { Grass: 'Çayırlar', Forest: 'Orman', Desert: 'Çöl', Snow: 'Kar tarlaları', Volcano: 'Yanardağ', Yakushima: 'Yakushima' },
    rank: 'Sıra {{n}}',
    shop: {
      village: 'Köy tüccarı', desertWeapon: 'Silah satıcısı (çöl köyü)',
      volcanoWeapon: 'Silah satıcısı (yanardağ köyü)', medal: 'Madalya tüccarı', arena: 'Arena dükkânı',
    },
    arenaRank: { Bronze: 'Bronz', Silver: 'Gümüş', Gold: 'Altın', Platinum: 'Platin' },
    firstClear: 'İlk galibiyet',
    repeatClear: 'Tekrarlanabilir',
    noSource: 'Bu planı elde etmenin bilinen bir yolu yok — hiçbir ganimet tablosunda, dükkânda veya ödülde görünmüyor.',
    noSourceFilter: 'Bilinen kaynak yok',
  },
  'vi-VN': {
    unlocksCraft: 'Mở khóa chế tạo',
    kind: {
      chest: 'Rương kho báu', fishing: 'Điểm câu cá', salvage: 'Phế liệu câu cá',
      supply: 'Thùng tiếp tế', camp: 'Trại băng đảng', oilrig: 'Giàn khoan dầu',
      treasureMap: 'Bản đồ kho báu', raid: 'Đột kích bàn thờ triệu hồi', shrine: 'Đền cổ',
      merchant: 'Thương nhân', arena: 'Phần thưởng đấu trường', recycler: 'Tái chế di vật',
    },
    area: { Grass: 'Đồng cỏ', Forest: 'Rừng', Desert: 'Sa mạc', Snow: 'Cánh đồng tuyết', Volcano: 'Núi lửa', Yakushima: 'Yakushima' },
    rank: 'Hạng {{n}}',
    shop: {
      village: 'Thương nhân trong làng', desertWeapon: 'Người bán vũ khí (làng sa mạc)',
      volcanoWeapon: 'Người bán vũ khí (làng núi lửa)', medal: 'Thương nhân huy chương', arena: 'Cửa hàng đấu trường',
    },
    arenaRank: { Bronze: 'Đồng', Silver: 'Bạc', Gold: 'Vàng', Platinum: 'Bạch kim' },
    firstClear: 'Thắng lần đầu',
    repeatClear: 'Có thể lặp lại',
    noSource: 'Chưa có cách nào được biết để nhận bản thiết kế này — nó không xuất hiện trong bất kỳ bảng vật phẩm, cửa hàng hay phần thưởng nào.',
    noSourceFilter: 'Không rõ nguồn',
  },
  'zh-CN': {
    unlocksCraft: '解锁制作',
    kind: {
      chest: '宝箱', fishing: '钓鱼点', salvage: '钓鱼打捞',
      supply: '物资空投', camp: '据点营地', oilrig: '石油钻井平台',
      treasureMap: '藏宝图', raid: '召唤祭坛讨伐', shrine: '古代神龛',
      merchant: '商人', arena: '竞技场奖励', recycler: '遗物回收',
    },
    area: { Grass: '草原', Forest: '森林', Desert: '沙漠', Snow: '雪原', Volcano: '火山', Yakushima: '屋久岛' },
    rank: '等级 {{n}}',
    shop: {
      village: '村庄商人', desertWeapon: '武器商人（沙漠村庄）',
      volcanoWeapon: '武器商人（火山村庄）', medal: '奖章商人', arena: '竞技场商店',
    },
    arenaRank: { Bronze: '青铜', Silver: '白银', Gold: '黄金', Platinum: '铂金' },
    firstClear: '首次通关',
    repeatClear: '可重复获取',
    noSource: '暂无已知获取途径——该设计图不出现在任何掉落表、商店或奖励中。',
    noSourceFilter: '无已知来源',
  },
  'zh-TW': {
    unlocksCraft: '解鎖製作',
    kind: {
      chest: '寶箱', fishing: '釣魚點', salvage: '釣魚打撈',
      supply: '物資空投', camp: '據點營地', oilrig: '石油鑽井平臺',
      treasureMap: '藏寶圖', raid: '召喚祭壇討伐', shrine: '古代神龕',
      merchant: '商人', arena: '競技場獎勵', recycler: '遺物回收',
    },
    area: { Grass: '草原', Forest: '森林', Desert: '沙漠', Snow: '雪原', Volcano: '火山', Yakushima: '屋久島' },
    rank: '等級 {{n}}',
    shop: {
      village: '村莊商人', desertWeapon: '武器商人（沙漠村莊）',
      volcanoWeapon: '武器商人（火山村莊）', medal: '獎章商人', arena: '競技場商店',
    },
    arenaRank: { Bronze: '青銅', Silver: '白銀', Gold: '黃金', Platinum: '白金' },
    firstClear: '首次通關',
    repeatClear: '可重複獲取',
    noSource: '暫無已知取得途徑——該設計圖不出現在任何掉落表、商店或獎勵中。',
    noSourceFilter: '無已知來源',
  },
}

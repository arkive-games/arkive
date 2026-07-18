import type { Language } from './i18n'

// Base-raids page UI chrome, merged into the `translation` namespace under the
// `raids` key (see i18n.ts). Pal / item / building names come from the locale
// data files; the three island biome names (Sakurajima / Yamishima /
// SkyCityCity) are the game's own island names from DT_WorldMap_Common_Text
// (REGION_Wide_Sakurajima01 / _Darkisland01 / _Skyisland01).
export interface RaidsStrings {
  title: string
  caption: string
  /** Biome filter: "all" chip. */
  all: string
  /** "Base grade <min>–<max>" prefix. */
  grade: string
  /** Raid trigger condition: required placed building. */
  condition: string
  /** Wave row label: "Wave {{n}}". */
  wave: string
  rewards: string
  /** Internal biome enum value → display name. */
  biome: Record<string, string>
}

export const RAIDS_STRINGS: Record<Language, RaidsStrings> = {
  'en-US': {
    title: 'Base Raids',
    caption:
      'Invader groups that can attack your base, by biome: base-grade range, wave composition, and clear rewards.',
    all: 'All',
    grade: 'Base grade',
    condition: 'Requires building',
    wave: 'Wave {{n}}',
    rewards: 'Rewards',
    biome: {
      Meadow: 'Grassland',
      Forest: 'Forest',
      Desert: 'Desert',
      IceSnow: 'Snowfields',
      Volcano: 'Volcano',
      Sakurajima: 'Sakurajima',
      Yamishima: 'Feybreak',
      SkyCityCity: 'Sunreach',
    },
  },
  'de-DE': {
    title: 'Basis-Überfälle',
    caption:
      'Angreifergruppen, die deine Basis überfallen können, nach Biom: Basisstufen-Bereich, Wellenzusammensetzung und Belohnungen.',
    all: 'Alle',
    grade: 'Basisstufe',
    condition: 'Benötigtes Gebäude',
    wave: 'Welle {{n}}',
    rewards: 'Belohnungen',
    biome: {
      Meadow: 'Grasland',
      Forest: 'Wald',
      Desert: 'Wüste',
      IceSnow: 'Schneefelder',
      Volcano: 'Vulkan',
      Sakurajima: 'Kirschblüteninsel',
      Yamishima: 'Feybreak',
      SkyCityCity: 'Sonnenhort',
    },
  },
  'es-ES': {
    title: 'Asaltos a la base',
    caption:
      'Grupos de invasores que pueden atacar tu base, por bioma: rango de nivel de base, composición de las oleadas y recompensas.',
    all: 'Todos',
    grade: 'Nivel de base',
    condition: 'Edificio requerido',
    wave: 'Oleada {{n}}',
    rewards: 'Recompensas',
    biome: {
      Meadow: 'Pradera',
      Forest: 'Bosque',
      Desert: 'Desierto',
      IceSnow: 'Campos nevados',
      Volcano: 'Volcán',
      Sakurajima: 'Isla Cerezo',
      Yamishima: 'Tenraku',
      SkyCityCity: 'Celuxia',
    },
  },
  'es-MX': {
    title: 'Asaltos a la base',
    caption:
      'Grupos de invasores que pueden atacar tu base, por bioma: rango de nivel de base, composición de las oleadas y recompensas.',
    all: 'Todos',
    grade: 'Nivel de base',
    condition: 'Edificio requerido',
    wave: 'Oleada {{n}}',
    rewards: 'Recompensas',
    biome: {
      Meadow: 'Pradera',
      Forest: 'Bosque',
      Desert: 'Desierto',
      IceSnow: 'Campos nevados',
      Volcano: 'Volcán',
      Sakurajima: 'Isla Sakura',
      Yamishima: 'Tenraku',
      SkyCityCity: 'Edén del sol celestial',
    },
  },
  'fr-FR': {
    title: 'Raids de base',
    caption:
      'Groupes d’envahisseurs pouvant attaquer votre base, par biome : plage de niveau de base, composition des vagues et récompenses.',
    all: 'Tous',
    grade: 'Niveau de base',
    condition: 'Bâtiment requis',
    wave: 'Vague {{n}}',
    rewards: 'Récompenses',
    biome: {
      Meadow: 'Prairie',
      Forest: 'Forêt',
      Desert: 'Désert',
      IceSnow: 'Champs de neige',
      Volcano: 'Volcan',
      Sakurajima: 'Île aux Cerisiers',
      Yamishima: 'Paradis Déchu',
      SkyCityCity: 'Terres Astrales',
    },
  },
  'id-ID': {
    title: 'Serangan Markas',
    caption:
      'Kelompok penyerang yang dapat menyerang markas, per bioma: rentang tingkat markas, komposisi gelombang, dan hadiah.',
    all: 'Semua',
    grade: 'Tingkat markas',
    condition: 'Bangunan yang diperlukan',
    wave: 'Gelombang {{n}}',
    rewards: 'Hadiah',
    biome: {
      Meadow: 'Padang rumput',
      Forest: 'Hutan',
      Desert: 'Gurun',
      IceSnow: 'Ladang salju',
      Volcano: 'Gunung berapi',
      Sakurajima: 'Sakurajima',
      Yamishima: 'Langit Jatuh',
      SkyCityCity: 'Desa Mentari Surgawi',
    },
  },
  'it-IT': {
    title: 'Assalti alla base',
    caption:
      'Gruppi di invasori che possono attaccare la tua base, per bioma: intervallo di grado della base, composizione delle ondate e ricompense.',
    all: 'Tutti',
    grade: 'Grado della base',
    condition: 'Edificio richiesto',
    wave: 'Ondata {{n}}',
    rewards: 'Ricompense',
    biome: {
      Meadow: 'Prateria',
      Forest: 'Foresta',
      Desert: 'Deserto',
      IceSnow: 'Campi innevati',
      Volcano: 'Vulcano',
      Sakurajima: 'Isola dei ciliegi',
      Yamishima: 'Lande della rovina',
      SkyCityCity: 'Capitale del firmamento',
    },
  },
  'ja-JP': {
    title: '拠点襲撃',
    caption:
      '拠点を襲撃する侵略者グループをバイオーム別に表示:対象の拠点グレード、ウェーブ構成、撃退報酬。',
    all: 'すべて',
    grade: '拠点グレード',
    condition: '必要な建築物',
    wave: 'ウェーブ{{n}}',
    rewards: '報酬',
    biome: {
      Meadow: '草原',
      Forest: '森林',
      Desert: '砂漠',
      IceSnow: '雪原',
      Volcano: '火山',
      Sakurajima: '桜島',
      Yamishima: '天落',
      SkyCityCity: '天陽郷',
    },
  },
  'ko-KR': {
    title: '거점 습격',
    caption:
      '거점을 습격할 수 있는 침략자 무리를 지역별로 표시: 거점 등급 범위, 웨이브 구성, 격퇴 보상.',
    all: '전체',
    grade: '거점 등급',
    condition: '필요 건축물',
    wave: '웨이브 {{n}}',
    rewards: '보상',
    biome: {
      Meadow: '초원',
      Forest: '숲',
      Desert: '사막',
      IceSnow: '설원',
      Volcano: '화산',
      Sakurajima: '벚꽃 섬',
      Yamishima: '천락',
      SkyCityCity: '천양향',
    },
  },
  'pl-PL': {
    title: 'Najazdy na bazę',
    caption:
      'Grupy najeźdźców mogące zaatakować twoją bazę, według biomu: zakres poziomu bazy, skład fal i nagrody.',
    all: 'Wszystkie',
    grade: 'Poziom bazy',
    condition: 'Wymagany budynek',
    wave: 'Fala {{n}}',
    rewards: 'Nagrody',
    biome: {
      Meadow: 'Łąki',
      Forest: 'Las',
      Desert: 'Pustynia',
      IceSnow: 'Pola śnieżne',
      Volcano: 'Wulkan',
      Sakurajima: 'Sakurajima',
      Yamishima: 'Feybreak',
      SkyCityCity: 'Niebiańska Kraina Słońca',
    },
  },
  'pt-BR': {
    title: 'Ataques à base',
    caption:
      'Grupos de invasores que podem atacar sua base, por bioma: faixa de nível da base, composição das ondas e recompensas.',
    all: 'Todos',
    grade: 'Nível da base',
    condition: 'Construção necessária',
    wave: 'Onda {{n}}',
    rewards: 'Recompensas',
    biome: {
      Meadow: 'Campina',
      Forest: 'Floresta',
      Desert: 'Deserto',
      IceSnow: 'Campos nevados',
      Volcano: 'Vulcão',
      Sakurajima: 'Ilha das Cerejeiras',
      Yamishima: 'Terra Decaída',
      SkyCityCity: 'Terra do Esplendor Celeste',
    },
  },
  'ru-RU': {
    title: 'Рейды на базу',
    caption:
      'Группы захватчиков, которые могут напасть на вашу базу, по биомам: диапазон уровня базы, состав волн и награды.',
    all: 'Все',
    grade: 'Уровень базы',
    condition: 'Требуемая постройка',
    wave: 'Волна {{n}}',
    rewards: 'Награды',
    biome: {
      Meadow: 'Луга',
      Forest: 'Лес',
      Desert: 'Пустыня',
      IceSnow: 'Снежные поля',
      Volcano: 'Вулкан',
      Sakurajima: 'Сакурадзима',
      Yamishima: 'Тэнраку',
      SkyCityCity: 'Санрич',
    },
  },
  'th-TH': {
    title: 'การบุกโจมตีฐาน',
    caption:
      'กลุ่มผู้บุกรุกที่อาจโจมตีฐานของคุณ แยกตามไบโอม: ช่วงระดับฐาน องค์ประกอบของระลอก และรางวัล',
    all: 'ทั้งหมด',
    grade: 'ระดับฐาน',
    condition: 'สิ่งก่อสร้างที่ต้องมี',
    wave: 'ระลอก {{n}}',
    rewards: 'รางวัล',
    biome: {
      Meadow: 'ทุ่งหญ้า',
      Forest: 'ป่า',
      Desert: 'ทะเลทราย',
      IceSnow: 'ทุ่งหิมะ',
      Volcano: 'ภูเขาไฟ',
      Sakurajima: 'เกาะซากุระ',
      Yamishima: 'สวรรค์ล่ม',
      SkyCityCity: 'ดินแดนแห่งแสงสุริยัน',
    },
  },
  'tr-TR': {
    title: 'Üs Baskınları',
    caption:
      'Üssünüze saldırabilecek istilacı grupları, biyoma göre: üs seviyesi aralığı, dalga bileşimi ve ödüller.',
    all: 'Tümü',
    grade: 'Üs seviyesi',
    condition: 'Gerekli yapı',
    wave: 'Dalga {{n}}',
    rewards: 'Ödüller',
    biome: {
      Meadow: 'Çayır',
      Forest: 'Orman',
      Desert: 'Çöl',
      IceSnow: 'Kar tarlaları',
      Volcano: 'Yanardağ',
      Sakurajima: 'Sakurajima',
      Yamishima: 'Feybreak',
      SkyCityCity: 'Gökgüneş Diyarı',
    },
  },
  'vi-VN': {
    title: 'Đột kích căn cứ',
    caption:
      'Các nhóm xâm lược có thể tấn công căn cứ, theo quần xã: khoảng cấp căn cứ, đội hình từng đợt và phần thưởng.',
    all: 'Tất cả',
    grade: 'Cấp căn cứ',
    condition: 'Công trình yêu cầu',
    wave: 'Đợt {{n}}',
    rewards: 'Phần thưởng',
    biome: {
      Meadow: 'Đồng cỏ',
      Forest: 'Rừng',
      Desert: 'Sa mạc',
      IceSnow: 'Cánh đồng tuyết',
      Volcano: 'Núi lửa',
      Sakurajima: 'Đảo Hoa Đào',
      Yamishima: 'Feybreak',
      SkyCityCity: 'Miền Ánh Dương',
    },
  },
  'zh-CN': {
    title: '据点袭击',
    caption:
      '可能袭击你据点的入侵者队伍，按生态区分类：据点等级范围、波次构成与击退奖励。',
    all: '全部',
    grade: '据点等级',
    condition: '前置建筑',
    wave: '第 {{n}} 波',
    rewards: '奖励',
    biome: {
      Meadow: '草原',
      Forest: '森林',
      Desert: '沙漠',
      IceSnow: '雪原',
      Volcano: '火山',
      Sakurajima: '樱花岛',
      Yamishima: '天坠',
      SkyCityCity: '天阳乡',
    },
  },
  'zh-TW': {
    title: '據點襲擊',
    caption:
      '可能襲擊你據點的入侵者隊伍，依生態區分類：據點等級範圍、波次構成與擊退獎勵。',
    all: '全部',
    grade: '據點等級',
    condition: '前置建築',
    wave: '第 {{n}} 波',
    rewards: '獎勵',
    biome: {
      Meadow: '草原',
      Forest: '森林',
      Desert: '沙漠',
      IceSnow: '雪原',
      Volcano: '火山',
      Sakurajima: '櫻花島',
      Yamishima: '天墜',
      SkyCityCity: '天陽鄉',
    },
  },
}

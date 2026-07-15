import type { Language } from './i18n'

// Relic-recycler conversion sections (building + relic item detail pages),
// merged into the `translation` namespace under the `recycler` key (see
// i18n.ts). Item / building names come from the catalog locale files; this
// table only holds the sections' own labels.
export interface RecyclerStrings {
  /** Section title on both the building and the relic item pages. */
  title: string
  /** Comparison-table corner header (the output-pool column). */
  output: string
  /** Work amount needed for one conversion. */
  work: string
  /** Speed-boost hint: "Feeding {{item}} speeds conversion ×{{mult}}". */
  boost: string
  /** Expandable pool summary: "{{count}} possible items". */
  poolCount: string
  /** Cell subtext when a pool is rolled several times: "{{count}} rolls". */
  rolls: string
  /** Relic item page: label of the link row to the recycler building. */
  convertAt: string
  /** Probability-semantics footnote under the tables. */
  note: string
}

export const RECYCLER_STRINGS: Record<Language, RecyclerStrings> = {
  'en-US': {
    title: 'Conversion Outputs',
    output: 'Output',
    work: 'Work required',
    boost: 'Feeding {{item}} speeds conversion ×{{mult}}',
    poolCount: '{{count}} possible items',
    rolls: '{{count}} rolls',
    convertAt: 'Converted at',
    note: 'Each roll happens independently; rows with several rolls show the chance of at least one hit. Items inside a pool share the roll by weight.',
  },
  'de-DE': {
    title: 'Umwandlungserträge',
    output: 'Ertrag',
    work: 'Benötigte Arbeit',
    boost: '{{item}} verfüttern beschleunigt die Umwandlung ×{{mult}}',
    poolCount: '{{count}} mögliche Items',
    rolls: '{{count}} Würfe',
    convertAt: 'Umgewandelt bei',
    note: 'Jeder Wurf erfolgt unabhängig; Zeilen mit mehreren Würfen zeigen die Chance auf mindestens einen Treffer. Items eines Pools teilen sich den Wurf nach Gewicht.',
  },
  'es-ES': {
    title: 'Resultados de conversión',
    output: 'Resultado',
    work: 'Trabajo necesario',
    boost: 'Suministrar {{item}} acelera la conversión ×{{mult}}',
    poolCount: '{{count}} objetos posibles',
    rolls: '{{count}} tiradas',
    convertAt: 'Se convierte en',
    note: 'Cada tirada ocurre de forma independiente; las filas con varias tiradas muestran la probabilidad de acertar al menos una vez. Los objetos de un grupo comparten la tirada según su peso.',
  },
  'es-MX': {
    title: 'Resultados de conversión',
    output: 'Resultado',
    work: 'Trabajo necesario',
    boost: 'Suministrar {{item}} acelera la conversión ×{{mult}}',
    poolCount: '{{count}} objetos posibles',
    rolls: '{{count}} tiradas',
    convertAt: 'Se convierte en',
    note: 'Cada tirada ocurre de forma independiente; las filas con varias tiradas muestran la probabilidad de acertar al menos una vez. Los objetos de un grupo comparten la tirada según su peso.',
  },
  'fr-FR': {
    title: 'Produits de conversion',
    output: 'Produit',
    work: 'Travail requis',
    boost: 'Donner {{item}} accélère la conversion ×{{mult}}',
    poolCount: '{{count}} objets possibles',
    rolls: '{{count}} tirages',
    convertAt: 'Converti à',
    note: 'Chaque tirage a lieu indépendamment ; les lignes à plusieurs tirages affichent la chance d’au moins une réussite. Les objets d’un même lot se partagent le tirage selon leur poids.',
  },
  'id-ID': {
    title: 'Hasil Konversi',
    output: 'Hasil',
    work: 'Kerja yang dibutuhkan',
    boost: 'Memberikan {{item}} mempercepat konversi ×{{mult}}',
    poolCount: '{{count}} item yang mungkin',
    rolls: '{{count}} undian',
    convertAt: 'Dikonversi di',
    note: 'Setiap undian terjadi secara independen; baris dengan beberapa undian menunjukkan peluang minimal satu kali berhasil. Item dalam satu kelompok membagi undian menurut bobot.',
  },
  'it-IT': {
    title: 'Prodotti della conversione',
    output: 'Prodotto',
    work: 'Lavoro richiesto',
    boost: 'Fornire {{item}} accelera la conversione ×{{mult}}',
    poolCount: '{{count}} oggetti possibili',
    rolls: '{{count}} estrazioni',
    convertAt: 'Convertito presso',
    note: 'Ogni estrazione avviene in modo indipendente; le righe con più estrazioni mostrano la probabilità di almeno un successo. Gli oggetti di un gruppo si dividono l’estrazione in base al peso.',
  },
  'ja-JP': {
    title: '変換で得られるもの',
    output: '産出',
    work: '必要作業量',
    boost: '{{item}}を与えると変換速度が×{{mult}}になります',
    poolCount: '候補アイテム {{count}} 種',
    rolls: '抽選 {{count}} 回',
    convertAt: '変換施設',
    note: '各抽選は独立して行われます。複数回抽選の行は1回以上当たる確率を表示します。同じ抽選内のアイテムは重みに応じて確率を分け合います。',
  },
  'ko-KR': {
    title: '변환 산출물',
    output: '산출물',
    work: '필요 작업량',
    boost: '{{item}}을(를) 공급하면 변환 속도가 ×{{mult}}가 됩니다',
    poolCount: '가능한 아이템 {{count}}종',
    rolls: '추첨 {{count}}회',
    convertAt: '변환 시설',
    note: '각 추첨은 독립적으로 진행됩니다. 여러 번 추첨하는 행은 1회 이상 당첨될 확률을 표시합니다. 같은 추첨 풀의 아이템은 가중치에 따라 확률을 나눠 가집니다.',
  },
  'pl-PL': {
    title: 'Wyniki konwersji',
    output: 'Wynik',
    work: 'Wymagana praca',
    boost: 'Podanie {{item}} przyspiesza konwersję ×{{mult}}',
    poolCount: '{{count}} możliwych przedmiotów',
    rolls: '{{count}} losowań',
    convertAt: 'Konwertowane w',
    note: 'Każde losowanie odbywa się niezależnie; wiersze z wieloma losowaniami pokazują szansę na co najmniej jedno trafienie. Przedmioty w puli dzielą losowanie według wagi.',
  },
  'pt-BR': {
    title: 'Resultados da conversão',
    output: 'Resultado',
    work: 'Trabalho necessário',
    boost: 'Fornecer {{item}} acelera a conversão ×{{mult}}',
    poolCount: '{{count}} itens possíveis',
    rolls: '{{count}} sorteios',
    convertAt: 'Convertido em',
    note: 'Cada sorteio acontece de forma independente; linhas com vários sorteios mostram a chance de acertar pelo menos uma vez. Itens de um grupo compartilham o sorteio conforme o peso.',
  },
  'ru-RU': {
    title: 'Результаты преобразования',
    output: 'Результат',
    work: 'Требуемая работа',
    boost: 'Подача {{item}} ускоряет преобразование ×{{mult}}',
    poolCount: 'Возможных предметов: {{count}}',
    rolls: 'Бросков: {{count}}',
    convertAt: 'Преобразуется в',
    note: 'Каждый бросок происходит независимо; строки с несколькими бросками показывают шанс хотя бы одного попадания. Предметы в пуле делят бросок по весу.',
  },
  'th-TH': {
    title: 'ผลลัพธ์การแปลง',
    output: 'ผลลัพธ์',
    work: 'ปริมาณงานที่ต้องใช้',
    boost: 'ให้ {{item}} จะเร่งความเร็วการแปลง ×{{mult}}',
    poolCount: 'ไอเทมที่เป็นไปได้ {{count}} ชนิด',
    rolls: 'สุ่ม {{count}} ครั้ง',
    convertAt: 'แปลงได้ที่',
    note: 'การสุ่มแต่ละครั้งเกิดขึ้นอย่างอิสระ แถวที่สุ่มหลายครั้งจะแสดงโอกาสที่จะได้อย่างน้อยหนึ่งครั้ง ไอเทมในกลุ่มเดียวกันแบ่งโอกาสตามน้ำหนัก',
  },
  'tr-TR': {
    title: 'Dönüştürme Çıktıları',
    output: 'Çıktı',
    work: 'Gerekli iş',
    boost: '{{item}} verilirse dönüştürme ×{{mult}} hızlanır',
    poolCount: '{{count}} olası eşya',
    rolls: '{{count}} çekiliş',
    convertAt: 'Dönüştürüldüğü yer',
    note: 'Her çekiliş bağımsız yapılır; birden çok çekilişli satırlar en az bir kez isabet şansını gösterir. Bir havuzdaki eşyalar çekilişi ağırlığa göre paylaşır.',
  },
  'vi-VN': {
    title: 'Sản phẩm chuyển đổi',
    output: 'Sản phẩm',
    work: 'Công việc cần thiết',
    boost: 'Cung cấp {{item}} giúp chuyển đổi nhanh ×{{mult}}',
    poolCount: '{{count}} vật phẩm có thể nhận',
    rolls: '{{count}} lượt quay',
    convertAt: 'Chuyển đổi tại',
    note: 'Mỗi lượt quay diễn ra độc lập; hàng có nhiều lượt quay hiển thị tỉ lệ trúng ít nhất một lần. Vật phẩm trong cùng nhóm chia tỉ lệ theo trọng số.',
  },
  'zh-CN': {
    title: '转换产出',
    output: '产出',
    work: '所需工作量',
    boost: '投喂{{item}}可使转换速度 ×{{mult}}',
    poolCount: '可能产出 {{count}} 种物品',
    rolls: '{{count}} 次抽取',
    convertAt: '转换设施',
    note: '每次抽取按所示概率独立进行；含多次抽取的行显示至少命中一次的概率；同一抽取池内的物品按权重分摊概率。',
  },
  'zh-TW': {
    title: '轉換產出',
    output: '產出',
    work: '所需工作量',
    boost: '投餵{{item}}可使轉換速度 ×{{mult}}',
    poolCount: '可能產出 {{count}} 種物品',
    rolls: '{{count}} 次抽取',
    convertAt: '轉換設施',
    note: '每次抽取依所示機率獨立進行；含多次抽取的列顯示至少命中一次的機率；同一抽取池內的物品按權重分攤機率。',
  },
}

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
  /** Multi-roll subtext: "{{count}} independent rolls". */
  rolls: string
  /** Multi-roll yield hint: "up to {{count}} drops". */
  upTo: string
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
    rolls: '{{count}} independent rolls',
    upTo: 'up to {{count}} drops',
    convertAt: 'Converted at',
    note: 'Every roll is independent. A multi-roll row is drawn once per roll at the chances listed, so it can hit several times per conversion (duplicates included); its percentage is the chance of at least one hit. Within a pool, one item is drawn by weight.',
  },
  'de-DE': {
    title: 'Umwandlungserträge',
    output: 'Ertrag',
    work: 'Benötigte Arbeit',
    boost: '{{item}} verfüttern beschleunigt die Umwandlung ×{{mult}}',
    poolCount: '{{count}} mögliche Items',
    rolls: '{{count}} unabhängige Würfe',
    upTo: 'bis zu {{count}} Drops',
    convertAt: 'Umgewandelt bei',
    note: 'Jeder Wurf ist unabhängig. Eine Zeile mit mehreren Würfen wird pro Wurf einzeln ausgelost und kann pro Umwandlung mehrfach treffen (auch doppelt); ihr Prozentwert ist die Chance auf mindestens einen Treffer. Innerhalb eines Pools wird ein Item nach Gewicht gezogen.',
  },
  'es-ES': {
    title: 'Resultados de conversión',
    output: 'Resultado',
    work: 'Trabajo necesario',
    boost: 'Suministrar {{item}} acelera la conversión ×{{mult}}',
    poolCount: '{{count}} objetos posibles',
    rolls: '{{count}} tiradas independientes',
    upTo: 'hasta {{count}} premios',
    convertAt: 'Se convierte en',
    note: 'Cada tirada es independiente. Una fila con varias tiradas se sortea una vez por tirada con las probabilidades indicadas, así que puede acertar varias veces por conversión (incluso repetidos); su porcentaje es la probabilidad de acertar al menos una vez. Dentro de un grupo se extrae un objeto según su peso.',
  },
  'es-MX': {
    title: 'Resultados de conversión',
    output: 'Resultado',
    work: 'Trabajo necesario',
    boost: 'Suministrar {{item}} acelera la conversión ×{{mult}}',
    poolCount: '{{count}} objetos posibles',
    rolls: '{{count}} tiradas independientes',
    upTo: 'hasta {{count}} premios',
    convertAt: 'Se convierte en',
    note: 'Cada tirada es independiente. Una fila con varias tiradas se sortea una vez por tirada con las probabilidades indicadas, así que puede acertar varias veces por conversión (incluso repetidos); su porcentaje es la probabilidad de acertar al menos una vez. Dentro de un grupo se extrae un objeto según su peso.',
  },
  'fr-FR': {
    title: 'Produits de conversion',
    output: 'Produit',
    work: 'Travail requis',
    boost: 'Donner {{item}} accélère la conversion ×{{mult}}',
    poolCount: '{{count}} objets possibles',
    rolls: '{{count}} tirages indépendants',
    upTo: 'jusqu’à {{count}} gains',
    convertAt: 'Converti à',
    note: 'Chaque tirage est indépendant. Une ligne à plusieurs tirages est tirée une fois par tirage aux chances indiquées : elle peut donc réussir plusieurs fois par conversion (doublons possibles) ; son pourcentage est la chance d’au moins une réussite. Au sein d’un lot, un objet est tiré selon son poids.',
  },
  'id-ID': {
    title: 'Hasil Konversi',
    output: 'Hasil',
    work: 'Kerja yang dibutuhkan',
    boost: 'Memberikan {{item}} mempercepat konversi ×{{mult}}',
    poolCount: '{{count}} item yang mungkin',
    rolls: '{{count}} undian independen',
    upTo: 'hingga {{count}} hadiah',
    convertAt: 'Dikonversi di',
    note: 'Setiap undian berdiri sendiri. Baris dengan beberapa undian diundi sekali per undian dengan peluang yang tertera, jadi bisa berhasil beberapa kali per konversi (termasuk duplikat); persentasenya adalah peluang minimal satu kali berhasil. Dalam satu kelompok, satu item diundi menurut bobot.',
  },
  'it-IT': {
    title: 'Prodotti della conversione',
    output: 'Prodotto',
    work: 'Lavoro richiesto',
    boost: 'Fornire {{item}} accelera la conversione ×{{mult}}',
    poolCount: '{{count}} oggetti possibili',
    rolls: '{{count}} estrazioni indipendenti',
    upTo: 'fino a {{count}} premi',
    convertAt: 'Convertito presso',
    note: 'Ogni estrazione è indipendente. Una riga con più estrazioni viene estratta una volta per estrazione con le probabilità indicate, quindi può riuscire più volte per conversione (anche doppioni); la sua percentuale è la probabilità di almeno un successo. All’interno di un gruppo un oggetto viene estratto in base al peso.',
  },
  'ja-JP': {
    title: '変換で得られるもの',
    output: '産出',
    work: '必要作業量',
    boost: '{{item}}を与えると変換速度が×{{mult}}になります',
    poolCount: '候補アイテム {{count}} 種',
    rolls: '独立した抽選 {{count}} 回',
    upTo: '最大 {{count}} 個',
    convertAt: '変換施設',
    note: '各抽選は独立しています。複数回抽選の行は表示された確率で1回ずつ抽選され、1回の変換で複数回当たることもあります（重複あり）。表示のパーセントは1回以上当たる確率です。同じ抽選内では重みに応じて1つのアイテムが選ばれます。',
  },
  'ko-KR': {
    title: '변환 산출물',
    output: '산출물',
    work: '필요 작업량',
    boost: '{{item}}을(를) 공급하면 변환 속도가 ×{{mult}}가 됩니다',
    poolCount: '가능한 아이템 {{count}}종',
    rolls: '독립 추첨 {{count}}회',
    upTo: '최대 {{count}}개',
    convertAt: '변환 시설',
    note: '각 추첨은 독립적으로 진행됩니다. 여러 번 추첨하는 행은 표시된 확률로 매번 따로 추첨되어 한 번의 변환에서 여러 번 당첨될 수 있습니다(중복 포함). 표시된 퍼센트는 1회 이상 당첨될 확률입니다. 같은 추첨 풀에서는 가중치에 따라 아이템 하나가 선택됩니다.',
  },
  'pl-PL': {
    title: 'Wyniki konwersji',
    output: 'Wynik',
    work: 'Wymagana praca',
    boost: 'Podanie {{item}} przyspiesza konwersję ×{{mult}}',
    poolCount: '{{count}} możliwych przedmiotów',
    rolls: '{{count}} niezależnych losowań',
    upTo: 'do {{count}} nagród',
    convertAt: 'Konwertowane w',
    note: 'Każde losowanie jest niezależne. Wiersz z wieloma losowaniami losuje się raz na losowanie z podanymi szansami, więc może trafić kilka razy na konwersję (także duplikaty); jego procent to szansa na co najmniej jedno trafienie. W obrębie puli przedmiot jest losowany według wagi.',
  },
  'pt-BR': {
    title: 'Resultados da conversão',
    output: 'Resultado',
    work: 'Trabalho necessário',
    boost: 'Fornecer {{item}} acelera a conversão ×{{mult}}',
    poolCount: '{{count}} itens possíveis',
    rolls: '{{count}} sorteios independentes',
    upTo: 'até {{count}} prêmios',
    convertAt: 'Convertido em',
    note: 'Cada sorteio é independente. Uma linha com vários sorteios é sorteada uma vez por sorteio com as chances mostradas, podendo acertar várias vezes por conversão (inclusive repetidos); sua porcentagem é a chance de acertar pelo menos uma vez. Dentro de um grupo, um item é sorteado pelo peso.',
  },
  'ru-RU': {
    title: 'Результаты преобразования',
    output: 'Результат',
    work: 'Требуемая работа',
    boost: 'Подача {{item}} ускоряет преобразование ×{{mult}}',
    poolCount: 'Возможных предметов: {{count}}',
    rolls: 'Независимых бросков: {{count}}',
    upTo: 'до {{count}} наград',
    convertAt: 'Преобразуется в',
    note: 'Каждый бросок независим. Строка с несколькими бросками разыгрывается отдельно на каждый бросок с указанными шансами, поэтому за одно преобразование может выпасть несколько раз (в том числе повторно); её процент — шанс хотя бы одного попадания. Внутри пула предмет выбирается по весу.',
  },
  'th-TH': {
    title: 'ผลลัพธ์การแปลง',
    output: 'ผลลัพธ์',
    work: 'ปริมาณงานที่ต้องใช้',
    boost: 'ให้ {{item}} จะเร่งความเร็วการแปลง ×{{mult}}',
    poolCount: 'ไอเทมที่เป็นไปได้ {{count}} ชนิด',
    rolls: 'สุ่มอิสระ {{count}} ครั้ง',
    upTo: 'ได้สูงสุด {{count}} ชิ้น',
    convertAt: 'แปลงได้ที่',
    note: 'การสุ่มแต่ละครั้งเป็นอิสระต่อกัน แถวที่สุ่มหลายครั้งจะสุ่มทีละครั้งตามโอกาสที่แสดง จึงอาจได้หลายครั้งต่อการแปลงหนึ่งครั้ง (ซ้ำกันได้) เปอร์เซ็นต์ที่แสดงคือโอกาสได้อย่างน้อยหนึ่งครั้ง ภายในกลุ่มเดียวกันจะสุ่มไอเทมหนึ่งชิ้นตามน้ำหนัก',
  },
  'tr-TR': {
    title: 'Dönüştürme Çıktıları',
    output: 'Çıktı',
    work: 'Gerekli iş',
    boost: '{{item}} verilirse dönüştürme ×{{mult}} hızlanır',
    poolCount: '{{count}} olası eşya',
    rolls: '{{count}} bağımsız çekiliş',
    upTo: 'en fazla {{count}} ödül',
    convertAt: 'Dönüştürüldüğü yer',
    note: 'Her çekiliş bağımsızdır. Birden çok çekilişli bir satır, listelenen şanslarla her çekiliş için ayrı çekilir; bu yüzden bir dönüştürmede birden çok kez (tekrarlar dahil) isabet edebilir. Yüzdesi en az bir isabet şansıdır. Bir havuz içinde eşya ağırlığa göre çekilir.',
  },
  'vi-VN': {
    title: 'Sản phẩm chuyển đổi',
    output: 'Sản phẩm',
    work: 'Công việc cần thiết',
    boost: 'Cung cấp {{item}} giúp chuyển đổi nhanh ×{{mult}}',
    poolCount: '{{count}} vật phẩm có thể nhận',
    rolls: '{{count}} lượt quay độc lập',
    upTo: 'tối đa {{count}} phần thưởng',
    convertAt: 'Chuyển đổi tại',
    note: 'Mỗi lượt quay là độc lập. Hàng có nhiều lượt quay được quay riêng từng lượt theo tỉ lệ liệt kê, nên mỗi lần chuyển đổi có thể trúng nhiều lần (kể cả trùng lặp); phần trăm hiển thị là tỉ lệ trúng ít nhất một lần. Trong một nhóm, vật phẩm được chọn theo trọng số.',
  },
  'zh-CN': {
    title: '转换产出',
    output: '产出',
    work: '所需工作量',
    boost: '投喂{{item}}可使转换速度 ×{{mult}}',
    poolCount: '可能产出 {{count}} 种物品',
    rolls: '独立抽取 {{count}} 次',
    upTo: '最多可获得 {{count}} 份',
    convertAt: '转换设施',
    note: '每次抽取相互独立。多次抽取的行每转换一次会按所列概率逐次抽取，因此可能命中多次（可重复获得）；所示百分比为至少命中一次的概率。同一抽取池内按权重抽中一件物品。',
  },
  'zh-TW': {
    title: '轉換產出',
    output: '產出',
    work: '所需工作量',
    boost: '投餵{{item}}可使轉換速度 ×{{mult}}',
    poolCount: '可能產出 {{count}} 種物品',
    rolls: '獨立抽取 {{count}} 次',
    upTo: '最多可獲得 {{count}} 份',
    convertAt: '轉換設施',
    note: '每次抽取相互獨立。多次抽取的列每轉換一次會依所列機率逐次抽取，因此可能命中多次（可重複獲得）；所示百分比為至少命中一次的機率。同一抽取池內按權重抽中一件物品。',
  },
}

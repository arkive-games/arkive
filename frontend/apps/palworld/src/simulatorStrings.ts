import type { Language } from './i18n'

// Stat-simulator strings, merged into the `translation` namespace under a
// `sim` key (see i18n.ts). Game-derived terms follow the game's own text
// tables via the data-repo locales: Statue of Power (BuildableGoddessStatue),
// souls (PalUpgradeStone items), awakening (PalAwakening_* crystals), the
// condenser (CharacterRankUp) and trust ranks (pal.friendshipNote terms).
// The Attack row label reuses `pal.stat.shotAttack` directly.
export interface SimStrings {
  title: string
  caption: string
  pickPal: string
  /** Prefix of the species base-value line shown next to the picker. */
  base: string
  /** Forward mode: enhancements + IVs → displayed stats. */
  modeCalc: string
  /** Inverse mode: displayed stats → hidden IVs. */
  modeSolve: string
  level: string
  /** Condenser star rank 0–4. */
  stars: string
  /** Trust (friendship) rank 0–10. */
  bond: string
  awakening: string
  /** Statue-of-Power soul ranks group title. */
  souls: string
  /** IV sliders group title (forward mode). */
  ivs: string
  /** Observed-stats group title (inverse mode). */
  observed: string
  /** Results-table column headers: stat name + the three truncation stages. */
  stat: string
  stageLevel: string
  stageCondense: string
  stageFinal: string
  stageNote: string
  solvedIvs: string
  /** Shown when no IV 0–100 reproduces the entered stat. */
  noMatch: string
  /** {{craft}} = expected work speed for the current settings. */
  solveNote: string
}

export const SIM_STRINGS: Record<Language, SimStrings> = {
  'en-US': {
    title: 'Stat Simulator',
    caption:
      'Compute the exact in-game stats of any pal from its enhancements — or enter the displayed stats to reveal the hidden IVs (talents).',
    pickPal: 'Select a pal…',
    base: 'base',
    modeCalc: 'Calculate stats',
    modeSolve: 'Find hidden IVs',
    level: 'Level',
    stars: 'Condense stars',
    bond: 'Trust rank',
    awakening: 'Awakening',
    souls: 'Soul ranks (Statue of Power)',
    ivs: 'IVs (hidden talents)',
    observed: 'Displayed stats (from the game)',
    stat: 'Stat',
    stageLevel: 'Level + IV',
    stageCondense: 'Condensed',
    stageFinal: 'Final',
    stageNote:
      'Each stage is truncated before the next multiplier, exactly as the game computes it. Work speed ignores level and IVs.',
    solvedIvs: 'Solved IVs',
    noMatch: 'no match',
    solveNote:
      'Set level, stars, souls, trust rank and awakening to match the pal, then enter its displayed stats. “No match” means one of those settings is off. Expected work speed with these settings: {{craft}}.',
  },
  'de-DE': {
    title: 'Werte-Simulator',
    caption:
      'Berechne die exakten Spielwerte eines Pals aus seinen Verstärkungen – oder gib die angezeigten Werte ein, um die versteckten IVs (Talente) zu ermitteln.',
    pickPal: 'Pal auswählen…',
    base: 'Basis',
    modeCalc: 'Werte berechnen',
    modeSolve: 'Versteckte IVs finden',
    level: 'Stufe',
    stars: 'Entsafter-Sterne',
    bond: 'Zutraulichkeits-Rang',
    awakening: 'Erweckung',
    souls: 'Seelen-Ränge (Statue der Kraft)',
    ivs: 'IVs (versteckte Talente)',
    observed: 'Angezeigte Werte (aus dem Spiel)',
    stat: 'Wert',
    stageLevel: 'Stufe + IV',
    stageCondense: 'Mit Sternen',
    stageFinal: 'Endwert',
    stageNote:
      'Jede Stufe wird vor dem nächsten Multiplikator abgerundet, genau wie im Spiel. Das Arbeitstempo ignoriert Stufe und IVs.',
    solvedIvs: 'Ermittelte IVs',
    noMatch: 'kein Treffer',
    solveNote:
      'Stelle Stufe, Sterne, Seelen, Zutraulichkeits-Rang und Erweckung passend zum Pal ein und gib dann seine angezeigten Werte ein. „Kein Treffer“ bedeutet, dass eine dieser Einstellungen nicht stimmt. Erwartetes Arbeitstempo mit diesen Einstellungen: {{craft}}.',
  },
  'es-ES': {
    title: 'Simulador de estadísticas',
    caption:
      'Calcula las estadísticas exactas de cualquier pal en el juego a partir de sus mejoras, o introduce las estadísticas mostradas para revelar los IVs ocultos (talentos).',
    pickPal: 'Selecciona un pal…',
    base: 'base',
    modeCalc: 'Calcular estadísticas',
    modeSolve: 'Hallar IVs ocultos',
    level: 'Nivel',
    stars: 'Estrellas de concentrado',
    bond: 'Rango de confianza',
    awakening: 'Despertar',
    souls: 'Rangos de espíritu (Estatua de Poder)',
    ivs: 'IVs (talentos ocultos)',
    observed: 'Estadísticas mostradas (del juego)',
    stat: 'Estadística',
    stageLevel: 'Nivel + IV',
    stageCondense: 'Concentrado',
    stageFinal: 'Final',
    stageNote:
      'Cada etapa se trunca antes del siguiente multiplicador, exactamente como lo calcula el juego. La velocidad de trabajo ignora el nivel y los IVs.',
    solvedIvs: 'IVs resueltos',
    noMatch: 'sin coincidencia',
    solveNote:
      'Ajusta nivel, estrellas, espíritus, rango de confianza y despertar para que coincidan con el pal, y luego introduce sus estadísticas mostradas. «Sin coincidencia» significa que alguno de esos ajustes está mal. Velocidad de trabajo esperada con estos ajustes: {{craft}}.',
  },
  'es-MX': {
    title: 'Simulador de estadísticas',
    caption:
      'Calcula las estadísticas exactas de cualquier pal en el juego a partir de sus mejoras, o ingresa las estadísticas mostradas para revelar los IVs ocultos (talentos).',
    pickPal: 'Selecciona un pal…',
    base: 'base',
    modeCalc: 'Calcular estadísticas',
    modeSolve: 'Hallar IVs ocultos',
    level: 'Nivel',
    stars: 'Estrellas de concentrado',
    bond: 'Rango de confianza',
    awakening: 'Despertar',
    souls: 'Rangos de alma (Estatua de Poder)',
    ivs: 'IVs (talentos ocultos)',
    observed: 'Estadísticas mostradas (del juego)',
    stat: 'Estadística',
    stageLevel: 'Nivel + IV',
    stageCondense: 'Concentrado',
    stageFinal: 'Final',
    stageNote:
      'Cada etapa se trunca antes del siguiente multiplicador, exactamente como lo calcula el juego. La velocidad de trabajo ignora el nivel y los IVs.',
    solvedIvs: 'IVs resueltos',
    noMatch: 'sin coincidencia',
    solveNote:
      'Ajusta nivel, estrellas, almas, rango de confianza y despertar para que coincidan con el pal, y luego ingresa sus estadísticas mostradas. «Sin coincidencia» significa que alguno de esos ajustes está mal. Velocidad de trabajo esperada con estos ajustes: {{craft}}.',
  },
  'fr-FR': {
    title: 'Simulateur de statistiques',
    caption:
      'Calculez les statistiques exactes en jeu de n’importe quel pal à partir de ses améliorations — ou saisissez les statistiques affichées pour révéler les IV cachés (talents).',
    pickPal: 'Sélectionner un pal…',
    base: 'base',
    modeCalc: 'Calculer les statistiques',
    modeSolve: 'Trouver les IV cachés',
    level: 'Niveau',
    stars: 'Étoiles de condensation',
    bond: 'Rang de confiance',
    awakening: 'Éveil',
    souls: 'Rangs d’âme (Statue de puissance)',
    ivs: 'IV (talents cachés)',
    observed: 'Statistiques affichées (en jeu)',
    stat: 'Statistique',
    stageLevel: 'Niveau + IV',
    stageCondense: 'Condensé',
    stageFinal: 'Final',
    stageNote:
      'Chaque étape est tronquée avant le multiplicateur suivant, exactement comme dans le jeu. La vitesse de travail ignore le niveau et les IV.',
    solvedIvs: 'IV résolus',
    noMatch: 'aucune correspondance',
    solveNote:
      'Réglez le niveau, les étoiles, les âmes, le rang de confiance et l’éveil pour correspondre au pal, puis saisissez ses statistiques affichées. « Aucune correspondance » signifie qu’un de ces réglages est incorrect. Vitesse de travail attendue avec ces réglages : {{craft}}.',
  },
  'id-ID': {
    title: 'Simulator Statistik',
    caption:
      'Hitung statistik persis dalam game untuk pal mana pun dari peningkatannya — atau masukkan statistik yang ditampilkan untuk mengungkap IV tersembunyi (bakat).',
    pickPal: 'Pilih pal…',
    base: 'dasar',
    modeCalc: 'Hitung statistik',
    modeSolve: 'Cari IV tersembunyi',
    level: 'Level',
    stars: 'Bintang ekstraksi',
    bond: 'Peringkat kepercayaan',
    awakening: 'Pelatihan Elemen',
    souls: 'Peringkat Batu Pal (Patung Kekuatan)',
    ivs: 'IV (bakat tersembunyi)',
    observed: 'Statistik yang ditampilkan (dari game)',
    stat: 'Statistik',
    stageLevel: 'Level + IV',
    stageCondense: 'Ekstraksi',
    stageFinal: 'Akhir',
    stageNote:
      'Setiap tahap dibulatkan ke bawah sebelum pengali berikutnya, persis seperti perhitungan game. Kecepatan Kerja mengabaikan level dan IV.',
    solvedIvs: 'IV yang ditemukan',
    noMatch: 'tidak cocok',
    solveNote:
      'Atur level, bintang, Batu Pal, peringkat kepercayaan, dan Pelatihan Elemen agar sesuai dengan pal, lalu masukkan statistik yang ditampilkan. “Tidak cocok” berarti salah satu pengaturan itu keliru. Kecepatan Kerja yang diharapkan dengan pengaturan ini: {{craft}}.',
  },
  'it-IT': {
    title: 'Simulatore di statistiche',
    caption:
      'Calcola le statistiche esatte in gioco di qualsiasi pal a partire dai suoi potenziamenti — oppure inserisci le statistiche mostrate per scoprire gli IV nascosti (talenti).',
    pickPal: 'Seleziona un pal…',
    base: 'base',
    modeCalc: 'Calcola statistiche',
    modeSolve: 'Trova IV nascosti',
    level: 'Livello',
    stars: 'Stelle di potenziamento',
    bond: 'Grado di fiducia',
    awakening: 'Risveglio',
    souls: 'Gradi anima (Statua del potere)',
    ivs: 'IV (talenti nascosti)',
    observed: 'Statistiche mostrate (dal gioco)',
    stat: 'Statistica',
    stageLevel: 'Livello + IV',
    stageCondense: 'Potenziato',
    stageFinal: 'Finale',
    stageNote:
      'Ogni fase viene troncata prima del moltiplicatore successivo, esattamente come calcola il gioco. La velocità di lavoro ignora livello e IV.',
    solvedIvs: 'IV risolti',
    noMatch: 'nessuna corrispondenza',
    solveNote:
      'Imposta livello, stelle, anime, grado di fiducia e risveglio in modo che corrispondano al pal, poi inserisci le sue statistiche mostrate. «Nessuna corrispondenza» significa che una di queste impostazioni è sbagliata. Velocità di lavoro attesa con queste impostazioni: {{craft}}.',
  },
  'ja-JP': {
    title: 'ステータスシミュレーター',
    caption:
      '強化状態からパルのゲーム内ステータスを正確に計算できます。表示ステータスを入力すれば、隠しステータスの個体値も逆算できます。',
    pickPal: 'パルを選択…',
    base: '基礎値',
    modeCalc: 'ステータス計算',
    modeSolve: '個体値を逆算',
    level: 'レベル',
    stars: '濃縮ランク（星）',
    bond: '信頼度ランク',
    awakening: '覚醒',
    souls: 'ソウル強化（力の石像）',
    ivs: '個体値（隠しステータス）',
    observed: 'ゲーム内の表示ステータス',
    stat: 'ステータス',
    stageLevel: 'レベル+個体値',
    stageCondense: '濃縮後',
    stageFinal: '最終値',
    stageNote:
      '各段階はゲームと同じく、次の倍率を掛ける前に端数を切り捨てます。作業速度はレベルと個体値の影響を受けません。',
    solvedIvs: '逆算した個体値',
    noMatch: '一致なし',
    solveNote:
      'レベル・星・ソウル・信頼度ランク・覚醒をそのパルに合わせてから、表示ステータスを入力してください。「一致なし」の場合は、いずれかの設定が違っています。この設定での作業速度の理論値: {{craft}}。',
  },
  'ko-KR': {
    title: '스탯 시뮬레이터',
    caption:
      '강화 상태로부터 팰의 게임 내 스탯을 정확히 계산하거나, 표시된 스탯을 입력해 숨겨진 개체값을 역산할 수 있습니다.',
    pickPal: '팰 선택…',
    base: '기본값',
    modeCalc: '스탯 계산',
    modeSolve: '개체값 역산',
    level: '레벨',
    stars: '농축 랭크(별)',
    bond: '신뢰도 랭크',
    awakening: '각성',
    souls: '영혼 강화 (힘의 석상)',
    ivs: '개체값 (숨겨진 능력치)',
    observed: '게임에 표시된 스탯',
    stat: '스탯',
    stageLevel: '레벨+개체값',
    stageCondense: '농축 후',
    stageFinal: '최종',
    stageNote:
      '각 단계는 게임과 동일하게 다음 배율을 곱하기 전에 소수점을 버립니다. 작업 속도는 레벨과 개체값의 영향을 받지 않습니다.',
    solvedIvs: '역산된 개체값',
    noMatch: '일치 없음',
    solveNote:
      '레벨·별·영혼·신뢰도 랭크·각성을 해당 팰과 동일하게 맞춘 뒤 표시된 스탯을 입력하세요. “일치 없음”은 이 설정 중 하나가 틀렸다는 뜻입니다. 이 설정에서 예상되는 작업 속도: {{craft}}.',
  },
  'pl-PL': {
    title: 'Symulator statystyk',
    caption:
      'Oblicz dokładne statystyki dowolnego Pala w grze na podstawie jego ulepszeń — albo wpisz wyświetlane statystyki, aby poznać ukryte IV (talenty).',
    pickPal: 'Wybierz Pala…',
    base: 'baza',
    modeCalc: 'Oblicz statystyki',
    modeSolve: 'Znajdź ukryte IV',
    level: 'Poziom',
    stars: 'Gwiazdki kondensacji',
    bond: 'Ranga zaufania',
    awakening: 'Przebudzenie',
    souls: 'Rangi dusz (Posąg Mocy)',
    ivs: 'IV (ukryte talenty)',
    observed: 'Wyświetlane statystyki (z gry)',
    stat: 'Statystyka',
    stageLevel: 'Poziom + IV',
    stageCondense: 'Po kondensacji',
    stageFinal: 'Ostateczna',
    stageNote:
      'Każdy etap jest zaokrąglany w dół przed kolejnym mnożnikiem, dokładnie tak jak liczy to gra. Tempo pracy ignoruje poziom i IV.',
    solvedIvs: 'Wyznaczone IV',
    noMatch: 'brak dopasowania',
    solveNote:
      'Ustaw poziom, gwiazdki, dusze, rangę zaufania i przebudzenie zgodnie z Palem, a następnie wpisz jego wyświetlane statystyki. „Brak dopasowania” oznacza, że któreś z tych ustawień się nie zgadza. Oczekiwane tempo pracy przy tych ustawieniach: {{craft}}.',
  },
  'pt-BR': {
    title: 'Simulador de atributos',
    caption:
      'Calcule os atributos exatos de qualquer Pal no jogo a partir dos seus aprimoramentos — ou insira os atributos exibidos para revelar os IVs ocultos (talentos).',
    pickPal: 'Selecione um pal…',
    base: 'base',
    modeCalc: 'Calcular atributos',
    modeSolve: 'Encontrar IVs ocultos',
    level: 'Nível',
    stars: 'Estrelas de condensação',
    bond: 'Nível de Confiança',
    awakening: 'Despertar',
    souls: 'Níveis de alma (Estátua da Força)',
    ivs: 'IVs (talentos ocultos)',
    observed: 'Atributos exibidos (do jogo)',
    stat: 'Atributo',
    stageLevel: 'Nível + IV',
    stageCondense: 'Condensado',
    stageFinal: 'Final',
    stageNote:
      'Cada etapa é truncada antes do próximo multiplicador, exatamente como o jogo calcula. A velocidade de trabalho ignora nível e IVs.',
    solvedIvs: 'IVs resolvidos',
    noMatch: 'sem correspondência',
    solveNote:
      'Ajuste nível, estrelas, almas, nível de Confiança e despertar para corresponder ao Pal e então insira os atributos exibidos. “Sem correspondência” significa que uma dessas configurações está errada. Velocidade de trabalho esperada com estas configurações: {{craft}}.',
  },
  'ru-RU': {
    title: 'Симулятор характеристик',
    caption:
      'Рассчитайте точные игровые характеристики любого пала по его усилениям — или введите отображаемые характеристики, чтобы узнать скрытые IV (таланты).',
    pickPal: 'Выберите пала…',
    base: 'база',
    modeCalc: 'Рассчитать характеристики',
    modeSolve: 'Найти скрытые IV',
    level: 'Уровень',
    stars: 'Звёзды конденсации',
    bond: 'Ранг доверия',
    awakening: 'Пробуждение',
    souls: 'Ранги душ (Монумент Силы)',
    ivs: 'IV (скрытые таланты)',
    observed: 'Отображаемые характеристики (из игры)',
    stat: 'Характеристика',
    stageLevel: 'Уровень + IV',
    stageCondense: 'После конденсации',
    stageFinal: 'Итог',
    stageNote:
      'Каждый этап округляется вниз перед следующим множителем — ровно так же считает игра. Скорость работы не зависит от уровня и IV.',
    solvedIvs: 'Найденные IV',
    noMatch: 'нет совпадения',
    solveNote:
      'Выставьте уровень, звёзды, души, ранг доверия и пробуждение так же, как у пала, затем введите его отображаемые характеристики. «Нет совпадения» означает, что одна из настроек неверна. Ожидаемая скорость работы при этих настройках: {{craft}}.',
  },
  'th-TH': {
    title: 'เครื่องคำนวณค่าสถานะ',
    caption:
      'คำนวณค่าสถานะในเกมที่แม่นยำของพัลตัวใดก็ได้จากการเสริมพลังของมัน — หรือกรอกค่าสถานะที่แสดงเพื่อหาค่า IV ที่ซ่อนอยู่ (พรสวรรค์)',
    pickPal: 'เลือกพัล…',
    base: 'ค่าพื้นฐาน',
    modeCalc: 'คำนวณค่าสถานะ',
    modeSolve: 'หา IV ที่ซ่อนอยู่',
    level: 'เลเวล',
    stars: 'ดาวควบแน่น',
    bond: 'ระดับความเชื่อใจ',
    awakening: 'ความตื่นรู้',
    souls: 'ระดับโซล (รูปปั้นหินแห่งพลัง)',
    ivs: 'IV (พรสวรรค์ที่ซ่อนอยู่)',
    observed: 'ค่าสถานะที่แสดง (จากในเกม)',
    stat: 'ค่าสถานะ',
    stageLevel: 'เลเวล + IV',
    stageCondense: 'หลังควบแน่น',
    stageFinal: 'สุดท้าย',
    stageNote:
      'แต่ละขั้นจะถูกปัดเศษลงก่อนคูณตัวคูณถัดไป เหมือนที่เกมคำนวณทุกประการ ความเร็วในการทำงานไม่ขึ้นกับเลเวลและ IV',
    solvedIvs: 'IV ที่คำนวณได้',
    noMatch: 'ไม่ตรงกัน',
    solveNote:
      'ตั้งเลเวล ดาว โซล ระดับความเชื่อใจ และความตื่นรู้ให้ตรงกับพัลตัวนั้น แล้วกรอกค่าสถานะที่แสดง หากขึ้น “ไม่ตรงกัน” แปลว่าการตั้งค่าบางอย่างไม่ถูกต้อง ความเร็วในการทำงานที่คาดไว้จากการตั้งค่านี้: {{craft}}',
  },
  'tr-TR': {
    title: 'Değer Simülatörü',
    caption:
      'Herhangi bir Pal’in oyun içi değerlerini güçlendirmelerinden tam olarak hesaplayın — ya da gösterilen değerleri girerek gizli IV’leri (yetenekleri) ortaya çıkarın.',
    pickPal: 'Bir pal seçin…',
    base: 'taban',
    modeCalc: 'Değerleri hesapla',
    modeSolve: 'Gizli IV’leri bul',
    level: 'Seviye',
    stars: 'Yoğunlaştırma yıldızları',
    bond: 'Güven seviyesi',
    awakening: 'Uyandırış',
    souls: 'Ruh seviyeleri (Güç Heykeli)',
    ivs: 'IV’ler (gizli yetenekler)',
    observed: 'Gösterilen değerler (oyundan)',
    stat: 'Değer',
    stageLevel: 'Seviye + IV',
    stageCondense: 'Yoğunlaştırılmış',
    stageFinal: 'Son',
    stageNote:
      'Her aşama, oyunun hesapladığı gibi bir sonraki çarpandan önce aşağı yuvarlanır. İş Hızı seviye ve IV’leri yok sayar.',
    solvedIvs: 'Bulunan IV’ler',
    noMatch: 'eşleşme yok',
    solveNote:
      'Seviye, yıldız, ruh, güven seviyesi ve uyandırışı Pal ile eşleşecek şekilde ayarlayın, sonra gösterilen değerlerini girin. “Eşleşme yok”, bu ayarlardan birinin yanlış olduğu anlamına gelir. Bu ayarlarla beklenen İş Hızı: {{craft}}.',
  },
  'vi-VN': {
    title: 'Trình mô phỏng chỉ số',
    caption:
      'Tính chính xác chỉ số trong game của bất kỳ Pal nào từ các nâng cấp của nó — hoặc nhập chỉ số hiển thị để tìm ra IV ẩn (tiềm năng).',
    pickPal: 'Chọn một pal…',
    base: 'cơ bản',
    modeCalc: 'Tính chỉ số',
    modeSolve: 'Tìm IV ẩn',
    level: 'Cấp',
    stars: 'Sao tinh luyện',
    bond: 'Cấp Độ Tin Cậy',
    awakening: 'Thức Tỉnh',
    souls: 'Cấp linh hồn (Tượng Đá Sức Mạnh)',
    ivs: 'IV (tiềm năng ẩn)',
    observed: 'Chỉ số hiển thị (trong game)',
    stat: 'Chỉ số',
    stageLevel: 'Cấp + IV',
    stageCondense: 'Sau tinh luyện',
    stageFinal: 'Cuối cùng',
    stageNote:
      'Mỗi giai đoạn được làm tròn xuống trước khi nhân hệ số tiếp theo, đúng như cách game tính. Tốc độ làm việc không phụ thuộc cấp và IV.',
    solvedIvs: 'IV đã giải',
    noMatch: 'không khớp',
    solveNote:
      'Đặt cấp, sao, linh hồn, cấp Độ Tin Cậy và Thức Tỉnh đúng với Pal đó, rồi nhập chỉ số hiển thị của nó. “Không khớp” nghĩa là một trong các thiết lập chưa đúng. Tốc độ làm việc dự kiến với thiết lập này: {{craft}}.',
  },
  'zh-CN': {
    title: '属性模拟器',
    caption:
      '根据强化状态精确计算任意帕鲁的游戏内属性，也可以输入游戏中显示的属性，反推隐藏的个体值（天赋）。',
    pickPal: '选择帕鲁…',
    base: '基础值',
    modeCalc: '计算属性',
    modeSolve: '反推个体值',
    level: '等级',
    stars: '浓缩星级',
    bond: '信赖度等级',
    awakening: '觉醒',
    souls: '魂强化（力量石像）',
    ivs: '个体值（隐藏天赋）',
    observed: '游戏内显示属性',
    stat: '属性',
    stageLevel: '等级+个体值',
    stageCondense: '浓缩后',
    stageFinal: '最终值',
    stageNote: '每一步都会先向下取整再乘下一个倍率，与游戏内部计算完全一致。工作速度不受等级和个体值影响。',
    solvedIvs: '反推出的个体值',
    noMatch: '无匹配',
    solveNote:
      '先把等级、星级、魂强化、信赖度等级和觉醒设置成与该帕鲁一致，再输入其显示属性。“无匹配”说明其中某项设置有误。该设置下的理论工作速度：{{craft}}。',
  },
  'zh-TW': {
    title: '屬性模擬器',
    caption:
      '根據強化狀態精確計算任意帕魯的遊戲內屬性，也可以輸入遊戲中顯示的屬性，反推隱藏的個體值（天賦）。',
    pickPal: '選擇帕魯…',
    base: '基礎值',
    modeCalc: '計算屬性',
    modeSolve: '反推個體值',
    level: '等級',
    stars: '濃縮星級',
    bond: '信賴度等級',
    awakening: '覺醒',
    souls: '魂強化（力量之像）',
    ivs: '個體值（隱藏天賦）',
    observed: '遊戲內顯示屬性',
    stat: '屬性',
    stageLevel: '等級+個體值',
    stageCondense: '濃縮後',
    stageFinal: '最終值',
    stageNote: '每一步都會先無條件捨去再乘上下一個倍率，與遊戲內部計算完全一致。工作速度不受等級與個體值影響。',
    solvedIvs: '反推出的個體值',
    noMatch: '無匹配',
    solveNote:
      '先將等級、星級、魂強化、信賴度等級與覺醒設定成與該帕魯一致，再輸入其顯示屬性。「無匹配」表示其中某項設定有誤。該設定下的理論工作速度：{{craft}}。',
  },
}

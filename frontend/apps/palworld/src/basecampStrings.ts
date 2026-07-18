import type { Language } from './i18n'

// Base-camp progression page UI chrome, merged into the `translation`
// namespace under the `basecamp` key (see i18n.ts). Building names come from
// the locale data files; this table only holds the page's own labels.
export interface BasecampStrings {
  title: string
  caption: string
  level: string
  /** Pal-worker cap column. */
  workers: string
  /** Guild base cap column. */
  bases: string
  /** Level-up task checklist column. */
  tasks: string
  /** Worker-count task chip: "{{n}} Pal workers". */
  workerTask: string
}

export const BASECAMP_STRINGS: Record<Language, BasecampStrings> = {
  'en-US': {
    title: 'Base Camp',
    caption:
      'Per base level: the Pal worker cap, how many bases your guild can hold, and the tasks to reach the next level.',
    level: 'Level',
    workers: 'Workers',
    bases: 'Bases',
    tasks: 'Level-up tasks',
    workerTask: '{{n}} Pal workers',
  },
  'de-DE': {
    title: 'Basislager',
    caption:
      'Pro Basisstufe: das Pal-Arbeiterlimit, die Anzahl der Basen deiner Gilde und die Aufgaben für die nächste Stufe.',
    level: 'Stufe',
    workers: 'Arbeiter',
    bases: 'Basen',
    tasks: 'Aufstiegsaufgaben',
    workerTask: '{{n}} Pal-Arbeiter',
  },
  'es-ES': {
    title: 'Campamento base',
    caption:
      'Por nivel de base: el límite de Pals trabajadores, cuántas bases puede tener tu gremio y las tareas para subir de nivel.',
    level: 'Nivel',
    workers: 'Trabajadores',
    bases: 'Bases',
    tasks: 'Tareas para subir de nivel',
    workerTask: '{{n}} Pals trabajadores',
  },
  'es-MX': {
    title: 'Campamento base',
    caption:
      'Por nivel de base: el límite de Pals trabajadores, cuántas bases puede tener tu gremio y las tareas para subir de nivel.',
    level: 'Nivel',
    workers: 'Trabajadores',
    bases: 'Bases',
    tasks: 'Tareas para subir de nivel',
    workerTask: '{{n}} Pals trabajadores',
  },
  'fr-FR': {
    title: 'Camp de base',
    caption:
      'Par niveau de base : la limite de Pals travailleurs, le nombre de bases de votre guilde et les tâches pour passer au niveau suivant.',
    level: 'Niveau',
    workers: 'Travailleurs',
    bases: 'Bases',
    tasks: 'Tâches de niveau',
    workerTask: '{{n}} Pals travailleurs',
  },
  'id-ID': {
    title: 'Markas',
    caption:
      'Per tingkat markas: batas Pal pekerja, jumlah markas yang dapat dimiliki guild, dan tugas untuk naik tingkat.',
    level: 'Tingkat',
    workers: 'Pekerja',
    bases: 'Markas',
    tasks: 'Tugas naik tingkat',
    workerTask: '{{n}} Pal pekerja',
  },
  'it-IT': {
    title: 'Campo base',
    caption:
      'Per livello della base: il limite di Pal lavoratori, quante basi può avere la tua gilda e i compiti per salire di livello.',
    level: 'Livello',
    workers: 'Lavoratori',
    bases: 'Basi',
    tasks: 'Compiti di livello',
    workerTask: '{{n}} Pal lavoratori',
  },
  'ja-JP': {
    title: '拠点',
    caption:
      '拠点レベルごとの働くパルの上限、ギルドが持てる拠点数、次のレベルに上げるためのタスク。',
    level: 'レベル',
    workers: '働くパル',
    bases: '拠点数',
    tasks: 'レベルアップタスク',
    workerTask: '働くパル{{n}}体',
  },
  'ko-KR': {
    title: '거점',
    caption:
      '거점 레벨별 팰 일꾼 상한, 길드가 보유할 수 있는 거점 수, 다음 레벨 달성 과제.',
    level: '레벨',
    workers: '일꾼',
    bases: '거점 수',
    tasks: '레벨 업 과제',
    workerTask: '팰 일꾼 {{n}}마리',
  },
  'pl-PL': {
    title: 'Obóz bazowy',
    caption:
      'Dla każdego poziomu bazy: limit pracujących Pali, liczba baz gildii i zadania do następnego poziomu.',
    level: 'Poziom',
    workers: 'Pracownicy',
    bases: 'Bazy',
    tasks: 'Zadania awansu',
    workerTask: '{{n}} pracujących Pali',
  },
  'pt-BR': {
    title: 'Acampamento base',
    caption:
      'Por nível de base: o limite de Pals trabalhadores, quantas bases sua guilda pode ter e as tarefas para o próximo nível.',
    level: 'Nível',
    workers: 'Trabalhadores',
    bases: 'Bases',
    tasks: 'Tarefas de nível',
    workerTask: '{{n}} Pals trabalhadores',
  },
  'ru-RU': {
    title: 'Лагерь',
    caption:
      'Для каждого уровня базы: лимит палов-работников, число баз гильдии и задания для следующего уровня.',
    level: 'Уровень',
    workers: 'Работники',
    bases: 'Базы',
    tasks: 'Задания уровня',
    workerTask: 'Палы-работники: {{n}}',
  },
  'th-TH': {
    title: 'แคมป์ฐาน',
    caption:
      'ต่อระดับฐาน: จำนวนพัลคนงานสูงสุด จำนวนฐานที่กิลด์มีได้ และภารกิจเพื่อเลื่อนระดับถัดไป',
    level: 'เลเวล',
    workers: 'คนงาน',
    bases: 'ฐาน',
    tasks: 'ภารกิจเลื่อนระดับ',
    workerTask: 'พัลคนงาน {{n}} ตัว',
  },
  'tr-TR': {
    title: 'Ana Kamp',
    caption:
      'Üs seviyesi başına: Pal işçi sınırı, loncanın sahip olabileceği üs sayısı ve sonraki seviye görevleri.',
    level: 'Seviye',
    workers: 'İşçiler',
    bases: 'Üsler',
    tasks: 'Seviye atlama görevleri',
    workerTask: '{{n}} Pal işçi',
  },
  'vi-VN': {
    title: 'Trại căn cứ',
    caption:
      'Theo từng cấp căn cứ: giới hạn Pal lao động, số căn cứ guild có thể sở hữu và nhiệm vụ lên cấp tiếp theo.',
    level: 'Cấp',
    workers: 'Lao động',
    bases: 'Căn cứ',
    tasks: 'Nhiệm vụ lên cấp',
    workerTask: '{{n}} Pal lao động',
  },
  'zh-CN': {
    title: '据点',
    caption:
      '每个据点等级：帕鲁工人上限、公会可拥有的据点数量，以及升级所需任务。',
    level: '等级',
    workers: '工人',
    bases: '据点数',
    tasks: '升级任务',
    workerTask: '{{n}} 只帕鲁工人',
  },
  'zh-TW': {
    title: '據點',
    caption:
      '每個據點等級：帕魯工人上限、公會可擁有的據點數量，以及升級所需任務。',
    level: '等級',
    workers: '工人',
    bases: '據點數',
    tasks: '升級任務',
    workerTask: '{{n}} 隻帕魯工人',
  },
}

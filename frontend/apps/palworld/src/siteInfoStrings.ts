import type { Language } from './i18n'

// Site-info / feedback strings, merged into the `translation` namespace under a
// `siteInfo` key (see i18n.ts). `contact` is present only for locales that have
// a real channel to point at — the QQ group is Chinese-only, so the other
// locales render the intro and disclaimer alone.
export interface SiteInfoStrings {
  /** Right-sidebar toggle tab text; also the popover's aria-label. */
  tab: string
  /** Heading of the intro section. */
  title: string
  /** One paragraph per entry: what the site is, then the disclaimer. */
  body: string[]
  contact?: {
    title: string
    hint: string
    /** Label above the group number, e.g. "QQ 群". */
    groupLabel: string
  }
  copy: string
  copied: string
}

const DISCLAIMER_EN = 'Not affiliated with, endorsed by, or sponsored by Pocketpair, Inc.'

export const SITE_INFO_STRINGS: Record<Language, SiteInfoStrings> = {
  'en-US': {
    tab: 'About',
    title: 'About this site',
    body: [
      'An unofficial, fan-made interactive map and database for Palworld. All game data is extracted from the game files.',
      DISCLAIMER_EN,
    ],
    copy: 'Copy',
    copied: 'Copied',
  },
  'de-DE': {
    tab: 'Info',
    title: 'Über diese Seite',
    body: [
      'Eine unofficielle, von Fans erstellte interaktive Karte und Datenbank für Palworld. Alle Spieldaten stammen aus den Spieldateien.',
      'Nicht mit Pocketpair, Inc. verbunden und weder von ihnen unterstützt noch gesponsert.',
    ],
    copy: 'Kopieren',
    copied: 'Kopiert',
  },
  'es-ES': {
    tab: 'Acerca de',
    title: 'Acerca de este sitio',
    body: [
      'Un mapa interactivo y una base de datos de Palworld no oficiales, creados por aficionados. Todos los datos se extraen de los archivos del juego.',
      'Sin afiliación, respaldo ni patrocinio de Pocketpair, Inc.',
    ],
    copy: 'Copiar',
    copied: 'Copiado',
  },
  'es-MX': {
    tab: 'Acerca de',
    title: 'Acerca de este sitio',
    body: [
      'Un mapa interactivo y una base de datos de Palworld no oficiales, hechos por fans. Todos los datos se extraen de los archivos del juego.',
      'Sin afiliación, respaldo ni patrocinio de Pocketpair, Inc.',
    ],
    copy: 'Copiar',
    copied: 'Copiado',
  },
  'fr-FR': {
    tab: 'À propos',
    title: 'À propos de ce site',
    body: [
      'Une carte interactive et une base de données non officielles pour Palworld, réalisées par des fans. Toutes les données proviennent des fichiers du jeu.',
      'Sans lien avec Pocketpair, Inc., ni approuvé ni sponsorisé par elle.',
    ],
    copy: 'Copier',
    copied: 'Copié',
  },
  'id-ID': {
    tab: 'Tentang',
    title: 'Tentang situs ini',
    body: [
      'Peta interaktif dan basis data Palworld tidak resmi yang dibuat oleh penggemar. Semua data game diambil dari file game.',
      'Tidak berafiliasi, didukung, atau disponsori oleh Pocketpair, Inc.',
    ],
    copy: 'Salin',
    copied: 'Tersalin',
  },
  'it-IT': {
    tab: 'Informazioni',
    title: 'Informazioni sul sito',
    body: [
      'Una mappa interattiva e un database non ufficiali per Palworld, creati dai fan. Tutti i dati di gioco sono estratti dai file del gioco.',
      'Non affiliato, approvato o sponsorizzato da Pocketpair, Inc.',
    ],
    copy: 'Copia',
    copied: 'Copiato',
  },
  'ja-JP': {
    tab: 'このサイトについて',
    title: 'このサイトについて',
    body: [
      'ファンが制作した非公式のパルワールド インタラクティブマップ＆データベースです。ゲームデータはすべてゲームファイルから抽出しています。',
      'Pocketpair, Inc. とは一切関係がなく、承認や後援も受けていません。',
    ],
    copy: 'コピー',
    copied: 'コピーしました',
  },
  'ko-KR': {
    tab: '소개',
    title: '사이트 소개',
    body: [
      '팬이 제작한 비공식 팰월드 인터랙티브 지도 및 데이터베이스입니다. 모든 게임 데이터는 게임 파일에서 추출했습니다.',
      'Pocketpair, Inc.와 제휴 관계가 없으며, 승인이나 후원을 받지 않았습니다.',
    ],
    copy: '복사',
    copied: '복사됨',
  },
  'pl-PL': {
    tab: 'O stronie',
    title: 'O tej stronie',
    body: [
      'Nieoficjalna, stworzona przez fanów interaktywna mapa i baza danych do Palworld. Wszystkie dane pochodzą z plików gry.',
      'Niepowiązane z Pocketpair, Inc.; bez ich poparcia ani sponsoringu.',
    ],
    copy: 'Kopiuj',
    copied: 'Skopiowano',
  },
  'pt-BR': {
    tab: 'Sobre',
    title: 'Sobre este site',
    body: [
      'Um mapa interativo e banco de dados não oficiais de Palworld, feitos por fãs. Todos os dados do jogo são extraídos dos arquivos do jogo.',
      'Sem afiliação, endosso ou patrocínio da Pocketpair, Inc.',
    ],
    copy: 'Copiar',
    copied: 'Copiado',
  },
  'ru-RU': {
    tab: 'О сайте',
    title: 'О сайте',
    body: [
      'Неофициальная фанатская интерактивная карта и база данных по Palworld. Все игровые данные извлечены из файлов игры.',
      'Не связано с Pocketpair, Inc., не одобрено и не финансируется ею.',
    ],
    copy: 'Копировать',
    copied: 'Скопировано',
  },
  'th-TH': {
    tab: 'เกี่ยวกับ',
    title: 'เกี่ยวกับเว็บไซต์นี้',
    body: [
      'แผนที่แบบอินเทอร์แอกทีฟและฐานข้อมูล Palworld ที่แฟน ๆ ทำขึ้นอย่างไม่เป็นทางการ ข้อมูลเกมทั้งหมดดึงมาจากไฟล์เกม',
      'ไม่มีความเกี่ยวข้อง ไม่ได้รับการรับรอง และไม่ได้รับการสนับสนุนจาก Pocketpair, Inc.',
    ],
    copy: 'คัดลอก',
    copied: 'คัดลอกแล้ว',
  },
  'tr-TR': {
    tab: 'Hakkında',
    title: 'Bu site hakkında',
    body: [
      'Palworld için hayranlar tarafından yapılmış resmi olmayan etkileşimli harita ve veri tabanı. Tüm oyun verileri oyun dosyalarından çıkarılmıştır.',
      'Pocketpair, Inc. ile bağlantılı değildir; onaylanmamış ve desteklenmemiştir.',
    ],
    copy: 'Kopyala',
    copied: 'Kopyalandı',
  },
  'vi-VN': {
    tab: 'Giới thiệu',
    title: 'Giới thiệu về trang này',
    body: [
      'Bản đồ tương tác và cơ sở dữ liệu Palworld không chính thức do người hâm mộ thực hiện. Toàn bộ dữ liệu được trích xuất từ tệp của game.',
      'Không liên kết, không được Pocketpair, Inc. chứng thực hoặc tài trợ.',
    ],
    copy: 'Sao chép',
    copied: 'Đã sao chép',
  },
  'zh-CN': {
    tab: '关于',
    title: '关于本站',
    body: [
      '本站是由玩家制作的《帕鲁世界》非官方互动地图与资料库，所有游戏数据均从游戏文件中提取。',
      '本站与 Pocketpair, Inc. 无隶属关系，也未获其授权或赞助。',
    ],
    contact: {
      title: '交流与反馈',
      hint: '欢迎加入 QQ 群提出建议、反馈问题或报告 bug。',
      groupLabel: 'QQ 群',
    },
    copy: '复制',
    copied: '已复制',
  },
  'zh-TW': {
    tab: '關於',
    title: '關於本站',
    body: [
      '本站是由玩家製作的《帕魯世界》非官方互動地圖與資料庫，所有遊戲資料均自遊戲檔案中擷取。',
      '本站與 Pocketpair, Inc. 無隸屬關係，也未獲其授權或贊助。',
    ],
    contact: {
      title: '交流與回饋',
      hint: '歡迎加入 QQ 群提出建議、回報問題或回報 bug。',
      groupLabel: 'QQ 群',
    },
    copy: '複製',
    copied: '已複製',
  },
}

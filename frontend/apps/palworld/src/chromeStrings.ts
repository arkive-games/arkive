import type { Language } from './i18n'

/**
 * Site chrome strings: the Arkive brand line shown in the desktop top bar and
 * the mobile "More" sheet, plus the mobile settings rows (language sub-page,
 * theme tabs). Kept out of i18n.ts's big `resources` literal for the same
 * reason the other *Strings.ts tables are: one flat `Record<Language, …>` per
 * label reads better than 17 nested blocks.
 */

/**
 * Brand wordmark. Chinese locales get both halves because the site is known by
 * its Chinese name there; every other locale gets the Latin one only.
 */
export const BRAND_LABELS: Record<Language, string> = {
  'en-US': 'Arkive', 'de-DE': 'Arkive', 'es-ES': 'Arkive', 'es-MX': 'Arkive', 'fr-FR': 'Arkive',
  'id-ID': 'Arkive', 'it-IT': 'Arkive', 'ja-JP': 'Arkive', 'ko-KR': 'Arkive', 'pl-PL': 'Arkive',
  'pt-BR': 'Arkive', 'ru-RU': 'Arkive', 'th-TH': 'Arkive', 'tr-TR': 'Arkive', 'vi-VN': 'Arkive',
  'zh-CN': '藏舟攻略 / Arkive', 'zh-TW': '藏舟攻略 / Arkive',
}

/** Arkive's brand promise, kept identical across every game map shell. */
export const BRAND_SLOGAN_LABELS: Record<Language, string> = {
  'en-US': 'Sail Games With Us.', 'de-DE': 'Sail Games With Us.', 'es-ES': 'Sail Games With Us.',
  'es-MX': 'Sail Games With Us.', 'fr-FR': 'Sail Games With Us.', 'id-ID': 'Sail Games With Us.',
  'it-IT': 'Sail Games With Us.', 'ja-JP': 'Sail Games With Us.', 'ko-KR': 'Sail Games With Us.',
  'pl-PL': 'Sail Games With Us.', 'pt-BR': 'Sail Games With Us.', 'ru-RU': 'Sail Games With Us.',
  'th-TH': 'Sail Games With Us.', 'tr-TR': 'Sail Games With Us.', 'vi-VN': 'Sail Games With Us.',
  'zh-CN': '万千攻略，藏于一舟', 'zh-TW': '萬千攻略，藏於一舟',
}

/** Label paired with the map picker in the shared sidebar geometry. */
export const MAP_REGION_LABELS: Record<Language, string> = {
  'en-US': 'Map region', 'de-DE': 'Kartenregion', 'es-ES': 'Región', 'es-MX': 'Región',
  'fr-FR': 'Région', 'id-ID': 'Wilayah peta', 'it-IT': 'Regione', 'ja-JP': 'マップエリア',
  'ko-KR': '지도 지역', 'pl-PL': 'Region mapy', 'pt-BR': 'Região', 'ru-RU': 'Регион карты',
  'th-TH': 'พื้นที่แผนที่', 'tr-TR': 'Harita bölgesi', 'vi-VN': 'Khu vực bản đồ',
  'zh-CN': '地图区域', 'zh-TW': '地圖區域',
}

/** Game identity copy shown over the Palworld promotional artwork. */
export const MAP_HEADER_LABELS: Record<Language, string> = {
  'en-US': 'Palworld · Interactive Map', 'de-DE': 'Palworld · Interaktive Karte',
  'es-ES': 'Palworld · Mapa interactivo', 'es-MX': 'Palworld · Mapa interactivo',
  'fr-FR': 'Palworld · Carte interactive', 'id-ID': 'Palworld · Peta interaktif',
  'it-IT': 'Palworld · Mappa interattiva', 'ja-JP': 'Palworld · インタラクティブマップ',
  'ko-KR': 'Palworld · 인터랙티브 지도', 'pl-PL': 'Palworld · Mapa interaktywna',
  'pt-BR': 'Palworld · Mapa interativo', 'ru-RU': 'Palworld · Интерактивная карта',
  'th-TH': 'Palworld · แผนที่แบบโต้ตอบ', 'tr-TR': 'Palworld · İnteraktif harita',
  'vi-VN': 'Palworld · Bản đồ tương tác', 'zh-CN': '幻兽帕鲁 · 互动地图',
  'zh-TW': '幻獸帕魯 · 互動地圖',
}

/** Accessible name / tooltip for the brand link ("go to the Arkive home page"). */
export const BRAND_HOME_LABELS: Record<Language, string> = {
  'en-US': 'Arkive home', 'de-DE': 'Arkive-Startseite', 'es-ES': 'Inicio de Arkive',
  'es-MX': 'Inicio de Arkive', 'fr-FR': 'Accueil Arkive', 'id-ID': 'Beranda Arkive',
  'it-IT': 'Home di Arkive', 'ja-JP': 'Arkive ホーム', 'ko-KR': 'Arkive 홈',
  'pl-PL': 'Strona główna Arkive', 'pt-BR': 'Início do Arkive', 'ru-RU': 'Главная Arkive',
  'th-TH': 'หน้าแรก Arkive', 'tr-TR': 'Arkive ana sayfa', 'vi-VN': 'Trang chủ Arkive',
  'zh-CN': '藏舟攻略首页', 'zh-TW': '藏舟攻略首頁',
}

/** "About Arkive" section body in the site-info / about panel. */
export const BRAND_ABOUT_LABELS: Record<Language, string> = {
  'en-US': 'This site is part of Arkive (藏舟攻略网), a small family of ad-free game guide sites. Open the hub to see the other games.',
  'de-DE': 'Diese Seite gehört zu Arkive (藏舟攻略网), einer kleinen Familie werbefreier Spiele-Guides. Öffne die Übersicht für die anderen Spiele.',
  'es-ES': 'Este sitio forma parte de Arkive (藏舟攻略网), una pequeña familia de guías de juegos sin anuncios. Abre el portal para ver los demás juegos.',
  'es-MX': 'Este sitio forma parte de Arkive (藏舟攻略网), una pequeña familia de guías de juegos sin anuncios. Abre el portal para ver los demás juegos.',
  'fr-FR': 'Ce site fait partie d’Arkive (藏舟攻略网), une petite famille de guides de jeux sans publicité. Ouvrez le portail pour voir les autres jeux.',
  'id-ID': 'Situs ini bagian dari Arkive (藏舟攻略网), keluarga kecil situs panduan game tanpa iklan. Buka portal untuk melihat game lainnya.',
  'it-IT': 'Questo sito fa parte di Arkive (藏舟攻略网), una piccola famiglia di guide di gioco senza pubblicità. Apri il portale per vedere gli altri giochi.',
  'ja-JP': 'このサイトは、広告のないゲーム攻略サイト群 Arkive（藏舟攻略网）の一つです。ポータルから他のゲームも見られます。',
  'ko-KR': '이 사이트는 광고 없는 게임 공략 사이트 모음 Arkive(藏舟攻略网)의 일부입니다. 포털에서 다른 게임도 볼 수 있습니다.',
  'pl-PL': 'Ta strona należy do Arkive (藏舟攻略网), niewielkiej rodziny poradników do gier bez reklam. Otwórz portal, aby zobaczyć pozostałe gry.',
  'pt-BR': 'Este site faz parte do Arkive (藏舟攻略网), uma pequena família de guias de jogos sem anúncios. Abra o portal para ver os outros jogos.',
  'ru-RU': 'Этот сайт — часть Arkive (藏舟攻略网), небольшого семейства гайдов по играм без рекламы. Откройте портал, чтобы увидеть другие игры.',
  'th-TH': 'เว็บนี้เป็นส่วนหนึ่งของ Arkive (藏舟攻略网) กลุ่มเว็บไกด์เกมที่ไม่มีโฆษณา เปิดหน้ารวมเพื่อดูเกมอื่น ๆ',
  'tr-TR': 'Bu site, reklamsız oyun rehberlerinden oluşan küçük bir aile olan Arkive’ın (藏舟攻略网) parçasıdır. Diğer oyunlar için portalı açın.',
  'vi-VN': 'Trang này thuộc Arkive (藏舟攻略网), một nhóm nhỏ các trang hướng dẫn game không quảng cáo. Mở cổng chính để xem các game khác.',
  'zh-CN': '本站属于藏舟攻略网（Arkive）——一组没有广告的游戏攻略站点。打开首页可以看到其他游戏。',
  'zh-TW': '本站屬於藏舟攻略網（Arkive）——一組沒有廣告的遊戲攻略站點。開啟首頁可以看到其他遊戲。',
}

/** Settings row label for the language picker. */
export const SETTINGS_LANGUAGE_LABELS: Record<Language, string> = {
  'en-US': 'Language', 'de-DE': 'Sprache', 'es-ES': 'Idioma', 'es-MX': 'Idioma', 'fr-FR': 'Langue',
  'id-ID': 'Bahasa', 'it-IT': 'Lingua', 'ja-JP': '言語', 'ko-KR': '언어', 'pl-PL': 'Język',
  'pt-BR': 'Idioma', 'ru-RU': 'Язык', 'th-TH': 'ภาษา', 'tr-TR': 'Dil', 'vi-VN': 'Ngôn ngữ',
  'zh-CN': '语言', 'zh-TW': '語言',
}

/** Settings row label for the theme tabs. */
export const SETTINGS_THEME_LABELS: Record<Language, string> = {
  'en-US': 'Theme', 'de-DE': 'Design', 'es-ES': 'Tema', 'es-MX': 'Tema', 'fr-FR': 'Thème',
  'id-ID': 'Tema', 'it-IT': 'Tema', 'ja-JP': 'テーマ', 'ko-KR': '테마', 'pl-PL': 'Motyw',
  'pt-BR': 'Tema', 'ru-RU': 'Тема', 'th-TH': 'ธีม', 'tr-TR': 'Tema', 'vi-VN': 'Giao diện',
  'zh-CN': '主题', 'zh-TW': '主題',
}

/**
 * Top-bar build badge (`BuildInfo`) labels. The package ships English defaults
 * for these rows, so without injection the hovercard stayed English in all 17
 * locales while the version row next to it was translated.
 */
export const BUILD_INFO_LABELS: Record<Language, string> = {
  'en-US': 'Build info', 'de-DE': 'Build-Infos', 'es-ES': 'Información de compilación',
  'es-MX': 'Información de compilación', 'fr-FR': 'Infos de build', 'id-ID': 'Info build',
  'it-IT': 'Info build', 'ja-JP': 'ビルド情報', 'ko-KR': '빌드 정보',
  'pl-PL': 'Informacje o kompilacji', 'pt-BR': 'Informações da compilação',
  'ru-RU': 'Информация о сборке', 'th-TH': 'ข้อมูลบิลด์', 'tr-TR': 'Derleme bilgisi',
  'vi-VN': 'Thông tin bản dựng', 'zh-CN': '构建信息', 'zh-TW': '建置資訊',
}

/** Git commit of the build. */
export const BUILD_COMMIT_LABELS: Record<Language, string> = {
  'en-US': 'Commit', 'de-DE': 'Commit', 'es-ES': 'Commit', 'es-MX': 'Commit', 'fr-FR': 'Commit',
  'id-ID': 'Commit', 'it-IT': 'Commit', 'ja-JP': 'コミット', 'ko-KR': '커밋', 'pl-PL': 'Commit',
  'pt-BR': 'Commit', 'ru-RU': 'Коммит', 'th-TH': 'คอมมิต', 'tr-TR': 'Commit', 'vi-VN': 'Commit',
  'zh-CN': '提交', 'zh-TW': '提交',
}

/** When the site was built. */
export const BUILD_TIME_LABELS: Record<Language, string> = {
  'en-US': 'Built', 'de-DE': 'Erstellt', 'es-ES': 'Compilado', 'es-MX': 'Compilado',
  'fr-FR': 'Compilé', 'id-ID': 'Dibangun', 'it-IT': 'Compilato', 'ja-JP': 'ビルド日時',
  'ko-KR': '빌드', 'pl-PL': 'Zbudowano', 'pt-BR': 'Compilado', 'ru-RU': 'Сборка',
  'th-TH': 'บิลด์เมื่อ', 'tr-TR': 'Derleme', 'vi-VN': 'Bản dựng', 'zh-CN': '构建时间',
  'zh-TW': '建置時間',
}

/** Game version the site's data was extracted from. */
export const BUILD_GAME_LABELS: Record<Language, string> = {
  'en-US': 'Game', 'de-DE': 'Spiel', 'es-ES': 'Juego', 'es-MX': 'Juego', 'fr-FR': 'Jeu',
  'id-ID': 'Game', 'it-IT': 'Gioco', 'ja-JP': 'ゲーム', 'ko-KR': '게임', 'pl-PL': 'Gra',
  'pt-BR': 'Jogo', 'ru-RU': 'Игра', 'th-TH': 'เกม', 'tr-TR': 'Oyun', 'vi-VN': 'Game',
  'zh-CN': '游戏版本', 'zh-TW': '遊戲版本',
}

/** Back button on the mobile sheet's sub-pages. */
export const SETTINGS_BACK_LABELS: Record<Language, string> = {
  'en-US': 'Back', 'de-DE': 'Zurück', 'es-ES': 'Atrás', 'es-MX': 'Atrás', 'fr-FR': 'Retour',
  'id-ID': 'Kembali', 'it-IT': 'Indietro', 'ja-JP': '戻る', 'ko-KR': '뒤로', 'pl-PL': 'Wstecz',
  'pt-BR': 'Voltar', 'ru-RU': 'Назад', 'th-TH': 'ย้อนกลับ', 'tr-TR': 'Geri', 'vi-VN': 'Quay lại',
  'zh-CN': '返回', 'zh-TW': '返回',
}

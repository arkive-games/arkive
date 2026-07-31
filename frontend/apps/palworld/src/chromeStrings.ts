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

/** Back button on the mobile sheet's sub-pages. */
export const SETTINGS_BACK_LABELS: Record<Language, string> = {
  'en-US': 'Back', 'de-DE': 'Zurück', 'es-ES': 'Atrás', 'es-MX': 'Atrás', 'fr-FR': 'Retour',
  'id-ID': 'Kembali', 'it-IT': 'Indietro', 'ja-JP': '戻る', 'ko-KR': '뒤로', 'pl-PL': 'Wstecz',
  'pt-BR': 'Voltar', 'ru-RU': 'Назад', 'th-TH': 'ย้อนกลับ', 'tr-TR': 'Geri', 'vi-VN': 'Quay lại',
  'zh-CN': '返回', 'zh-TW': '返回',
}

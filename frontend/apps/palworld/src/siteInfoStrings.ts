import type { Language } from './i18n'

export interface SiteInfoStrings {
  tab: string
  aboutTitle: string
  arkiveName: string
  gameName: string
  introTemplate: string
  disclaimerTemplate: string
  versionTitle: string
  viewVersionTemplate: string
  recentUpdatesTitle: string
  noRecentUpdates: string
  feedbackTitle: string
  feedbackHint: string
  feedbackGroupLabel: string
  copy: string
  copied: string
  close: string
}

export const SITE_INFO_STRINGS: Record<Language, SiteInfoStrings> = {
  'en-US': {
    tab: 'About', aboutTitle: 'About this site', arkiveName: 'Arkive', gameName: 'Palworld',
    introTemplate: 'This unofficial {game} interactive map and database is built and maintained by {arkive}. All game data is extracted from the game files, and the site will always remain free to use.',
    disclaimerTemplate: 'This site is not affiliated with, authorized, or endorsed by {developer}. All rights to {game} and related game content belong to {developer}.',
    versionTitle: 'Version updates', viewVersionTemplate: 'View version {version}', recentUpdatesTitle: 'Recent updates', noRecentUpdates: 'No updates yet.',
    feedbackTitle: 'Community and feedback', feedbackHint: 'Use the feedback QQ group below to suggest improvements or report problems.', feedbackGroupLabel: 'Feedback QQ group',
    copy: 'Copy', copied: 'Copied', close: 'Close',
  },
  'de-DE': {
    tab: 'Info', aboutTitle: 'Über diese Seite', arkiveName: 'Arkive', gameName: 'Palworld',
    introTemplate: 'Diese inoffizielle interaktive Karte und Datenbank für {game} wird von {arkive} erstellt und gepflegt. Alle Spieldaten werden aus den Spieldateien extrahiert und die Seite bleibt dauerhaft kostenlos.',
    disclaimerTemplate: 'Diese Seite ist nicht mit {developer} verbunden und wurde weder autorisiert noch unterstützt. Alle Rechte an {game} und den zugehörigen Spielinhalten liegen bei {developer}.',
    versionTitle: 'Versionsupdates', viewVersionTemplate: 'Version {version} ansehen', recentUpdatesTitle: 'Letzte Updates', noRecentUpdates: 'Noch keine Updates.',
    feedbackTitle: 'Austausch und Feedback', feedbackHint: 'Nutze die Feedback-QQ-Gruppe unten für Vorschläge oder Problemmeldungen.', feedbackGroupLabel: 'Feedback-QQ-Gruppe',
    copy: 'Kopieren', copied: 'Kopiert', close: 'Schließen',
  },
  'es-ES': {
    tab: 'Acerca de', aboutTitle: 'Acerca de este sitio', arkiveName: 'Arkive', gameName: 'Palworld',
    introTemplate: 'Este mapa interactivo y base de datos no oficiales de {game} son creados y mantenidos por {arkive}. Todos los datos se extraen de los archivos del juego y el sitio será siempre gratuito.',
    disclaimerTemplate: 'Este sitio no está afiliado, autorizado ni respaldado por {developer}. Todos los derechos de {game} y su contenido relacionado pertenecen a {developer}.',
    versionTitle: 'Actualizaciones de versión', viewVersionTemplate: 'Ver versión {version}', recentUpdatesTitle: 'Actualizaciones recientes', noRecentUpdates: 'Aún no hay actualizaciones.',
    feedbackTitle: 'Comunidad y comentarios', feedbackHint: 'Usa el grupo QQ de comentarios para proponer mejoras o informar de problemas.', feedbackGroupLabel: 'Grupo QQ de comentarios',
    copy: 'Copiar', copied: 'Copiado', close: 'Cerrar',
  },
  'es-MX': {
    tab: 'Acerca de', aboutTitle: 'Acerca de este sitio', arkiveName: 'Arkive', gameName: 'Palworld',
    introTemplate: 'Este mapa interactivo y base de datos no oficiales de {game} son creados y mantenidos por {arkive}. Todos los datos se extraen de los archivos del juego y el sitio será siempre gratuito.',
    disclaimerTemplate: 'Este sitio no está afiliado, autorizado ni respaldado por {developer}. Todos los derechos de {game} y su contenido relacionado pertenecen a {developer}.',
    versionTitle: 'Actualizaciones de versión', viewVersionTemplate: 'Ver versión {version}', recentUpdatesTitle: 'Actualizaciones recientes', noRecentUpdates: 'Aún no hay actualizaciones.',
    feedbackTitle: 'Comunidad y comentarios', feedbackHint: 'Usa el grupo QQ de comentarios para proponer mejoras o reportar problemas.', feedbackGroupLabel: 'Grupo QQ de comentarios',
    copy: 'Copiar', copied: 'Copiado', close: 'Cerrar',
  },
  'fr-FR': {
    tab: 'À propos', aboutTitle: 'À propos de ce site', arkiveName: 'Arkive', gameName: 'Palworld',
    introTemplate: 'Cette carte interactive et cette base de données non officielles de {game} sont créées et maintenues par {arkive}. Toutes les données sont extraites des fichiers du jeu et le site restera toujours gratuit.',
    disclaimerTemplate: 'Ce site n’est ni affilié à {developer}, ni autorisé ou approuvé par cette société. Tous les droits sur {game} et son contenu associé appartiennent à {developer}.',
    versionTitle: 'Mises à jour de version', viewVersionTemplate: 'Voir la version {version}', recentUpdatesTitle: 'Mises à jour récentes', noRecentUpdates: 'Aucune mise à jour pour le moment.',
    feedbackTitle: 'Communauté et retours', feedbackHint: 'Utilisez le groupe QQ de retours ci-dessous pour proposer des améliorations ou signaler un problème.', feedbackGroupLabel: 'Groupe QQ de retours',
    copy: 'Copier', copied: 'Copié', close: 'Fermer',
  },
  'id-ID': {
    tab: 'Tentang', aboutTitle: 'Tentang situs ini', arkiveName: 'Arkive', gameName: 'Palworld',
    introTemplate: 'Peta interaktif dan basis data {game} tidak resmi ini dibuat dan dikelola oleh {arkive}. Semua data diambil dari file game dan situs ini akan selalu gratis.',
    disclaimerTemplate: 'Situs ini tidak berafiliasi, tidak diotorisasi, dan tidak didukung oleh {developer}. Seluruh hak atas {game} dan konten game terkait dimiliki oleh {developer}.',
    versionTitle: 'Pembaruan versi', viewVersionTemplate: 'Lihat versi {version}', recentUpdatesTitle: 'Pembaruan terbaru', noRecentUpdates: 'Belum ada pembaruan.',
    feedbackTitle: 'Komunitas dan masukan', feedbackHint: 'Gunakan grup QQ masukan di bawah untuk memberi saran atau melaporkan masalah.', feedbackGroupLabel: 'Grup QQ masukan',
    copy: 'Salin', copied: 'Tersalin', close: 'Tutup',
  },
  'it-IT': {
    tab: 'Informazioni', aboutTitle: 'Informazioni sul sito', arkiveName: 'Arkive', gameName: 'Palworld',
    introTemplate: 'Questa mappa interattiva e banca dati non ufficiale di {game} è creata e gestita da {arkive}. Tutti i dati sono estratti dai file del gioco e il sito resterà sempre gratuito.',
    disclaimerTemplate: 'Questo sito non è affiliato, autorizzato o approvato da {developer}. Tutti i diritti su {game} e sui contenuti correlati appartengono a {developer}.',
    versionTitle: 'Aggiornamenti di versione', viewVersionTemplate: 'Vedi versione {version}', recentUpdatesTitle: 'Aggiornamenti recenti', noRecentUpdates: 'Nessun aggiornamento disponibile.',
    feedbackTitle: 'Comunità e feedback', feedbackHint: 'Usa il gruppo QQ di feedback qui sotto per suggerimenti o segnalazioni.', feedbackGroupLabel: 'Gruppo QQ di feedback',
    copy: 'Copia', copied: 'Copiato', close: 'Chiudi',
  },
  'ja-JP': {
    tab: 'このサイトについて', aboutTitle: 'このサイトについて', arkiveName: 'Arkive', gameName: 'パルワールド',
    introTemplate: 'この非公式の{game}インタラクティブマップ＆データベースは、{arkive}が制作・運営しています。ゲームデータはすべてゲームファイルから抽出し、今後も無料で公開します。',
    disclaimerTemplate: 'このサイトは{developer}との提携関係になく、承認や後援も受けていません。{game}および関連するゲームコンテンツの権利はすべて{developer}に帰属します。',
    versionTitle: 'バージョン更新履歴', viewVersionTemplate: 'バージョン {version} を見る', recentUpdatesTitle: '最近の更新', noRecentUpdates: '更新履歴はありません。',
    feedbackTitle: '交流とフィードバック', feedbackHint: '改善提案や不具合報告は、下のフィードバック QQ グループをご利用ください。', feedbackGroupLabel: 'フィードバック QQ グループ',
    copy: 'コピー', copied: 'コピーしました', close: '閉じる',
  },
  'ko-KR': {
    tab: '소개', aboutTitle: '사이트 소개', arkiveName: 'Arkive', gameName: '팰월드',
    introTemplate: '이 비공식 {game} 인터랙티브 지도 및 데이터베이스는 {arkive}에서 제작하고 운영합니다. 모든 게임 데이터는 게임 파일에서 추출했으며 언제나 무료로 이용할 수 있습니다.',
    disclaimerTemplate: '이 사이트는 {developer}와 제휴 관계가 없으며 승인이나 후원을 받지 않았습니다. {game} 및 관련 게임 콘텐츠의 모든 권리는 {developer}에 있습니다.',
    versionTitle: '버전 업데이트', viewVersionTemplate: '버전 {version} 보기', recentUpdatesTitle: '최근 업데이트', noRecentUpdates: '업데이트 내역이 없습니다.',
    feedbackTitle: '커뮤니티 및 피드백', feedbackHint: '개선 제안이나 문제 신고는 아래 피드백 QQ 그룹을 이용해 주세요.', feedbackGroupLabel: '피드백 QQ 그룹',
    copy: '복사', copied: '복사됨', close: '닫기',
  },
  'pl-PL': {
    tab: 'O stronie', aboutTitle: 'O tej stronie', arkiveName: 'Arkive', gameName: 'Palworld',
    introTemplate: 'Ta nieoficjalna interaktywna mapa i baza danych {game} jest tworzona i utrzymywana przez {arkive}. Wszystkie dane pochodzą z plików gry, a strona pozostanie zawsze bezpłatna.',
    disclaimerTemplate: 'Ta strona nie jest powiązana, autoryzowana ani wspierana przez {developer}. Wszelkie prawa do {game} i powiązanej zawartości należą do {developer}.',
    versionTitle: 'Aktualizacje wersji', viewVersionTemplate: 'Zobacz wersję {version}', recentUpdatesTitle: 'Ostatnie aktualizacje', noRecentUpdates: 'Brak aktualizacji.',
    feedbackTitle: 'Społeczność i opinie', feedbackHint: 'Skorzystaj z grupy QQ poniżej, aby zgłosić sugestię lub problem.', feedbackGroupLabel: 'Grupa QQ opinii',
    copy: 'Kopiuj', copied: 'Skopiowano', close: 'Zamknij',
  },
  'pt-BR': {
    tab: 'Sobre', aboutTitle: 'Sobre este site', arkiveName: 'Arkive', gameName: 'Palworld',
    introTemplate: 'Este mapa interativo e banco de dados não oficiais de {game} são criados e mantidos pela {arkive}. Todos os dados são extraídos dos arquivos do jogo e o site será sempre gratuito.',
    disclaimerTemplate: 'Este site não é afiliado, autorizado ou endossado pela {developer}. Todos os direitos de {game} e do conteúdo relacionado pertencem à {developer}.',
    versionTitle: 'Atualizações de versão', viewVersionTemplate: 'Ver versão {version}', recentUpdatesTitle: 'Atualizações recentes', noRecentUpdates: 'Ainda não há atualizações.',
    feedbackTitle: 'Comunidade e feedback', feedbackHint: 'Use o grupo QQ de feedback abaixo para sugerir melhorias ou relatar problemas.', feedbackGroupLabel: 'Grupo QQ de feedback',
    copy: 'Copiar', copied: 'Copiado', close: 'Fechar',
  },
  'ru-RU': {
    tab: 'О сайте', aboutTitle: 'О сайте', arkiveName: 'Arkive', gameName: 'Palworld',
    introTemplate: 'Эта неофициальная интерактивная карта и база данных {game} создаётся и поддерживается {arkive}. Все данные извлечены из файлов игры, а сайт всегда будет бесплатным.',
    disclaimerTemplate: 'Этот сайт не связан с {developer}, не авторизован и не одобрен ею. Все права на {game} и связанный игровой контент принадлежат {developer}.',
    versionTitle: 'Обновления версий', viewVersionTemplate: 'Посмотреть версию {version}', recentUpdatesTitle: 'Недавние обновления', noRecentUpdates: 'Обновлений пока нет.',
    feedbackTitle: 'Сообщество и обратная связь', feedbackHint: 'Используйте QQ-группу ниже, чтобы предложить улучшение или сообщить о проблеме.', feedbackGroupLabel: 'QQ-группа обратной связи',
    copy: 'Копировать', copied: 'Скопировано', close: 'Закрыть',
  },
  'th-TH': {
    tab: 'เกี่ยวกับ', aboutTitle: 'เกี่ยวกับเว็บไซต์นี้', arkiveName: 'Arkive', gameName: 'Palworld',
    introTemplate: 'แผนที่แบบโต้ตอบและฐานข้อมูล {game} อย่างไม่เป็นทางการนี้สร้างและดูแลโดย {arkive} ข้อมูลทั้งหมดดึงจากไฟล์เกม และเว็บไซต์จะเปิดให้ใช้ฟรีเสมอ',
    disclaimerTemplate: 'เว็บไซต์นี้ไม่มีความเกี่ยวข้อง ไม่ได้รับอนุญาต และไม่ได้รับการรับรองจาก {developer} สิทธิทั้งหมดใน {game} และเนื้อหาเกมที่เกี่ยวข้องเป็นของ {developer}',
    versionTitle: 'ประวัติการอัปเดตเวอร์ชัน', viewVersionTemplate: 'ดูเวอร์ชัน {version}', recentUpdatesTitle: 'อัปเดตล่าสุด', noRecentUpdates: 'ยังไม่มีรายการอัปเดต',
    feedbackTitle: 'ชุมชนและข้อเสนอแนะ', feedbackHint: 'ใช้กลุ่ม QQ ด้านล่างเพื่อเสนอแนะหรือรายงานปัญหา', feedbackGroupLabel: 'กลุ่ม QQ สำหรับข้อเสนอแนะ',
    copy: 'คัดลอก', copied: 'คัดลอกแล้ว', close: 'ปิด',
  },
  'tr-TR': {
    tab: 'Hakkında', aboutTitle: 'Bu site hakkında', arkiveName: 'Arkive', gameName: 'Palworld',
    introTemplate: 'Bu resmî olmayan {game} interaktif haritası ve veri tabanı {arkive} tarafından hazırlanıp sürdürülmektedir. Tüm veriler oyun dosyalarından çıkarılır ve site her zaman ücretsiz kalacaktır.',
    disclaimerTemplate: 'Bu site {developer} ile bağlantılı değildir; şirket tarafından yetkilendirilmemiş veya desteklenmemiştir. {game} ve ilgili oyun içeriklerinin tüm hakları {developer} şirketine aittir.',
    versionTitle: 'Sürüm güncellemeleri', viewVersionTemplate: '{version} sürümünü görüntüle', recentUpdatesTitle: 'Son güncellemeler', noRecentUpdates: 'Henüz güncelleme yok.',
    feedbackTitle: 'Topluluk ve geri bildirim', feedbackHint: 'Öneri veya sorun bildirimi için aşağıdaki QQ geri bildirim grubunu kullanın.', feedbackGroupLabel: 'QQ geri bildirim grubu',
    copy: 'Kopyala', copied: 'Kopyalandı', close: 'Kapat',
  },
  'vi-VN': {
    tab: 'Giới thiệu', aboutTitle: 'Giới thiệu về trang này', arkiveName: 'Arkive', gameName: 'Palworld',
    introTemplate: 'Bản đồ tương tác và cơ sở dữ liệu {game} không chính thức này do {arkive} xây dựng và duy trì. Toàn bộ dữ liệu được trích xuất từ tệp game và trang sẽ luôn được mở miễn phí.',
    disclaimerTemplate: 'Trang này không liên kết, không được ủy quyền hay chứng thực bởi {developer}. Mọi quyền đối với {game} và nội dung game liên quan đều thuộc về {developer}.',
    versionTitle: 'Lịch sử cập nhật phiên bản', viewVersionTemplate: 'Xem phiên bản {version}', recentUpdatesTitle: 'Cập nhật gần đây', noRecentUpdates: 'Chưa có bản cập nhật.',
    feedbackTitle: 'Cộng đồng và phản hồi', feedbackHint: 'Dùng nhóm QQ phản hồi bên dưới để góp ý hoặc báo cáo vấn đề.', feedbackGroupLabel: 'Nhóm QQ phản hồi',
    copy: 'Sao chép', copied: 'Đã sao chép', close: 'Đóng',
  },
  'zh-CN': {
    tab: '关于', aboutTitle: '关于本站', arkiveName: '藏舟攻略网', gameName: '幻兽帕鲁',
    introTemplate: '本站是由{arkive}搭建与维护的{game}非官方互动地图与资料库，游戏数据均从游戏文件中提取，永久免费开放。',
    disclaimerTemplate: '本站与{developer}无隶属关系，也未获其授权或背书。{game}及相关游戏内容的一切权利均归{developer}所有。',
    versionTitle: '版本更新记录', viewVersionTemplate: '查看版本 {version}', recentUpdatesTitle: '近期更新', noRecentUpdates: '暂无更新记录。',
    feedbackTitle: '交流与反馈', feedbackHint: '欢迎通过下方反馈 QQ 群提出建议、反馈问题或报告错误。', feedbackGroupLabel: '反馈 QQ 群',
    copy: '复制', copied: '已复制', close: '关闭',
  },
  'zh-TW': {
    tab: '關於', aboutTitle: '關於本站', arkiveName: '藏舟攻略網', gameName: '幻獸帕魯',
    introTemplate: '本站是由{arkive}搭建與維護的{game}非官方互動地圖與資料庫，遊戲資料均從遊戲檔案中擷取，永久免費開放。',
    disclaimerTemplate: '本站與{developer}無隸屬關係，也未獲其授權或背書。{game}及相關遊戲內容的一切權利均歸{developer}所有。',
    versionTitle: '版本更新記錄', viewVersionTemplate: '查看版本 {version}', recentUpdatesTitle: '近期更新', noRecentUpdates: '暫無更新記錄。',
    feedbackTitle: '交流與回饋', feedbackHint: '歡迎透過下方回饋 QQ 群提出建議、回報問題或提交錯誤。', feedbackGroupLabel: '回饋 QQ 群',
    copy: '複製', copied: '已複製', close: '關閉',
  },
}

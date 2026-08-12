import type { Language } from './i18n'

export type MarkerDetailStrings = {
  close: string
  details: string
  comments: string
  scrollArea: string
  collapseSection: string
  expandSection: string
  description: string
  drops: string
  gallery: string
  galleryDescription: string
  uploadImage: string
  galleryReviewNote: string
  commentCount: string
  popular: string
  latest: string
  like: string
  reply: string
  viewReplies: string
  commentPlaceholder: string
  attachImages: string
  attachmentLimit: string
  publish: string
}

const en: MarkerDetailStrings = {
  close: 'Close marker details', details: 'Details', comments: 'Comments', scrollArea: 'Marker content, scrollable',
  collapseSection: 'Collapse {{title}}', expandSection: 'Expand {{title}}', description: 'Marker description', drops: 'Defeat drops',
  gallery: 'Player images', galleryDescription: 'Help other players identify the terrain and entrance', uploadImage: 'Upload image',
  galleryReviewNote: 'Images become public after community review. Up to 3 images.', commentCount: '{{count}} comments', popular: 'Popular', latest: 'Latest',
  like: 'Like', reply: 'Reply', viewReplies: 'View {{count}} replies', commentPlaceholder: 'Share useful information about this marker',
  attachImages: 'Attach images', attachmentLimit: 'Up to 3 images', publish: 'Publish',
}

export const MARKER_DETAIL_STRINGS: Record<Language, MarkerDetailStrings> = {
  'en-US': en,
  'de-DE': { ...en, close: 'Markerdetails schließen', details: 'Details', comments: 'Kommentare', description: 'Markerbeschreibung', drops: 'Beute', gallery: 'Spielerbilder', uploadImage: 'Bild hochladen', popular: 'Beliebt', latest: 'Neueste', like: 'Gefällt mir', reply: 'Antworten', publish: 'Veröffentlichen' },
  'es-ES': { ...en, close: 'Cerrar detalles del marcador', details: 'Detalles', comments: 'Comentarios', description: 'Descripción del marcador', drops: 'Botín', gallery: 'Imágenes de jugadores', uploadImage: 'Subir imagen', popular: 'Popular', latest: 'Recientes', like: 'Me gusta', reply: 'Responder', publish: 'Publicar' },
  'es-MX': { ...en, close: 'Cerrar detalles del marcador', details: 'Detalles', comments: 'Comentarios', description: 'Descripción del marcador', drops: 'Botín', gallery: 'Imágenes de jugadores', uploadImage: 'Subir imagen', popular: 'Popular', latest: 'Recientes', like: 'Me gusta', reply: 'Responder', publish: 'Publicar' },
  'fr-FR': { ...en, close: 'Fermer les détails du marqueur', details: 'Détails', comments: 'Commentaires', description: 'Description du marqueur', drops: 'Butin', gallery: 'Images des joueurs', uploadImage: 'Importer une image', popular: 'Populaires', latest: 'Récents', like: "J'aime", reply: 'Répondre', publish: 'Publier' },
  'id-ID': { ...en, close: 'Tutup detail penanda', details: 'Detail', comments: 'Komentar', description: 'Deskripsi penanda', drops: 'Jarahan', gallery: 'Gambar pemain', uploadImage: 'Unggah gambar', popular: 'Populer', latest: 'Terbaru', like: 'Suka', reply: 'Balas', publish: 'Terbitkan' },
  'it-IT': { ...en, close: 'Chiudi dettagli indicatore', details: 'Dettagli', comments: 'Commenti', description: 'Descrizione indicatore', drops: 'Bottino', gallery: 'Immagini dei giocatori', uploadImage: 'Carica immagine', popular: 'Popolari', latest: 'Recenti', like: 'Mi piace', reply: 'Rispondi', publish: 'Pubblica' },
  'ja-JP': { ...en, close: 'マーカー詳細を閉じる', details: '詳細', comments: 'コメント', description: 'マーカー説明', drops: '討伐ドロップ', gallery: 'プレイヤー画像', uploadImage: '画像をアップロード', popular: '人気', latest: '新着', like: 'いいね', reply: '返信', publish: '投稿' },
  'ko-KR': { ...en, close: '마커 상세 닫기', details: '상세', comments: '댓글', description: '마커 설명', drops: '처치 보상', gallery: '플레이어 이미지', uploadImage: '이미지 업로드', popular: '인기', latest: '최신', like: '좋아요', reply: '답글', publish: '게시' },
  'pl-PL': { ...en, close: 'Zamknij szczegóły znacznika', details: 'Szczegóły', comments: 'Komentarze', description: 'Opis znacznika', drops: 'Łup', gallery: 'Zdjęcia graczy', uploadImage: 'Prześlij zdjęcie', popular: 'Popularne', latest: 'Najnowsze', like: 'Lubię', reply: 'Odpowiedz', publish: 'Opublikuj' },
  'pt-BR': { ...en, close: 'Fechar detalhes do marcador', details: 'Detalhes', comments: 'Comentários', description: 'Descrição do marcador', drops: 'Itens obtidos', gallery: 'Imagens de jogadores', uploadImage: 'Enviar imagem', popular: 'Populares', latest: 'Recentes', like: 'Curtir', reply: 'Responder', publish: 'Publicar' },
  'ru-RU': { ...en, close: 'Закрыть сведения о метке', details: 'Подробности', comments: 'Комментарии', description: 'Описание метки', drops: 'Добыча', gallery: 'Снимки игроков', uploadImage: 'Загрузить изображение', popular: 'Популярные', latest: 'Новые', like: 'Нравится', reply: 'Ответить', publish: 'Опубликовать' },
  'th-TH': { ...en, close: 'ปิดรายละเอียดหมุด', details: 'รายละเอียด', comments: 'ความคิดเห็น', description: 'คำอธิบายหมุด', drops: 'ไอเทมที่ดรอป', gallery: 'ภาพจากผู้เล่น', uploadImage: 'อัปโหลดภาพ', popular: 'ยอดนิยม', latest: 'ล่าสุด', like: 'ถูกใจ', reply: 'ตอบกลับ', publish: 'เผยแพร่' },
  'tr-TR': { ...en, close: 'İşaret ayrıntılarını kapat', details: 'Ayrıntılar', comments: 'Yorumlar', description: 'İşaret açıklaması', drops: 'Düşen eşyalar', gallery: 'Oyuncu görselleri', uploadImage: 'Görsel yükle', popular: 'Popüler', latest: 'En yeni', like: 'Beğen', reply: 'Yanıtla', publish: 'Yayınla' },
  'vi-VN': { ...en, close: 'Đóng chi tiết điểm', details: 'Chi tiết', comments: 'Bình luận', description: 'Mô tả điểm', drops: 'Vật phẩm rơi', gallery: 'Ảnh người chơi', uploadImage: 'Tải ảnh lên', popular: 'Phổ biến', latest: 'Mới nhất', like: 'Thích', reply: 'Trả lời', publish: 'Đăng' },
  'zh-CN': { ...en, close: '关闭点位详情', details: '详情', comments: '留言', scrollArea: '点位内容，可滚动', collapseSection: '收起{{title}}', expandSection: '展开{{title}}', description: '点位说明', drops: '击败掉落', gallery: '玩家图片', galleryDescription: '帮助其他玩家确认地形与入口', uploadImage: '上传图片', galleryReviewNote: '图片经社区审核后公开，最多上传 3 张。', commentCount: '{{count}} 条留言', popular: '热门', latest: '最新', like: '点赞', reply: '回复', viewReplies: '查看 {{count}} 条回复', commentPlaceholder: '分享这个点位的实用信息', attachImages: '添加图片', attachmentLimit: '最多 3 张', publish: '发布' },
  'zh-TW': { ...en, close: '關閉點位詳情', details: '詳情', comments: '留言', scrollArea: '點位內容，可捲動', collapseSection: '收起{{title}}', expandSection: '展開{{title}}', description: '點位說明', drops: '擊敗掉落', gallery: '玩家圖片', galleryDescription: '幫助其他玩家確認地形與入口', uploadImage: '上傳圖片', galleryReviewNote: '圖片經社群審核後公開，最多上傳 3 張。', commentCount: '{{count}} 則留言', popular: '熱門', latest: '最新', like: '讚', reply: '回覆', viewReplies: '查看 {{count}} 則回覆', commentPlaceholder: '分享這個點位的實用資訊', attachImages: '加入圖片', attachmentLimit: '最多 3 張', publish: '發佈' },
}

import type { Language } from './i18n'

// Version-history page chrome, merged into the `translation` namespace under the
// `changelog` key (see i18n.ts). The entry text itself is NOT here — it lives in
// src/changelog.json with its own per-locale text, resolved by resolveChangelog.
export interface ChangelogStrings {
  /** Page title + mobile header. */
  title: string
  /** Badge on the newest version. */
  current: string
  /** Shown when the file somehow has no entries. */
  empty: string
  /** ChangeKind → badge label. */
  kind: {
    feature: string
    improvement: string
    fix: string
    data: string
  }
}

export const CHANGELOG_STRINGS: Record<Language, ChangelogStrings> = {
  'en-US': {
    title: 'Version History',
    current: 'Current',
    empty: 'No entries yet.',
    kind: { feature: 'New', improvement: 'Improved', fix: 'Fixed', data: 'Data' },
  },
  'de-DE': {
    title: 'Versionsverlauf',
    current: 'Aktuell',
    empty: 'Noch keine Einträge.',
    kind: { feature: 'Neu', improvement: 'Verbessert', fix: 'Behoben', data: 'Daten' },
  },
  'es-ES': {
    title: 'Historial de versiones',
    current: 'Actual',
    empty: 'Aún no hay entradas.',
    kind: { feature: 'Nuevo', improvement: 'Mejorado', fix: 'Corregido', data: 'Datos' },
  },
  'es-MX': {
    title: 'Historial de versiones',
    current: 'Actual',
    empty: 'Aún no hay entradas.',
    kind: { feature: 'Nuevo', improvement: 'Mejorado', fix: 'Corregido', data: 'Datos' },
  },
  'fr-FR': {
    title: 'Historique des versions',
    current: 'Actuelle',
    empty: 'Aucune entrée pour le moment.',
    kind: { feature: 'Nouveau', improvement: 'Amélioré', fix: 'Corrigé', data: 'Données' },
  },
  'id-ID': {
    title: 'Riwayat Versi',
    current: 'Saat ini',
    empty: 'Belum ada entri.',
    kind: { feature: 'Baru', improvement: 'Ditingkatkan', fix: 'Diperbaiki', data: 'Data' },
  },
  'it-IT': {
    title: 'Cronologia versioni',
    current: 'Attuale',
    empty: 'Nessuna voce per ora.',
    kind: { feature: 'Nuovo', improvement: 'Migliorato', fix: 'Corretto', data: 'Dati' },
  },
  'ja-JP': {
    title: '更新履歴',
    current: '現在',
    empty: 'まだ項目がありません。',
    kind: { feature: '新機能', improvement: '改善', fix: '修正', data: 'データ' },
  },
  'ko-KR': {
    title: '업데이트 내역',
    current: '현재',
    empty: '아직 항목이 없습니다.',
    kind: { feature: '신규', improvement: '개선', fix: '수정', data: '데이터' },
  },
  'pl-PL': {
    title: 'Historia wersji',
    current: 'Aktualna',
    empty: 'Brak wpisów.',
    kind: { feature: 'Nowe', improvement: 'Ulepszone', fix: 'Naprawione', data: 'Dane' },
  },
  'pt-BR': {
    title: 'Histórico de versões',
    current: 'Atual',
    empty: 'Ainda não há entradas.',
    kind: { feature: 'Novo', improvement: 'Melhorado', fix: 'Corrigido', data: 'Dados' },
  },
  'ru-RU': {
    title: 'История версий',
    current: 'Текущая',
    empty: 'Пока нет записей.',
    kind: { feature: 'Новое', improvement: 'Улучшено', fix: 'Исправлено', data: 'Данные' },
  },
  'th-TH': {
    title: 'ประวัติเวอร์ชัน',
    current: 'ปัจจุบัน',
    empty: 'ยังไม่มีรายการ',
    kind: { feature: 'ใหม่', improvement: 'ปรับปรุง', fix: 'แก้ไข', data: 'ข้อมูล' },
  },
  'tr-TR': {
    title: 'Sürüm geçmişi',
    current: 'Güncel',
    empty: 'Henüz kayıt yok.',
    kind: { feature: 'Yeni', improvement: 'İyileştirildi', fix: 'Düzeltildi', data: 'Veri' },
  },
  'vi-VN': {
    title: 'Lịch sử phiên bản',
    current: 'Hiện tại',
    empty: 'Chưa có mục nào.',
    kind: { feature: 'Mới', improvement: 'Cải tiến', fix: 'Đã sửa', data: 'Dữ liệu' },
  },
  'zh-CN': {
    title: '更新历史',
    current: '当前',
    empty: '暂无记录。',
    kind: { feature: '新增', improvement: '优化', fix: '修复', data: '数据' },
  },
  'zh-TW': {
    title: '更新歷史',
    current: '目前',
    empty: '暫無記錄。',
    kind: { feature: '新增', improvement: '最佳化', fix: '修復', data: '資料' },
  },
}

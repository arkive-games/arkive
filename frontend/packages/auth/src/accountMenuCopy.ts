export function accountMenuCopy(language?: string) {
  switch (language) {
    case 'zh-CN': return { profile: '个人主页', settings: '网站设置', moderation: '内容审核' }
    case 'zh-TW': return { profile: '個人主頁', settings: '網站設定', moderation: '內容審核' }
    case 'ja-JP': return { profile: 'マイプロフィール', settings: 'サイト設定', moderation: 'コンテンツ審査' }
    case 'ko-KR': return { profile: '내 프로필', settings: '사이트 설정', moderation: '콘텐츠 검토' }
    default: return { profile: 'My profile', settings: 'Website settings', moderation: 'Content moderation' }
  }
}

export function accountProfileHref(homeUrl: string) {
  return `${homeUrl.split('#')[0]}#account/edit`
}

export function accountModerationHref(homeUrl: string) {
  return `${homeUrl.split('#')[0]}#moderation`
}

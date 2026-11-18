export function accountMenuCopy(language?: string) {
  switch (language) {
    case 'zh-CN': return { profile: '个人主页', settings: '网站设置', moderation: '图片审核' }
    case 'zh-TW': return { profile: '個人主頁', settings: '網站設定', moderation: '圖片審核' }
    case 'ja-JP': return { profile: 'マイプロフィール', settings: 'サイト設定', moderation: '画像の審査' }
    case 'ko-KR': return { profile: '내 프로필', settings: '사이트 설정', moderation: '이미지 검토' }
    default: return { profile: 'My profile', settings: 'Website settings', moderation: 'Image moderation' }
  }
}

export function accountProfileHref(homeUrl: string) {
  return `${homeUrl.split('#')[0]}#account/edit`
}

export function accountModerationHref(homeUrl: string) {
  return `${homeUrl.split('#')[0]}#moderation/images`
}

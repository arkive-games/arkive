/** Shared site-link labels; the portal remains the owner of its public dialogs. */
const labels = {
  'en-US': { about: 'About Arkive', contact: 'Contact us', updates: 'Updates' },
  'zh-CN': { about: '关于藏舟', contact: '联系我们', updates: '更新日志' },
  'zh-TW': { about: '關於藏舟', contact: '聯絡我們', updates: '更新日誌' },
}

export function footerStringsFor(locale: string) {
  return locale.startsWith('zh')
    ? labels[locale === 'zh-TW' || locale === 'zh-HK' ? 'zh-TW' : 'zh-CN']
    : labels['en-US']
}

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export function FooterShore({ children }: { children?: ReactNode }) {
  const { t } = useTranslation()
  return (
    <div className="footer-shore">
      <div className="footer-shore-art" aria-hidden="true"><ShoreWaves /></div>
      <div className="footer-shore-caption">
        {children ?? <div className="footer-about-domain">
          <b>www.Arkive.games</b>
          <span>{t('footerDialogs.about.arrived')} ⚓</span>
        </div>}
      </div>
    </div>
  )
}

function ShoreWaves() {
  return (
    <>
      <svg className="footer-shore-waves" viewBox="0 0 512 48" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 26c32-10 64-10 96 0s64 10 96 0 64-10 96 0 64 10 96 0 64-10 96 0 32 5 32 5V48H0Z" fill="#2f8fb5" opacity=".55" />
        <path d="M0 32c40-9 72-9 108 0s70 9 104 0 70-9 106 0 72 9 104 0 58-6 90 0V48H0Z" fill="#1f6f99" />
      </svg>
      <svg className="footer-shore-ship" viewBox="0 0 32 28" aria-hidden="true">
        <path d="M15 2v17H6Z" fill="#ffd08a" />
        <path d="M17 6v13h8Z" fill="#ffb398" />
        <path d="M3 20h26l-4 6H7Z" fill="#40251c" />
      </svg>
    </>
  )
}

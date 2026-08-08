import { useTranslation } from 'react-i18next'
import {
  IconAt,
  IconBell,
  IconMessageCircle,
  IconSpeakerphone,
  IconThumbUp,
} from '@tabler/icons-react'
import { avatarUrl, CURRENT_USER_AVATAR_SEED } from './userSystemData'

const NOTIFICATION_LINKS = [
  { key: 'replies', icon: IconMessageCircle },
  { key: 'mentions', icon: IconAt },
  { key: 'likes', icon: IconThumbUp },
  { key: 'system', icon: IconSpeakerphone },
] as const

export function AuthenticatedControls() {
  const { t } = useTranslation()

  return (
    <div className="authenticated-controls">
      <div className="notification-control">
        <a
          href="#notifications/settings"
          className="notification-trigger"
          aria-label={t('userSystem.notifications.open')}
        >
          <IconBell className="size-5" stroke={1.8} aria-hidden="true" />
          <span>{t('userSystem.notifications.label')}</span>
        </a>
        <div className="notification-popover" role="menu" aria-label={t('userSystem.notifications.menuLabel')}>
          {NOTIFICATION_LINKS.map(({ key, icon: Icon }) => (
            <a key={key} href={`#notifications/${key}`} role="menuitem">
              <Icon className="size-5" stroke={1.8} aria-hidden="true" />
              <span>{t(`userSystem.notifications.${key}`)}</span>
            </a>
          ))}
        </div>
      </div>

      <a href="#account/edit" className="account-avatar-link" aria-label={t('userSystem.account.open')}>
        <img src={avatarUrl(CURRENT_USER_AVATAR_SEED, 96)} alt="" />
      </a>
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import {
  IconAt,
  IconBell,
  IconMessageCircle,
  IconSpeakerphone,
  IconThumbUp,
} from '@tabler/icons-react'
import { useAuth } from '@gamemap/auth'
import { DEFAULT_AVATAR_SRC } from './avatarPresets'
import { useUserSystem } from './UserSystemState'

const NOTIFICATION_LINKS = [
  { key: 'replies', icon: IconMessageCircle },
  { key: 'mentions', icon: IconAt },
  { key: 'likes', icon: IconThumbUp },
  { key: 'system', icon: IconSpeakerphone },
] as const

export function AuthenticatedControls() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const { state } = useUserSystem()
  if (!user) return null

  const avatarSrc = state.profile.avatarSrc ?? DEFAULT_AVATAR_SRC
  const hasUnread = state.readNotificationSections.length < NOTIFICATION_LINKS.length

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
          {hasUnread && <span className="notification-unread-dot" aria-hidden="true" />}
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
        <img src={avatarSrc} alt={user.name} />
      </a>
    </div>
  )
}

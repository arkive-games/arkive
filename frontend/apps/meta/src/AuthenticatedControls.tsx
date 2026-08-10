import { useRef, useState, type FocusEvent } from 'react'
import { useTranslation } from 'react-i18next'
import {
  IconAt,
  IconBell,
  IconMessageCircle,
  IconSettings,
  IconSpeakerphone,
  IconThumbUp,
} from '@tabler/icons-react'
import { useAuth } from '@gamemap/auth'
import { MENU_CONTENT_CLASS, MENU_ITEM_CLASS, cn } from '@gamemap/ui'
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
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const triggerRef = useRef<HTMLAnchorElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const skipNextFocusOpenRef = useRef(false)
  if (!user) return null

  const avatarSrc = state.profile.avatarSrc ?? DEFAULT_AVATAR_SRC
  const hasUnread = state.readNotificationSections.length < NOTIFICATION_LINKS.length
  const closeNotificationsAndRestoreFocus = () => {
    skipNextFocusOpenRef.current = true
    setNotificationsOpen(false)
    triggerRef.current?.focus()
  }

  return (
    <div className="authenticated-controls">
      <div
        className="notification-control"
        onPointerEnter={() => setNotificationsOpen(true)}
        onPointerLeave={() => setNotificationsOpen(false)}
        onFocus={() => {
          if (skipNextFocusOpenRef.current) {
            skipNextFocusOpenRef.current = false
            return
          }
          setNotificationsOpen(true)
        }}
        onBlur={(event: FocusEvent<HTMLDivElement>) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setNotificationsOpen(false)
        }}
      >
        <a
          ref={triggerRef}
          href="#notifications/settings"
          className="notification-trigger"
          aria-haspopup="menu"
          aria-expanded={notificationsOpen}
          aria-label={t('userSystem.notifications.open')}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setNotificationsOpen(false)
              event.currentTarget.blur()
            }
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setNotificationsOpen(true)
              window.setTimeout(() => {
                menuRef.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
              }, 0)
            }
          }}
        >
          <IconBell className="size-5" stroke={1.8} aria-hidden="true" />
          <span>{t('userSystem.notifications.label')}</span>
          {hasUnread && <span className="notification-unread-dot" aria-hidden="true" />}
        </a>
        {notificationsOpen && (
          <div
            ref={menuRef}
            className={cn('notification-popover', MENU_CONTENT_CLASS)}
            role="menu"
            aria-label={t('userSystem.notifications.menuLabel')}
          >
            <div className="notification-popover-header">
              <span>{t('userSystem.notifications.center')}</span>
              {hasUnread && (
                <span className="notification-popover-count">
                  {NOTIFICATION_LINKS.length - state.readNotificationSections.length}
                </span>
              )}
            </div>
            {NOTIFICATION_LINKS.map(({ key, icon: Icon }) => {
              const unread = !state.readNotificationSections.includes(key)
              return (
                <a
                  key={key}
                  href={`#notifications/${key}`}
                  role="menuitem"
                  className={cn('notification-popover-item', MENU_ITEM_CLASS)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') closeNotificationsAndRestoreFocus()
                  }}
                >
                  <Icon className="size-4 text-muted-foreground" stroke={1.8} aria-hidden="true" />
                  <span className="flex-1">{t(`userSystem.notifications.${key}`)}</span>
                  {unread && <i aria-hidden="true" />}
                </a>
              )
            })}
            <div className="notification-popover-separator" role="separator" />
            <a
              className={MENU_ITEM_CLASS}
              href="#notifications/settings"
              role="menuitem"
              onKeyDown={(event) => {
                if (event.key === 'Escape') closeNotificationsAndRestoreFocus()
              }}
            >
              <IconSettings className="size-4 text-muted-foreground" stroke={1.8} aria-hidden="true" />
              <span className="flex-1">{t('userSystem.notifications.settings')}</span>
            </a>
          </div>
        )}
      </div>

      <a href="#account/edit" className="account-avatar-link" aria-label={t('userSystem.account.open')}>
        <img src={avatarSrc} alt={user.name} />
      </a>
    </div>
  )
}

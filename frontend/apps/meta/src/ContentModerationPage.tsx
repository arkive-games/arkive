import { useTranslation } from 'react-i18next'
import { useAuth, useModerationAccess } from '@gamemap/auth'
import { Button, PageSkeleton } from '@gamemap/ui'
import { ContentModerationWorkspace } from './moderation/ContentModerationWorkspace'
import { LegacyMarkerImageQueue } from './moderation/LegacyMarkerImageQueue'
import { createModerationGateway } from './moderation/apiGateway'

/** Protected entrance; a policy-compatible server adapter is a rollout gate. */
export function ContentModerationPage({ onSignIn }: { onSignIn: () => void }) {
  const auth = useAuth()
  const access = useModerationAccess()
  const { t } = useTranslation()
  if (access.status === 'allowed' && auth.user) return <ContentModerationWorkspace key={auth.user.id}
    gateway={createModerationGateway(auth.client.requestClient, access.games, Boolean(auth.user.isSuperuser))} siteAdministrator={Boolean(auth.user.isSuperuser)}
    initialSection={window.location.hash === '#moderation/images' ? 'legacy' : 'pending'}
    legacy={<LegacyMarkerImageQueue client={auth.client.requestClient} />} />
  return <main className="arkive-content-page mx-auto w-full max-w-[var(--arkive-content-wide-data)] flex-1 px-[var(--arkive-page-gutter)] pb-12">
    <h1 className="sr-only">{t('contentModeration.title')}</h1>
    {access.status === 'checking' ? <PageSkeleton label={t('moderation.checking')} />
      : access.status === 'anonymous' ? <div className="space-y-4 py-12"><p className="text-sm">{t(auth.enabled ? 'moderation.signInRequired' : 'moderation.unavailable')}</p>{auth.enabled ? <Button className="min-h-11 rounded-full" onClick={onSignIn}>{t('moderation.signIn')}</Button> : null}</div>
        : access.status === 'error' ? <div role="alert" className="space-y-4 py-12"><p className="text-sm">{t('moderation.loadFailed')}</p><Button variant="outline" className="min-h-11 rounded-full" onClick={access.retry}>{t('moderation.retry')}</Button></div>
          : <p role="alert" className="py-12 text-sm">{t('contentModeration.forbidden')}</p>}
  </main>
}

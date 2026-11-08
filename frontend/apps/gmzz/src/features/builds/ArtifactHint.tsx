import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Hint, HoverCard, HoverCardContent, HoverCardTrigger, useIsMobile } from '@gamemap/ui'
import { IconTile } from '../equipment/PickerModal'
import { plainText } from '../fellows/data'
import type { Artifact } from '../relics/data'
import { iconUrl } from '../../lib/urls'

export function ArtifactHint({ artifact, interactive = false, children }: { artifact?: Artifact; interactive?: boolean; children: ReactElement }) {
  const { t } = useTranslation()
  const mobile = useIsMobile()
  if (!artifact) return children
  const content = <div className="text-sm text-foreground">
    <div className="flex items-center gap-3 border-b border-border bg-muted/40 p-4 pr-14 md:pr-4">
      <IconTile quality={artifact.quality} src={artifact.icon ? iconUrl(artifact.icon) : undefined} label={artifact.name.slice(0, 1)} className="size-14" />
      <div className="min-w-0 space-y-1"><h3 className="break-words text-base font-semibold">{artifact.name}</h3><p className="text-xs text-muted-foreground">{artifact.groupName ?? t('builds.sealed')}</p></div>
    </div>
    <p className="whitespace-pre-line p-4 leading-relaxed">{plainText(artifact.description)}</p>
  </div>
  if (!mobile) return <HoverCard openDelay={150} closeDelay={100}><HoverCardTrigger asChild>{children}</HoverCardTrigger><HoverCardContent side="top" className="w-96 p-0" role="dialog" aria-label={artifact.name}>{content}</HoverCardContent></HoverCard>
  return <div className="relative min-w-0 [&>span]:flex [&>span]:w-full"><Hint srTitle={artifact.name} mobileTrigger={interactive ? 'icon' : 'child'} iconLabel={t('builds.artifactDetails') + ' · ' + artifact.name}
    iconClassName="absolute right-1 top-1 z-20 size-7 bg-background text-foreground" sheetClassName="gap-0 p-0 [&>[data-slot=sheet-header]]:sr-only" bodyClassName="whitespace-normal" content={content}>{children}</Hint></div>
}

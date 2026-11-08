import type { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock3, Sparkles } from 'lucide-react'
import { Hint, HoverCard, HoverCardContent, HoverCardTrigger, useIsMobile } from '@gamemap/ui'
import { IconTile } from '../equipment/PickerModal'
import { plainText } from '../fellows/data'
import { skillIcon, type Skill } from './data'

export function SkillHint({ skill, treeId, owner, interactive = false, children }: {
  skill: Skill; treeId?: number; owner: string; interactive?: boolean; children: ReactElement
}) {
  const { t } = useTranslation()
  const mobile = useIsMobile()
  const effects = (skill.talentEffects ?? []).filter((effect) => effect.treeId === treeId)
  const content = <div className="text-sm text-foreground">
    <div className="flex items-center gap-3 border-b border-border bg-muted/40 p-4 pr-14 md:pr-4">
      <IconTile quality={null} src={skillIcon(skill.icon)} label={skill.name.slice(0, 1)} className="size-14" />
      <div className="min-w-0 space-y-1">
        <h3 className="break-words text-base font-semibold">{skill.name}</h3>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {owner && <span>{owner}</span>}
          {skill.cooldown != null && <span className="inline-flex items-center gap-1"><Clock3 className="size-3.5" aria-hidden />{t('builds.cooldown', { n: skill.cooldown })}</span>}
        </div>
      </div>
    </div>
    <div className="space-y-3 p-4">
      {skill.tags.length > 0 && <div className="flex flex-wrap gap-1.5">{skill.tags.map((tag) => <span key={tag} className="rounded bg-muted px-2 py-1 text-xs text-muted-foreground">{tag}</span>)}</div>}
      <p className="whitespace-pre-line leading-relaxed">{plainText(skill.description || skill.brief)}</p>
    </div>
    {effects.length > 0 && <div className="space-y-3 border-t border-border bg-primary/5 p-4">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-primary"><Sparkles className="size-3.5" aria-hidden />{t('builds.talent')} · {t('builds.maxTalent')}</p>
      {effects.map((effect) => <div key={effect.nodeId} className="space-y-1">
        <p className="font-medium">{effect.name}</p>
        <p className="whitespace-pre-line leading-relaxed text-muted-foreground">{plainText(effect.description)}</p>
      </div>)}
    </div>}
  </div>
  if (!mobile) return <HoverCard openDelay={150} closeDelay={100}>
    <HoverCardTrigger asChild>{children}</HoverCardTrigger>
    <HoverCardContent side="top" align="center" className="w-96 p-0" role="dialog" aria-label={skill.name}>{content}</HoverCardContent>
  </HoverCard>
  return <div className="relative min-w-0 [&>span]:flex [&>span]:w-full">
    <Hint srTitle={skill.name} mobileTrigger={interactive ? 'icon' : 'child'} iconLabel={t('builds.details') + ' · ' + skill.name}
      iconClassName="absolute right-1 top-1 z-20 size-7 bg-background text-foreground"
      sheetClassName="gap-0 p-0 [&>[data-slot=sheet-header]]:sr-only" bodyClassName="whitespace-normal" content={content}>
      {children}
    </Hint>
  </div>
}


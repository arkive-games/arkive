import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { IconTile } from '@/features/equipment/PickerModal'
import { fellowPortraitUrl, type Fellow, type FellowRelation } from '@/features/fellows/data'
import { clampSkillLevel, type BondsDraft } from '@/features/score/bonds'
import { carriedFellowSkill, fellowOptions, MAX_FELLOW_STAR, starMap } from '@/features/score/fellowSkill'
import LevelAllDialog from '@/features/score/LevelAllDialog'
import { useCharacterReadOnly } from '@/features/characters/CharacterProvider'

const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--arkive-nav-accent)]'

/**
 * The 人脉 panel: every connection with its stars and the relation its skill
 * is scored with; clicking a portrait carries that connection's skill.
 *
 * A relation's tier is never typed — it is the lowest star among its members
 * plus one, so the stars alone settle it. The relation picker on a card only
 * lists relations already formed that boost that connection; picking one
 * carries the connection with it. Clicking the carried portrait again goes
 * back to carrying whichever skill scores most.
 */
export default function FellowSkillCalculator({
  fellows,
  relations,
  draft,
  setDraft,
  lead,
}: {
  fellows: Fellow[]
  relations: FellowRelation[]
  draft: BondsDraft
  setDraft: (update: (prev: BondsDraft) => BondsDraft) => void
  /** The row under the head, level with the 秘偶 panel's. */
  lead?: ReactNode
}) {
  const { t } = useTranslation()
  const readOnly = useCharacterReadOnly()
  const entries =useMemo(() => draft.fellows ?? [], [draft.fellows])
  const stars = useMemo(() => starMap(entries), [entries])
  const skillLevel = clampSkillLevel(draft.puppetSkillLevel)
  const carried = carriedFellowSkill(entries, fellows, relations, draft.fellowSkillId, draft.fellowRelationId, skillLevel)
  const autoCarry = draft.fellowSkillId == null || !stars.has(draft.fellowSkillId)
  const ordered = useMemo(() => [...fellows].sort((a, b) => b.quality - a.quality || a.order - b.order || a.id - b.id), [fellows])

  const setStar = (fellowId: number, star: number | null) =>
    setDraft((prev) => {
      const rest = (prev.fellows ?? []).filter((entry) => entry.fellowId !== fellowId)
      if (star === null) {
        return { ...prev, fellows: rest, fellowSkillId: prev.fellowSkillId === fellowId ? null : prev.fellowSkillId }
      }
      return { ...prev, fellows: [...rest, { fellowId, star }] }
    })
  const carry = (fellowId: number | null, relationId: number | null = null) =>
    setDraft((prev) => ({ ...prev, fellowSkillId: fellowId, fellowRelationId: relationId }))

  return (
    <div className="gz-panel gz-tint" data-testid="bonds-fellows">
      <div className="gz-panel-head">
        <h3>{t('bonds.fellowsTitle')}</h3>
        <span className="meta">{t('bonds.fellowsMeta')}</span>
        <div className="acts">
          <LevelAllDialog title={t('bonds.levelAllFellows')} hint={t('bonds.levelAllFellowsHint')} label={t('bonds.levelAllFellowsLabel')}
            apply={t('bonds.levelAllFellowsApply')} min={0} max={MAX_FELLOW_STAR} initial={MAX_FELLOW_STAR}
            format={(value) => t('bonds.fellowStar', { star: value })} disabled={readOnly}
            testId="bonds-fellow-level-all"
            // Every connection, owned or not: starring an unowned one adds it.
            onApply={(value) => setDraft((prev) => ({
              ...prev,
              fellows: fellows.map((fellow) => ({ fellowId: fellow.id, star: value })),
            }))} />
        </div>
      </div>
      {lead}
      <ul className="gz-people fellows">
        {ordered.map((fellow) => {
          const star = stars.get(fellow.id)
          const isCarried = carried?.fellow.id === fellow.id
          // Only relations already formed are a choice; none formed means the skill scores alone.
          const options = fellowOptions(fellow, relations, stars, skillLevel).flatMap((option) => (option.relation ? [option.relation] : []))
          const relationId = isCarried ? carried?.relation?.id : options[0]?.id
          return (
            <li key={fellow.id} className={`gz-person ${isCarried ? 'on' : ''} ${star === undefined ? 'zero' : ''}`} data-testid={`bonds-fellow-${fellow.id}`}>
              <button
                type="button"
                disabled={star === undefined}
                aria-pressed={isCarried}
                title={fellow.skill.name}
                aria-label={t('bonds.fellowCarryToggle', { name: fellow.name })}
                onClick={() => carry(isCarried && !autoCarry ? null : fellow.id)}
                className="gz-face"
                data-testid={`bonds-fellow-carry-${fellow.id}`}
              >
                <IconTile quality={fellow.quality} src={fellow.portrait ? fellowPortraitUrl(fellow.portrait) : undefined} alt={fellow.name} label={fellow.name.slice(0, 1)} className="size-14" />
              </button>
              {isCarried ? <span className="gz-carry" data-testid={`bonds-fellow-carried-${fellow.id}`}>{t('bonds.skillCarried')}</span> : null}
              <b title={fellow.name}>{fellow.shortName || fellow.name}</b>
              <StarPicker star={star} name={fellow.name} testId={`bonds-fellow-star-${fellow.id}`} onChange={(next) => setStar(fellow.id, next)} />
              <select
                className={`gz-rel ${FOCUS}`}
                aria-label={t('bonds.fellowRelationFor', { name: fellow.name })}
                disabled={options.length === 0}
                value={relationId ?? ''}
                onChange={(event) => carry(fellow.id, event.target.value === '' ? null : Number(event.target.value))}
                data-testid={`bonds-fellow-relation-${fellow.id}`}
              >
                {options.length === 0 ? <option value="">{t('bonds.fellowRelationNone')}</option> : null}
                {options.map((relation) => (
                  <option key={relation.id} value={relation.id}>{relation.name}</option>
                ))}
              </select>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/**
 * A connection's stars: 有/无 toggles owned, then one click per star. Clicking
 * the lit top star steps it down one.
 */
function StarPicker({ star, name, testId, onChange }: {
  star: number | undefined; name: string; testId: string; onChange: (star: number | null) => void
}) {
  const { t } = useTranslation()
  const owned = star !== undefined
  return (
    <span className="gz-stars" role="group" aria-label={t('bonds.fellowStarFor', { name })} data-testid={testId}
      data-star={owned ? star : 'none'}>
      <button type="button" className={`own ${owned ? 'on' : ''}`} aria-pressed={owned}
        aria-label={t(owned ? 'bonds.fellowSetUnowned' : 'bonds.fellowSetOwned', { name })}
        onClick={() => onChange(owned ? null : 0)} data-testid={`${testId}-own`}>
        {t(owned ? 'bonds.fellowOwned' : 'bonds.fellowUnowned')}
      </button>
      {Array.from({ length: MAX_FELLOW_STAR }, (_, index) => {
        const value = index + 1
        const lit = owned && value <= star
        return (
          <button key={value} type="button" className={lit ? 'on' : ''} aria-label={t('bonds.fellowStar', { star: value })}
            aria-pressed={owned && star === value}
            onClick={() => onChange(owned && star === value ? value - 1 : value)}
            data-testid={`${testId}-${value}`}>
            ★
          </button>
        )
      })}
    </span>
  )
}

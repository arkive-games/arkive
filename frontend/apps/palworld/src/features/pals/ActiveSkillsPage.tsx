import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Check, Minus } from 'lucide-react'
import { Input } from '@gamemap/ui'
import { ContentPage } from '../../components/ContentPage'
import { FilterChip, FilterRow, toggleValue } from '../../components/FilterChip'
import {
  loadPals,
  buildActiveSkills,
  ELEMENTS,
  type Element,
  type ActiveSkillEntry,
  type PalsBundle,
} from '../../lib/pals'
import { elementIconUrl } from '../../lib/assets'
import { PalPageLoading, formatSkillRange } from './components'

export default function ActiveSkillsPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [bundle, setBundle] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [elementSel, setElementSel] = useState<Element[]>([])
  const [typeSel, setTypeSel] = useState<string[]>([])
  const [sourceSel, setSourceSel] = useState<string[]>([])

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    loadPals(lng)
      .then((b) => {
        if (!cancelled) setBundle(b)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  const all = useMemo<ActiveSkillEntry[]>(() => (bundle ? buildActiveSkills(bundle) : []), [bundle])

  // Elements actually present, in canonical order, for the element filter.
  const elements = useMemo(() => {
    const present = new Set<Element>()
    for (const s of all) present.add(s.element)
    return ELEMENTS.filter((e) => present.has(e))
  }, [all])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    return all
      .filter((s) => elementSel.length === 0 || elementSel.includes(s.element))
      .filter((s) => typeSel.length === 0 || typeSel.includes(s.melee ? 'melee' : 'ranged'))
      .filter((s) => sourceSel.length === 0 || sourceSel.includes(s.isFruit ? 'fruit' : 'default'))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.wazaId.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      )
      // Canonical, locale-stable order: by element, then power desc, then id.
      .sort(
        (a, b) =>
          ELEMENTS.indexOf(a.element) - ELEMENTS.indexOf(b.element) ||
          b.power - a.power ||
          a.wazaId.localeCompare(b.wazaId),
      )
  }, [all, query, elementSel, typeSel, sourceSel])

  return (
    <ContentPage active="/active-skills" title={t('pal.section.activeSkills')}>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          className="max-w-sm"
          data-testid="active-skill-search"
        />
        {bundle ? (
          <span className="text-sm text-muted-foreground">{t('resultsCount', { count: list.length })}</span>
        ) : null}
      </div>

      {bundle ? (
        <div className="mb-4 space-y-1.5">
          <FilterRow label={t('activeSkill.element')} testId="active-skill-element-filter">
            {elements.map((e) => (
              <FilterChip
                key={e}
                active={elementSel.includes(e)}
                onClick={() => setElementSel((s) => toggleValue(s, e) as Element[])}
                testId={`element-${e}`}
              >
                <span className="inline-flex items-center gap-1">
                  <img src={elementIconUrl(e)} alt="" width={16} height={16} className="size-4 object-contain" />
                  {bundle.enums.elements[e] ?? e}
                </span>
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label={t('pal.type')} testId="active-skill-type-filter">
            {(['melee', 'ranged'] as const).map((tp) => (
              <FilterChip
                key={tp}
                active={typeSel.includes(tp)}
                onClick={() => setTypeSel((s) => toggleValue(s, tp))}
                testId={`type-${tp}`}
              >
                {t(tp === 'melee' ? 'pal.melee' : 'pal.ranged')}
              </FilterChip>
            ))}
          </FilterRow>
          <FilterRow label={t('activeSkill.fruit')} testId="active-skill-source-filter">
            {(['fruit', 'default'] as const).map((src) => (
              <FilterChip
                key={src}
                active={sourceSel.includes(src)}
                onClick={() => setSourceSel((s) => toggleValue(s, src))}
                testId={`source-${src}`}
              >
                {t(src === 'fruit' ? 'activeSkill.has' : 'activeSkill.hasNot')}
              </FilterChip>
            ))}
          </FilterRow>
        </div>
      ) : null}

      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !bundle ? (
        <PalPageLoading />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="w-48 px-2 py-2">{t('pal.skill')}</th>
                <th className="w-full px-2 py-2">{t('pal.section.description')}</th>
                <th className="px-2 py-2">{t('pal.type')}</th>
                <th className="px-2 py-2 text-right">{t('pal.power')}</th>
                <th className="px-2 py-2 text-right">{t('pal.cooldown')}</th>
                <th className="px-2 py-2 text-right">{t('pal.range')}</th>
                <th className="px-2 py-2 text-center">{t('activeSkill.fruit')}</th>
              </tr>
            </thead>
            <tbody>
              {list.map((s) => (
                <tr
                  key={s.wazaId}
                  data-testid="active-skill-row"
                  className="border-t border-border/60 align-middle hover:bg-accent/40"
                >
                  <td className="w-48 max-w-48 px-2 py-1.5">
                    <Link
                      to="/active-skills/$id"
                      params={{ id: s.wazaId }}
                      data-testid="active-skill-link"
                      className="group flex max-w-full items-center gap-2 font-medium hover:text-primary"
                    >
                      <img
                        src={elementIconUrl(s.element)}
                        alt=""
                        width={18}
                        height={18}
                        className="size-[18px] shrink-0 object-contain"
                        onError={(e) => {
                          e.currentTarget.style.visibility = 'hidden'
                        }}
                      />
                      <span className="min-w-0 truncate group-hover:underline">{s.name}</span>
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-xs whitespace-pre-line text-muted-foreground">
                    {s.name ? s.description : s.wazaId}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                    {t(s.melee ? 'pal.melee' : 'pal.ranged')}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{s.power || '—'}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {s.coolTime}s
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {formatSkillRange(s.minRange, s.maxRange)}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {s.isFruit ? (
                      <Check
                        className="mx-auto size-4 text-emerald-600 dark:text-emerald-400"
                        data-testid="fruit-yes"
                        aria-label={t('activeSkill.fruit')}
                      />
                    ) : (
                      <Minus
                        className="mx-auto size-4 text-muted-foreground/50"
                        data-testid="fruit-no"
                        aria-label={t('activeSkill.defaultOnly')}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ContentPage>
  )
}

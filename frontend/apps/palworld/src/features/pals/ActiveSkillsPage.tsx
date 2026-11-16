import { CatalogNoResults } from '../catalog/components'
import { useCatalogState } from '../catalog/catalogMemory'
import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { Check, Minus } from 'lucide-react'
import { CatalogSearchInput, toggleValue, useIsMobile, CatalogFacetMenu, CatalogFacetOption, CatalogFacetTrack, CatalogFacetGrid, useCatalogFacetMenus } from '@gamemap/ui'
import { EncyclopediaToolbar, ContentPage, ContentPageFilters } from '../../components/ContentPage'
import { MobilePagination, useMobilePagination } from '../../components/MobilePagination'
import {
  loadPals,
  buildActiveSkills,
  ELEMENTS,
  type Element,
  type ActiveSkillEntry,
  type PalsBundle,
} from '../../lib/pals'
import { elementIconUrl, hasElementIcon } from '../../lib/assets'
import { PalPageLoading, formatSkillRange } from './components'

export default function ActiveSkillsPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  // Phones get stacked cards instead of the 720px-wide table.
  const isMobile = useIsMobile()

  const [bundle, setBundle] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useCatalogState<string>('active-skills', 'query', '')
  const [elementSel, setElementSel] = useCatalogState<Element[]>('active-skills', 'elementSel', [])
  const [typeSel, setTypeSel] = useCatalogState<string[]>('active-skills', 'typeSel', [])
  const [sourceSel, setSourceSel] = useCatalogState<string[]>('active-skills', 'sourceSel', [])

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
  const mobilePaging = useMobilePagination(list, {
    pageSize: 20,
    resetKey: `${query}|${elementSel.join(',')}|${typeSel.join(',')}|${sourceSel.join(',')}`,
  })

  const menuProps = useCatalogFacetMenus()
  const filters = bundle ? (
    <CatalogFacetTrack>
      <CatalogFacetMenu {...menuProps('elements')} label={t('activeSkill.element')}
        count={elementSel.length} testId="active-skill-element-filter">
        <CatalogFacetGrid>
          {elements.map(element => <CatalogFacetOption key={element}
            active={elementSel.includes(element)} label={bundle.enums.elements[element] ?? element}
            icon={<img src={elementIconUrl(element)} alt="" className="size-5 shrink-0 object-contain" />}
            onClick={() => setElementSel(current => toggleValue(current, element))} testId={`element-${element}`} />)}
        </CatalogFacetGrid>
      </CatalogFacetMenu>
      <CatalogFacetMenu {...menuProps('types')} label={t('pal.type')}
        count={typeSel.length} testId="active-skill-type-filter">
        <CatalogFacetGrid>
          {(['melee', 'ranged'] as const).map(type => <CatalogFacetOption key={type}
            active={typeSel.includes(type)} label={t(type === 'melee' ? 'pal.melee' : 'pal.ranged')}
            onClick={() => setTypeSel(current => toggleValue(current, type))} testId={`type-${type}`} />)}
        </CatalogFacetGrid>
      </CatalogFacetMenu>
      <CatalogFacetMenu {...menuProps('sources')} label={t('activeSkill.fruit')}
        count={sourceSel.length} testId="active-skill-source-filter">
        <CatalogFacetGrid>
          {(['fruit', 'default'] as const).map(source => <CatalogFacetOption key={source}
            active={sourceSel.includes(source)} label={t(source === 'fruit' ? 'activeSkill.has' : 'activeSkill.hasNot')}
            onClick={() => setSourceSel(current => toggleValue(current, source))} testId={`source-${source}`} />)}
        </CatalogFacetGrid>
      </CatalogFacetMenu>
    </CatalogFacetTrack>
  ) : undefined

  return (
    <ContentPage browsing={{ section: 'active-skills', ready: !!bundle, resultsKey: JSON.stringify([query,elementSel,typeSel,sourceSel]) }}
      active="/active-skills"
      title={t('pal.section.activeSkills')}
      heading
      filters={filters}
      filtersActive={elementSel.length > 0 || typeSel.length > 0 || sourceSel.length > 0}
    >
      <EncyclopediaToolbar search={<CatalogSearchInput
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          className=""
          data-testid="active-skill-search"
        />}>
            <ContentPageFilters className="space-y-1.5" />
          </EncyclopediaToolbar>

      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !bundle ? (
        <PalPageLoading />
      ) : list.length === 0 ? (
        <CatalogNoResults />
      ) : isMobile ? (
        <ul className="space-y-2">
          {mobilePaging.visibleItems.map((s) => (
            <li key={s.wazaId} data-testid="active-skill-row">
              <Link
                to="/active-skills/$id"
                params={{ id: s.wazaId }}
                data-testid="active-skill-link"
                className="block rounded-lg border border-border bg-card p-3 transition hover:bg-accent/40"
              >
                <div className="flex items-center gap-2">
                  {hasElementIcon(s.element) ? (
                    <img
                      src={elementIconUrl(s.element)}
                      alt=""
                      width={18}
                      height={18}
                      className="size-[18px] shrink-0 object-contain"
                    />
                  ) : (
                    <span className="size-[18px] shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1 truncate font-medium">{s.name}</span>
                  {s.isFruit ? (
                    <span
                      className="shrink-0 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                      data-testid="fruit-yes"
                    >
                      {t('activeSkill.fruit')}
                    </span>
                  ) : null}
                </div>
                {s.description ? (
                  <p className="mt-1 whitespace-pre-line text-xs text-muted-foreground">{s.description}</p>
                ) : null}
                <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
                  <span>{t(s.melee ? 'pal.melee' : 'pal.ranged')}</span>
                  <span className="tabular-nums">
                    {t('pal.power')}: <span className="font-medium text-foreground">{s.power || '—'}</span>
                  </span>
                  <span className="tabular-nums">
                    {t('pal.cooldown')}: {lng.startsWith('zh') ? `${s.coolTime} 秒` : `${s.coolTime}s`}
                  </span>
                  <span className="tabular-nums">
                    {t('pal.range')}: {formatSkillRange(s.minRange, s.maxRange, lng)}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
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
                      {hasElementIcon(s.element) ? (
                        <img
                          src={elementIconUrl(s.element)}
                          alt=""
                          width={18}
                          height={18}
                          className="size-[18px] shrink-0 object-contain"
                        />
                      ) : (
                        <span className="size-[18px] shrink-0" aria-hidden />
                      )}
                      <span className="min-w-0 truncate group-hover:underline">
                        {s.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-2 py-1.5 text-xs whitespace-pre-line text-muted-foreground">
                    {s.description}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-muted-foreground">
                    {t(s.melee ? 'pal.melee' : 'pal.ranged')}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{s.power || '—'}</td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {lng.startsWith('zh') ? `${s.coolTime} 秒` : `${s.coolTime}s`}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                    {formatSkillRange(s.minRange, s.maxRange, lng)}
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
      <MobilePagination
        page={mobilePaging.page}
        pageCount={mobilePaging.pageCount}
        onPageChange={mobilePaging.goToPage}
      />
    </ContentPage>
  )
}

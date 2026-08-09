import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from '@tanstack/react-router'
import { ArrowDown, ArrowUp } from 'lucide-react'
import { Input, useIsMobile } from '@gamemap/ui'
import { ContentPage, ContentPageFilters } from '../../components/ContentPage'
import { MobilePagination, useMobilePagination } from '../../components/MobilePagination'
import { FilterChip, FilterRow, toggleValue } from '../../components/FilterChip'
import {
  loadPals,
  buildPartnerSkills,
  ELEMENTS,
  PARTNER_CATEGORIES,
  type Element,
  type PartnerCategory,
  type PartnerSkillEntry,
  type PalsBundle,
} from '../../lib/pals'
import { elementIconUrl, hasElementIcon, palIconUrl } from '../../lib/assets'
import { zukanOrder } from '../../lib/palId'
import { filterStrings } from './filterStrings'
import { PalPageLoading } from './components'

/**
 * Partner Skills index. Partner skills map 1:1 to pals, so there is no detail
 * route — every entry links to its pal's detail page, where the per-rank
 * values (rank scaling, ranch production, cooldowns) live. The list itself
 * shows no per-rank numbers by design.
 */
export default function PartnerSkillsPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const fs = filterStrings(lng)
  // Phones get stacked cards instead of the 720px-wide table.
  const isMobile = useIsMobile()

  const [bundle, setBundle] = useState<PalsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [categorySel, setCategorySel] = useState<PartnerCategory[]>([])
  const [elementSel, setElementSel] = useState<Element[]>([])
  // Default order is the Paldeck (zukan) order; clicking the Power header
  // toggles power-descending / power-ascending sort.
  const [powerSort, setPowerSort] = useState<'desc' | 'asc' | null>(null)

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

  const all = useMemo<PartnerSkillEntry[]>(
    () => (bundle ? buildPartnerSkills(bundle) : []),
    [bundle],
  )

  const categories = useMemo(() => {
    const present = new Set<PartnerCategory>()
    for (const s of all) for (const c of s.categories) present.add(c)
    return PARTNER_CATEGORIES.filter((c) => present.has(c))
  }, [all])

  // Elements present among attack-shape skills, canonical order.
  const elements = useMemo(() => {
    const present = new Set<Element>()
    for (const s of all) if (s.element) present.add(s.element)
    return ELEMENTS.filter((e) => present.has(e))
  }, [all])

  const list = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = all
      .filter((s) => categorySel.length === 0 || s.categories.some((c) => categorySel.includes(c)))
      .filter((s) => elementSel.length === 0 || (s.element != null && elementSel.includes(s.element)))
      .filter(
        (s) =>
          !q ||
          s.name.toLowerCase().includes(q) ||
          s.palName.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q),
      )
    if (powerSort) {
      // Skills without a power (non-attack shapes) always sink to the bottom.
      const sign = powerSort === 'desc' ? -1 : 1
      return filtered.sort((a, b) => {
        if ((a.power == null) !== (b.power == null)) return a.power == null ? 1 : -1
        return sign * ((a.power ?? 0) - (b.power ?? 0)) || zukanOrder(a.zukanIndex) - zukanOrder(b.zukanIndex)
      })
    }
    return filtered.sort(
      (a, b) =>
        zukanOrder(a.zukanIndex) - zukanOrder(b.zukanIndex) ||
        a.zukanIndexSuffix.localeCompare(b.zukanIndexSuffix) ||
        a.palId.localeCompare(b.palId),
    )
  }, [all, query, categorySel, elementSel, powerSort])
  const mobilePaging = useMobilePagination(list, {
    pageSize: 20,
    resetKey: `${query}|${categorySel.join(',')}|${elementSel.join(',')}|${powerSort ?? ''}`,
  })

  // Category + element chips — inline on desktop, behind the mobile header's
  // filter icon (see ContentPage). The search box and the power-sort control stay
  // on the page: neither is a filter.
  const filters = bundle ? (
    <>
      <FilterRow label={t('filters.category')} testId="partner-skill-category-filter">
        {categories.map((c) => (
          <FilterChip
            key={c}
            active={categorySel.includes(c)}
            onClick={() => setCategorySel((s) => toggleValue(s, c) as PartnerCategory[])}
            testId={`category-${c}`}
          >
            {t(`partner.category.${c}`)}
          </FilterChip>
        ))}
      </FilterRow>
      <FilterRow label={t('activeSkill.element')} testId="partner-skill-element-filter">
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
    </>
  ) : undefined

  return (
    <ContentPage
      active="/partner-skills"
      title={t('partner.title')}
      heading
      filters={filters}
      filtersActive={categorySel.length > 0 || elementSel.length > 0}
    >
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search')}
          className="max-w-sm"
          data-testid="partner-skill-search"
        />
        {bundle ? (
          <span className="text-sm text-muted-foreground">{t('resultsCount', { count: list.length })}</span>
        ) : null}
      </div>

      <ContentPageFilters className="mb-4 space-y-1.5" />

      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !bundle ? (
        <PalPageLoading />
      ) : isMobile ? (
        <>
          <button
            type="button"
            onClick={() => setPowerSort((s) => (s === 'desc' ? 'asc' : 'desc'))}
            className="mb-2 inline-flex items-center gap-0.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            data-testid="partner-skill-power-sort"
          >
            {t('pal.power')}
            {powerSort === 'desc' ? (
              <ArrowDown className="size-3" />
            ) : powerSort === 'asc' ? (
              <ArrowUp className="size-3" />
            ) : null}
          </button>
          <ul className="space-y-2">
            {mobilePaging.visibleItems.map((s) => (
              <li key={s.palId} data-testid="partner-skill-row">
                <Link
                  to="/pals/$id"
                  params={{ id: s.palId }}
                  data-testid="partner-skill-pal-link"
                  className="block rounded-lg border border-border bg-card p-3 transition hover:bg-accent/40"
                >
                  <div className="flex items-center gap-2">
                    <img
                      src={palIconUrl(s.palIcon)}
                      alt=""
                      width={28}
                      height={28}
                      className="size-7 shrink-0 rounded-full object-contain"
                      loading="lazy"
                      onError={(e) => {
                        e.currentTarget.style.visibility = 'hidden'
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">{s.palName}</span>
                    {s.power != null ? (
                      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                        {t('pal.power')}: <span className="font-medium text-foreground">{s.power}</span>
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-sm font-medium">
                    {s.element && hasElementIcon(s.element) ? (
                      <img
                        src={elementIconUrl(s.element)}
                        alt=""
                        width={16}
                        height={16}
                        className="size-4 shrink-0 object-contain"
                      />
                    ) : null}
                    <span className="min-w-0 truncate">{s.name}</span>
                  </div>
                  {s.description ? (
                    <p className="line-clamp-2 text-xs text-muted-foreground">{s.description}</p>
                  ) : null}
                  {s.categories.length ? (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {s.categories.map((c) => (
                        <span
                          key={c}
                          className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium whitespace-nowrap text-secondary-foreground"
                          data-testid={`partner-skill-category-${c}`}
                        >
                          {t(`partner.category.${c}`)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
              <tr>
                <th className="w-44 px-2 py-2">{fs.col.name}</th>
                <th className="w-full px-2 py-2">{t('pal.section.partnerSkill')}</th>
                <th className="px-2 py-2">{t('filters.category')}</th>
                <th className="px-2 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setPowerSort((s) => (s === 'desc' ? 'asc' : 'desc'))}
                    className="inline-flex items-center gap-0.5 hover:text-foreground"
                    data-testid="partner-skill-power-sort"
                  >
                    {t('pal.power')}
                    {powerSort === 'desc' ? (
                      <ArrowDown className="size-3" />
                    ) : powerSort === 'asc' ? (
                      <ArrowUp className="size-3" />
                    ) : null}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {mobilePaging.visibleItems.map((s) => (
                <tr
                  key={s.palId}
                  data-testid="partner-skill-row"
                  className="border-t border-border/60 align-middle hover:bg-accent/40"
                >
                  <td className="w-44 max-w-44 px-2 py-1.5">
                    <Link
                      to="/pals/$id"
                      params={{ id: s.palId }}
                      data-testid="partner-skill-pal-link"
                      className="group flex max-w-full items-center gap-2 font-medium hover:text-primary"
                    >
                      <img
                        src={palIconUrl(s.palIcon)}
                        alt=""
                        width={28}
                        height={28}
                        className="size-7 shrink-0 rounded-full object-contain"
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.visibility = 'hidden'
                        }}
                      />
                      <span className="min-w-0 truncate group-hover:underline">{s.palName}</span>
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">
                    <Link
                      to="/pals/$id"
                      params={{ id: s.palId }}
                      className="group inline-flex max-w-full items-center gap-1.5 font-medium hover:text-primary"
                    >
                      {s.element && hasElementIcon(s.element) ? (
                        <img
                          src={elementIconUrl(s.element)}
                          alt=""
                          width={16}
                          height={16}
                          className="size-4 shrink-0 object-contain"
                        />
                      ) : null}
                      <span className="min-w-0 truncate group-hover:underline">{s.name}</span>
                    </Link>
                    {s.description ? (
                      <div className="line-clamp-2 text-xs text-muted-foreground">{s.description}</div>
                    ) : null}
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {s.categories.map((c) => (
                        <span
                          key={c}
                          className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium whitespace-nowrap text-secondary-foreground"
                          data-testid={`partner-skill-category-${c}`}
                        >
                          {t(`partner.category.${c}`)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">
                    {s.power ?? '—'}
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

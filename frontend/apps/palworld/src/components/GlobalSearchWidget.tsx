import { useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { GlobalSearch, type GlobalSearchEntry, type GlobalSearchSource } from '@gamemap/map-shell'
import { loadPals, buildActiveSkills } from '../lib/pals'
import { loadBuildings, loadItems, loadQuests, loadTech, buildingIconUrl } from '../lib/catalog'
import { loadMarkers, loadStatic } from '../lib/data'
import { itemIconUrl, palIconUrl } from '../lib/assets'
import { formatPalId, palIdText } from '../lib/palId'

/**
 * Topbar global search: every site entity (pals, skills, passives, items,
 * buildings, tech, quests, map markers) as lazily-loaded sources over the
 * existing per-language cached loaders. Selection routes to the entity's
 * detail page; markers deep-link to the map with the search box seeded
 * (`/?map=…&q=<name>`), the same link the Paldeck spawn maps use.
 */
export function GlobalSearchWidget() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'
  const navigate = useNavigate()
  // Marker entries navigate by map + localized name (the map's ?q deep link);
  // filled as a side effect of the markers source load.
  const markerNav = useRef(new Map<string, { map: string; q: string }>())

  const sources = useMemo<GlobalSearchSource[]>(() => [
    {
      key: 'pals',
      label: t('pal.title'),
      load: async () => {
        const b = await loadPals(lng)
        return b.pals.map((p) => ({
          id: p.id,
          name: b.text[p.id]?.name ?? '',
          idLabel: palIdText(formatPalId(p.zukanIndex, p.zukanIndexSuffix)),
          iconUrl: palIconUrl(p.icon),
        }))
      },
    },
    {
      key: 'skills',
      label: t('pal.section.activeSkills'),
      load: async () => {
        const b = await loadPals(lng)
        return buildActiveSkills(b)
          .filter((s) => s.name)
          .map((s) => ({ id: s.wazaId, name: s.name }))
      },
    },
    {
      key: 'passives',
      label: t('pal.section.passives'),
      load: async () => {
        const b = await loadPals(lng)
        return b.passives.map((p) => ({ id: p.id, name: b.passiveText[p.id]?.name ?? '' }))
      },
    },
    {
      key: 'items',
      label: t('item.title'),
      load: async () => {
        const b = await loadItems(lng)
        return b.items
          .filter((i) => !i.illegal)
          .map((i) => ({
            id: i.id,
            name: b.text[i.id]?.name ?? '',
            detail: b.typeLabels[i.typeA],
            iconUrl: i.icon ? itemIconUrl(i.icon) : undefined,
          }))
      },
    },
    {
      key: 'buildings',
      label: t('building.title'),
      load: async () => {
        const b = await loadBuildings(lng)
        return b.buildings.map((e) => ({
          id: e.id,
          name: b.text[e.id]?.name ?? '',
          detail: b.typeLabels[e.typeA],
          iconUrl: e.icon ? buildingIconUrl(e.icon) : undefined,
        }))
      },
    },
    {
      key: 'tech',
      label: t('tech.title'),
      load: async () => {
        const b = await loadTech(lng)
        return b.techs.map((e) => ({ id: e.id, name: b.text[e.id]?.name ?? '' }))
      },
    },
    {
      key: 'quests',
      label: t('quest.title'),
      load: async () => {
        const b = await loadQuests(lng)
        return b.quests.map((q) => ({ id: q.id, name: b.text[q.id]?.title ?? '' }))
      },
    },
    {
      key: 'markers',
      label: t('categories'),
      load: async () => {
        const { maps, mapsL10n } = await loadStatic(lng)
        const entries: GlobalSearchEntry[] = []
        for (const map of maps) {
          const { markers, l10n } = await loadMarkers(map.id, lng)
          // One entry per distinct localized name per map: the map's ?q deep
          // link shows every same-named marker at once, so duplicates here
          // would only crowd the palette.
          const seen = new Set<string>()
          for (const row of markers) {
            const name = l10n[row.id]?.name
            if (!name || seen.has(name)) continue
            seen.add(name)
            markerNav.current.set(row.id, { map: map.id, q: name })
            entries.push({ id: row.id, name, detail: mapsL10n[map.id]?.name ?? map.id })
          }
        }
        return entries
      },
    },
  ], [lng, t])

  const handleSelect = (sourceKey: string, id: string) => {
    switch (sourceKey) {
      case 'pals':
        void navigate({ to: '/pals/$id', params: { id } })
        break
      case 'skills':
        void navigate({ to: '/active-skills/$id', params: { id } })
        break
      case 'passives':
        void navigate({ to: '/passives' })
        break
      case 'items':
        void navigate({ to: '/items/$id', params: { id } })
        break
      case 'buildings':
        void navigate({ to: '/buildings/$id', params: { id } })
        break
      case 'tech':
        void navigate({ to: '/technology', search: { tech: id } })
        break
      case 'quests':
        void navigate({ to: '/quests/$id', params: { id } })
        break
      case 'markers': {
        const m = markerNav.current.get(id)
        if (m) void navigate({ to: '/', search: { map: m.map, q: m.q } })
        break
      }
    }
  }

  return (
    <GlobalSearch
      sources={sources}
      onSelect={handleSelect}
      lang={lng}
      labels={{
        button: t('search'),
        placeholder: t('globalSearch.placeholder'),
        empty: t('globalSearch.empty'),
        loading: t('globalSearch.loading'),
      }}
    />
  )
}

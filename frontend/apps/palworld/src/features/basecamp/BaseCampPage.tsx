import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '../../components/ContentPage'
import {
  loadBasecamp,
  loadBuildings,
  type BasecampFile,
  type BuildingsBundle,
} from '../../lib/catalog'
import { BuildingLink, CatalogPageLoading, CatalogDataProvider } from '../catalog/components'

/** Base-camp progression: per level the pal-worker cap, guild base cap, and the
 *  level-up task checklist (worker count + build objects). One compact table —
 *  the dataset is 35 rows (data-palworld/basecamp.json). */
export default function BaseCampPage() {
  const { t, i18n } = useTranslation()
  const lng = i18n.resolvedLanguage ?? 'en-US'

  const [file, setFile] = useState<BasecampFile | null>(null)
  const [buildings, setBuildings] = useState<BuildingsBundle | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoadError(null)
    Promise.all([loadBasecamp(), loadBuildings(lng)])
      .then(([f, b]) => {
        if (cancelled) return
        setFile(f)
        setBuildings(b)
      })
      .catch((err) => {
        console.error(err)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  return (
    <ContentPage
      active="/basecamp"
      title={t('basecamp.title', { defaultValue: 'Base Camp' })}
      heading
    >
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !file || !buildings ? (
        <CatalogPageLoading />
      ) : (
        <CatalogDataProvider buildings={buildings}>
          <p className="mb-4 text-sm text-muted-foreground">
            {t('basecamp.caption', {
              defaultValue:
                'Per base level: the Pal worker cap, how many bases your guild can hold, and the tasks to reach the next level.',
            })}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="w-px whitespace-nowrap px-3 py-2 font-medium">
                    {t('basecamp.level', { defaultValue: 'Level' })}
                  </th>
                  <th className="w-px whitespace-nowrap px-3 py-2 text-right font-medium">
                    {t('basecamp.workers', { defaultValue: 'Workers' })}
                  </th>
                  <th className="w-px whitespace-nowrap px-3 py-2 text-right font-medium">
                    {t('basecamp.bases', { defaultValue: 'Bases' })}
                  </th>
                  <th className="w-full px-3 py-2 font-medium">
                    {t('basecamp.tasks', { defaultValue: 'Level-up tasks' })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {file.levels.map((lv) => (
                  <tr key={lv.level} className="border-t border-border/60" data-testid="basecamp-row">
                    <td className="px-3 py-2 text-center font-medium tabular-nums">{lv.level}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{lv.workers}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{lv.bases}</td>
                    <td className="px-3 py-2">
                      {lv.tasks?.length ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {lv.tasks.map((task, i) =>
                            task.object ? (
                              <span key={i} className="inline-flex items-center gap-1">
                                <BuildingLink
                                  id={task.object}
                                  name={buildings.text[task.object]?.name ?? task.object}
                                  icon={buildings.byId.get(task.object)?.icon}
                                />
                                {task.count && task.count > 1 ? (
                                  <span className="text-xs tabular-nums text-muted-foreground">
                                    ×{task.count}
                                  </span>
                                ) : null}
                              </span>
                            ) : (
                              <span
                                key={i}
                                className="rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground"
                              >
                                {t('basecamp.workerTask', {
                                  defaultValue: '{{n}} Pal workers',
                                  n: task.workers,
                                })}
                              </span>
                            ),
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CatalogDataProvider>
      )}
    </ContentPage>
  )
}

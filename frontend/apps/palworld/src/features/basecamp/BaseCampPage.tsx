import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ContentPage } from '../../components/ContentPage'
import { MobilePagination, useMobilePagination } from '../../components/MobilePagination'
import {
  loadBasecamp,
  loadBuildings,
  type BasecampFile,
  type BuildingsBundle,
} from '../../lib/catalog'
import { BuildingLink, CatalogDataProvider, CatalogPageLoading } from '../catalog/components'

type BasecampTasks = BasecampFile['levels'][number]['tasks']

function TaskList({
  tasks,
  buildings,
  mobile = false,
}: {
  tasks: BasecampTasks
  buildings: BuildingsBundle
  mobile?: boolean
}) {
  const { t } = useTranslation()

  if (!tasks?.length) {
    return <span className="text-xs text-muted-foreground">-</span>
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tasks.map((task, index) =>
        task.object ? (
          <span key={`${task.object}-${index}`} className="inline-flex min-w-0 items-center gap-1">
            <BuildingLink
              id={task.object}
              name={buildings.text[task.object]?.name ?? task.object}
              icon={buildings.byId.get(task.object)?.icon}
            />
            {task.count && task.count > 1 ? (
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                x{task.count}
              </span>
            ) : null}
          </span>
        ) : (
          <span
            key={`workers-${index}`}
            className={
              mobile
                ? 'rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-xs text-foreground'
                : 'rounded bg-secondary px-1.5 py-0.5 text-xs text-secondary-foreground'
            }
          >
            {t('basecamp.workerTask', { n: task.workers })}
          </span>
        ),
      )}
    </div>
  )
}

/** Base-camp progression by level. Desktop uses the dense comparison table;
 * phones use paginated cards so no horizontal scrolling is required. */
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
      .then(([nextFile, nextBuildings]) => {
        if (cancelled) return
        setFile(nextFile)
        setBuildings(nextBuildings)
      })
      .catch((error) => {
        console.error(error)
        if (!cancelled) setLoadError(t('loadError'))
      })
    return () => {
      cancelled = true
    }
  }, [lng, t])

  const mobilePaging = useMobilePagination(file?.levels ?? [], { pageSize: 8 })

  return (
    <ContentPage active="/basecamp" title={t('basecamp.title')} heading>
      {loadError ? (
        <div className="mt-8 text-center text-destructive">{loadError}</div>
      ) : !file || !buildings ? (
        <CatalogPageLoading />
      ) : (
        <CatalogDataProvider buildings={buildings}>
          <p className="mb-4 text-sm text-muted-foreground">{t('basecamp.caption')}</p>

          {mobilePaging.isMobile ? (
            <>
              <div className="space-y-2" data-testid="mobile-basecamp-list">
                {mobilePaging.visibleItems.map((level) => (
                  <article
                    key={level.level}
                    className="overflow-hidden rounded-lg border border-primary/25 bg-card shadow-sm"
                    data-testid="basecamp-row"
                  >
                    <div className="grid grid-cols-[auto_1fr_1fr] items-stretch border-b border-primary/15 bg-primary/5">
                      <div className="flex min-w-16 flex-col items-center justify-center border-r border-primary/15 px-3 py-2">
                        <span className="text-xs text-muted-foreground">{t('basecamp.level')}</span>
                        <strong className="text-xl tabular-nums text-primary">{level.level}</strong>
                      </div>
                      <div className="flex flex-col items-center justify-center px-2 py-2">
                        <span className="text-xs text-muted-foreground">{t('basecamp.workers')}</span>
                        <strong className="text-base tabular-nums">{level.workers}</strong>
                      </div>
                      <div className="flex flex-col items-center justify-center border-l border-primary/15 px-2 py-2">
                        <span className="text-xs text-muted-foreground">{t('basecamp.bases')}</span>
                        <strong className="text-base tabular-nums">{level.bases}</strong>
                      </div>
                    </div>
                    <div className="p-3">
                      <div className="mb-2 text-xs font-semibold text-muted-foreground">
                        {t('basecamp.tasks')}
                      </div>
                      <TaskList tasks={level.tasks} buildings={buildings} mobile />
                    </div>
                  </article>
                ))}
              </div>
              <MobilePagination
                page={mobilePaging.page}
                pageCount={mobilePaging.pageCount}
                onPageChange={mobilePaging.goToPage}
              />
            </>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="w-px whitespace-nowrap px-3 py-2 font-medium">
                      {t('basecamp.level')}
                    </th>
                    <th className="w-px whitespace-nowrap px-3 py-2 text-right font-medium">
                      {t('basecamp.workers')}
                    </th>
                    <th className="w-px whitespace-nowrap px-3 py-2 text-right font-medium">
                      {t('basecamp.bases')}
                    </th>
                    <th className="w-full px-3 py-2 font-medium">{t('basecamp.tasks')}</th>
                  </tr>
                </thead>
                <tbody>
                  {file.levels.map((level) => (
                    <tr
                      key={level.level}
                      className="border-t border-border/60"
                      data-testid="basecamp-row"
                    >
                      <td className="px-3 py-2 text-center font-medium tabular-nums">
                        {level.level}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{level.workers}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{level.bases}</td>
                      <td className="px-3 py-2">
                        <TaskList tasks={level.tasks} buildings={buildings} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CatalogDataProvider>
      )}
    </ContentPage>
  )
}

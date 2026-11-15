import { useState, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { BookOpen, Box, LoaderCircle } from 'lucide-react'
import { ArkiveEncyclopediaWorkspace } from '@gamemap/map-shell'
import { Button, CatalogSearchInput, Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger, FilterChip, FilterRow, Input, NotFoundMessage, PageSkeleton, SiteFooter } from '@gamemap/ui'
import copy from './locales/zh-CN.json'
import '../index.css'

document.title = copy.title
document.documentElement.lang = 'zh-CN'

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section data-review={id} aria-labelledby={`${id}-heading`} className="min-w-0 space-y-4 border-b border-border pb-6">
    <h2 id={`${id}-heading`} className="text-lg font-semibold">{title}</h2>{children}
  </section>
}

function Review() {
  const [dark, setDark] = useState(document.documentElement.classList.contains('dark'))
  const [query, setQuery] = useState(copy.query)
  const [selected, setSelected] = useState(true)
  const [retryReady, setRetryReady] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [category, setCategory] = useState('items')
  const [dialog, setDialog] = useState<'action' | 'footer' | null>(null)
  const setTheme = (next: boolean) => {
    document.documentElement.classList.toggle('dark', next)
    setDark(next)
  }
  return <Dialog open={dialog !== null} onOpenChange={open => setDialog(open ? 'action' : null)}><div data-review-ready className="flex min-h-dvh flex-col bg-background text-foreground">
    <header className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-6 md:px-8">
      <div><h1 className="text-2xl font-bold">{copy.title}</h1><p className="mt-2 text-sm text-muted-foreground">{copy.intro}</p></div>
      <div className="flex gap-2" aria-label="Theme">
        <Button data-testid="review-light" variant={dark ? 'outline' : 'default'} onClick={() => setTheme(false)}>{copy.light}</Button>
        <Button data-testid="review-dark" variant={dark ? 'default' : 'outline'} onClick={() => setTheme(true)}>{copy.dark}</Button>
      </div>
    </header>
    <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 px-4 pb-8 md:px-8">
      <Section id="actions" title={copy.actions}>
        <div className="flex flex-wrap gap-3">
          <Button data-testid="review-action" onClick={() => setDialog('action')}>{copy.normal}</Button>
          <Button variant="outline">{copy.secondary}</Button>
          <Button disabled>{copy.disabled}</Button>
          <Button disabled aria-busy="true"><LoaderCircle aria-hidden className="animate-spin" />{copy.pending}</Button>
        </div>
        <FilterRow label={copy.filter}>
          <FilterChip testId="review-filter" active={selected} onClick={() => setSelected(!selected)}>{copy.selected}</FilterChip>
          <FilterChip active={false} onClick={() => {}}>{copy.unselected}</FilterChip>
          <FilterChip active={false} disabled onClick={() => {}}>{copy.disabled}</FilterChip>
        </FilterRow>
      </Section>
      <Section id="searches" title={copy.searches}>
        <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
          <CatalogSearchInput aria-label={copy.defaultSearch} placeholder={copy.search} submitLabel={copy.search} />
          <CatalogSearchInput data-testid="review-filled-search" aria-label={copy.filledSearch} value={query} onChange={event => setQuery(event.target.value)} onClear={() => setQuery('')} clearLabel={copy.clear} submitLabel={copy.search} />
          <CatalogSearchInput aria-label={copy.disabledSearch} placeholder={copy.search} disabled submitLabel={copy.search} />
        </div>
      </Section>
      <Section id="forms" title={copy.forms}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <label className="space-y-2 text-sm"><span>{copy.name}</span><Input aria-label={copy.name} placeholder={copy.name} /></label>
          <div className="space-y-2 text-sm"><label htmlFor="review-invalid">{copy.invalidName}</label><Input id="review-invalid" aria-invalid="true" aria-describedby="review-error" defaultValue={copy.invalidValue} /><p id="review-error" className="text-destructive">{copy.validationError}</p></div>
        </div>
      </Section>
      <Section id="states" title={copy.states}>
        <div className="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-3">
          <PageSkeleton label={copy.loading} />
          <NotFoundMessage message={copy.empty} />
          <div className="space-y-3"><p role="status" className="text-sm">{retryReady ? copy.ready : copy.failed}</p><Button variant="outline" onClick={() => setRetryReady(true)}>{copy.retry}</Button></div>
        </div>
      </Section>
      <Section id="directory" title={copy.directory}>
        <ArkiveEncyclopediaWorkspace label={copy.encyclopedia} active={category} collapsed={collapsed} onCollapsedChange={setCollapsed} collapseLabel={copy.collapse} expandLabel={copy.expand}
          groups={[{ key: 'wiki', label: copy.encyclopedia, entries: [{ key: 'items', label: copy.items, icon: <BookOpen className="size-5" /> }, { key: 'buildings', label: copy.buildings, icon: <Box className="size-5" /> }] }]}
          renderLink={(entry, className, children) => <button type="button" className={`${className} w-full text-left`} aria-current={category === entry.key ? 'page' : undefined} onClick={() => setCategory(entry.key)}>{children}</button>}>
          <div className="space-y-4"><CatalogSearchInput placeholder={copy.search} submitLabel={copy.search} /><p className="text-sm">{copy.record}</p></div>
        </ArkiveEncyclopediaWorkspace>
      </Section>
      <Section id="dialogs" title={copy.dialogs}><DialogTrigger asChild><Button data-testid="review-dialog-trigger">{copy.openDialog}</Button></DialogTrigger></Section>
    </main>
    <SiteFooter data-testid="review-footer" homeUrl="#" githubUrl={null} navigation={<>{[copy.about, copy.contact, copy.updates, copy.settings].map(label => <button type="button" key={label} onClick={() => setDialog('footer')}>{label}</button>)}</>} />
      <DialogContent><DialogTitle>{dialog === 'footer' ? copy.footerDialog : copy.dialogTitle}</DialogTitle><DialogDescription>{dialog === 'footer' ? copy.footerDescription : copy.dialogDescription}</DialogDescription><Button className="arkive-dialog-primary" onClick={() => setDialog(null)}>{copy.continue}</Button></DialogContent>
  </div></Dialog>
}

createRoot(document.getElementById('root')!).render(<Review />)

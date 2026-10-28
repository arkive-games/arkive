import { useState, type ReactNode } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { IconArrowDown, IconArrowUp, IconCopy, IconDeviceFloppy, IconLink, IconLock, IconSettings } from '@tabler/icons-react'
import { AccountDialog, authStringsFor, useOptionalAuth } from '@gamemap/auth'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { GzSelect, type GzOption, type GzOptionGroup } from '@/components/GzSelect'
import { isLimitReached, MAX_CHARACTERS, type CharacterSummary, type SavedCharacter } from '@/features/characters/api'
import { useCharacter, type SyncStatus } from '@/features/characters/CharacterProvider'
import { serverName, useServers, type GameServer } from '@/features/characters/servers'
import { TYPE } from '@/lib/typography'

const LOCAL = ''

/** The link a character is shared by: the page's own address for it. */
export function characterUrl(id: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, '')
  return `${window.location.origin}${base}/score/c/${id}`
}

const STATUS_KEY: Record<SyncStatus, string> = {
  local: 'characters.statusLocal',
  loading: 'characters.statusLoading',
  saved: 'characters.statusSaved',
  pending: 'characters.statusPending',
  saving: 'characters.statusSaving',
  offline: 'characters.statusOffline',
  conflict: 'characters.statusConflict',
  'signed-out': 'characters.statusSignedOut',
  readonly: 'characters.statusReadonly',
  newer: 'characters.statusNewer',
  missing: 'characters.missingTitle',
  error: 'characters.statusError',
}

/** The status dot's colour: saved, unsaved, in flight, someone else's, or a problem. */
const STATUS_TONE: Partial<Record<SyncStatus, string>> = {
  saved: 'ok',
  pending: 'dirty',
  saving: 'busy',
  loading: 'busy',
  readonly: 'view',
  offline: 'warn',
  conflict: 'warn',
  'signed-out': 'warn',
  newer: 'warn',
  missing: 'bad',
  error: 'bad',
}

/**
 * The strip above the score page's inputs: which character is open, whether
 * its edits have reached the server, and what can be done with it. Shown even
 * where no character API is configured, so the local draft and the way to sign
 * in are always visible.
 */
export function CharacterBar() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const ctx = useCharacter()
  const auth = useOptionalAuth()
  const { id, status, character, characters, signedIn } = ctx
  const servers = useServers()
  const label = (name: string, serverId?: number) => withServer(name, serverName(servers, serverId, t('characters.unknownServer')))
  const [dialog, setDialog] = useState<'save' | 'manage' | 'login' | null>(null)
  const [copied, setCopied] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const authStrings = authStringsFor(i18n.language)

  const owned = Boolean(character?.editable)
  const open = (target: string | null) => {
    if (target === null) void navigate({ to: '/score', search: { draft: true } })
    else void navigate({ to: '/score/c/$id', params: { id: target } })
  }
  const full = (characters?.length ?? 0) >= MAX_CHARACTERS

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setFailure(null)
    try {
      await action()
    } catch (error) {
      console.error(error)
      setFailure(isLimitReached(error) ? t('characters.limitReached', { max: MAX_CHARACTERS }) : t('characters.failed'))
    } finally {
      setBusy(false)
    }
  }

  const copyLink = async () => {
    if (!id) return
    try {
      await navigator.clipboard.writeText(characterUrl(id))
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      window.prompt(t('characters.copyLink'), characterUrl(id))
    }
  }

  // The switcher lists the open character even when it is someone else's.
  const foreign = id && character && !owned ? character : null

  return (
    <section className="gz-cbar" data-testid="character-bar" aria-label={t('characters.switcher')}>
      {/* Top to bottom: where the edits stand, the character itself (the
          switcher, reading "name · server"), its UID, then the actions. The
          plain local draft needs no status line. */}
      {status === 'local' ? null : (
        <div className="gz-cstat">
          <span className={`gz-status ${STATUS_TONE[status] ?? ''}`} data-testid="character-status" role="status">
            <i aria-hidden />
            {t(STATUS_KEY[status])}
          </span>
          {/* Uploads happen on their own once edits settle; this sends them now,
              and is the way to retry at once after a failed upload. */}
          {owned && (status === 'pending' || status === 'saving' || status === 'offline') ? (
            <button type="button" className="gz-btn gz-savenow" disabled={status === 'saving'} data-testid="character-save-now"
              onClick={() => void run(() => ctx.saveNow())}>
              <IconDeviceFloppy className="size-4" stroke={1.8} aria-hidden />
              {t('characters.save')}
            </button>
          ) : null}
        </div>
      )}

      <GzSelect value={id ?? LOCAL} onChange={(next) => open(next === LOCAL ? null : next)}
        label={t('characters.switcher')} testId="character-switcher" className="gz-cname"
        options={switcherOptions(t('characters.localDraft'), characters, foreign, label, t('characters.mine', { count: characters?.length ?? 0, max: MAX_CHARACTERS }))} />

      {id && character ? <Identity character={character} /> : null}

      <div className="acts">
        {!signedIn ? (
          <button type="button" className="gz-btn pri" disabled={!auth} onClick={() => setDialog('login')} data-testid="character-sign-in">
            {authStrings.signIn}
          </button>
        ) : null}
        {!id && signedIn ? (
          <button type="button" className="gz-btn pri" disabled={full}
            onClick={() => setDialog('save')} data-testid="character-save-draft">
            {t('characters.saveAsNew')}
          </button>
        ) : null}

        {id && owned && character ? (
          <>
            {character.visibility === 'private' ? (
              <span className="gz-btn" aria-disabled><IconLock className="size-4" stroke={1.8} aria-hidden />{t('characters.privateBadge')}</span>
            ) : (
              <button type="button" className="gz-btn pri" onClick={() => void copyLink()} data-testid="character-copy-link">
                <IconLink className="size-4" stroke={1.8} aria-hidden />
                {copied ? t('characters.linkCopied') : t('characters.copyLink')}
              </button>
            )}
            <button type="button" className="gz-btn" onClick={() => setDialog('manage')} data-testid="character-manage">
              <IconSettings className="size-4" stroke={1.8} aria-hidden />
              {t('characters.manage')}
            </button>
            <button type="button" className="gz-btn" disabled={busy || full} data-testid="character-save-copy"
              onClick={() => void run(async () => open(await ctx.copy(character.id, t('characters.copyName', { name: character.name }).slice(0, 32))))}>
              <IconCopy className="size-4" stroke={1.8} aria-hidden />
              {t('characters.saveCopy')}
            </button>
          </>
        ) : null}

        {foreign && signedIn ? (
          <button type="button" className="gz-btn pri" disabled={busy || full} data-testid="character-copy-foreign"
            onClick={() => void run(async () => open(await ctx.copy(foreign.id)))}>
            <IconCopy className="size-4" stroke={1.8} aria-hidden />
            {t('characters.copyToMine')}
          </button>
        ) : null}
        {foreign ? (
          <button type="button" className="gz-btn" onClick={() => open(null)} data-testid="character-back-to-draft">
            {t('characters.backShort')}
          </button>
        ) : null}
      </div>

      {foreign && !signedIn ? <p className="gz-cbar-hint">{t('characters.signInToCopy')}</p> : null}
      {/* Why the save and copy buttons are off, said where it can be read
          rather than in a hover title a phone never shows. */}
      {full && signedIn && (!id || owned || foreign) ? (
        <p className="gz-cbar-hint" data-testid="character-limit">{t('characters.limitReached', { max: MAX_CHARACTERS })}</p>
      ) : null}
      {failure && !dialog ? <p className="gz-cbar-hint bad" role="alert">{failure}</p> : null}

      {auth ? <AccountDialog open={dialog === 'login'} onOpenChange={(next) => setDialog(next ? 'login' : null)} strings={authStrings} /> : null}
      <ConflictDialog />
      <SaveDraftDialog open={dialog === 'save'} onClose={() => setDialog(null)} onSaved={(created) => open(created)} />
      {character && owned ? (
        <ManageDialog open={dialog === 'manage'} character={character} servers={servers} label={label} onClose={() => setDialog(null)} onOpen={open} />
      ) : null}
    </section>
  )
}

function withServer(name: string, server?: string): string {
  return server ? `${name} · ${server}` : name
}

/**
 * The switcher's entries: the local draft, then the player's own characters
 * under their count, then the open character when it is someone else's.
 */
function switcherOptions(
  draft: string,
  characters: CharacterSummary[] | null,
  foreign: SavedCharacter | null,
  label: (name: string, serverId?: number) => string,
  mine: string,
): (GzOption | GzOptionGroup)[] {
  const options: (GzOption | GzOptionGroup)[] = [{ value: LOCAL, label: draft }]
  if (characters && characters.length > 0) {
    options.push({ label: mine, options: characters.map((entry) => ({ value: entry.id, label: label(entry.name, entry.serverId) })) })
  }
  if (foreign) options.push({ value: foreign.id, label: label(foreign.name, foreign.serverId) })
  return options
}

/** The game UID on its own small line; the switcher above already reads "name · server". */
function Identity({ character }: { character: SavedCharacter }) {
  const { t } = useTranslation()
  if (!character.uid) return null
  return (
    <small className="gz-who num" data-testid="character-identity">{`${t('characters.uid')} ${character.uid}`}</small>
  )
}

function Field({ label: text, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={`block ${TYPE.label}`}>{text}</span>
      <span className="mt-0.5 block">{children}</span>
      {hint ? <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  )
}

function Check({ checked, onChange, children, hint, testId }: {
  checked: boolean; onChange: (next: boolean) => void; children: ReactNode; hint?: string; testId: string
}) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-0.5 size-4" checked={checked} onChange={(event) => onChange(event.target.checked)} data-testid={testId} />
      <span>
        <span className="block text-sm text-foreground">{children}</span>
        {hint ? <span className="block text-xs text-muted-foreground">{hint}</span> : null}
      </span>
    </label>
  )
}

function SaveDraftDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (id: string) => void }) {
  const { t } = useTranslation()
  const { saveDraftAs } = useCharacter()
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const submit = async () => {
    setBusy(true)
    setFailure(null)
    try {
      const created = await saveDraftAs(name.trim() || t('characters.defaultName'))
      onClose()
      setName('')
      onSaved(created)
    } catch (error) {
      console.error(error)
      setFailure(isLimitReached(error) ? t('characters.limitReached', { max: MAX_CHARACTERS }) : t('characters.failed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm" data-testid="character-save-dialog">
        <DialogHeader>
          <DialogTitle className="arkive-dialog-title">{t('characters.saveAsNewTitle')}</DialogTitle>
          <DialogDescription>{t('characters.saveAsNewBody')}</DialogDescription>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit() }}>
          <Field label={t('characters.name')}>
            <Input value={name} maxLength={32} placeholder={t('characters.defaultName')} onChange={(event) => setName(event.target.value)}
              data-testid="character-save-name" autoFocus />
          </Field>
          {failure ? <p className="text-xs text-red-700 dark:text-red-300" role="alert">{failure}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full px-5" onClick={onClose}>{t('characters.cancel')}</Button>
            <Button type="submit" className="arkive-dialog-primary px-5" disabled={busy} data-testid="character-save-submit">{t('characters.save')}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ManageDialog({ open, character, servers, label, onClose, onOpen }: {
  open: boolean; character: SavedCharacter; servers: GameServer[]
  label: (name: string, serverId?: number) => string
  onClose: () => void; onOpen: (id: string | null) => void
}) {
  const { t } = useTranslation()
  const ctx = useCharacter()
  const [name, setName] = useState(character.name)
  const [serverId, setServerId] = useState(character.serverId ?? 0)
  const [uid, setUid] = useState(character.uid ?? '')
  const [showUid, setShowUid] = useState(character.showUid)
  const [shared, setShared] = useState(character.visibility === 'link')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  // Re-seeded on every open, so a cancelled edit does not linger.
  const reset = () => {
    setName(character.name)
    setServerId(character.serverId ?? 0)
    setUid(character.uid ?? '')
    setShowUid(character.showUid)
    setShared(character.visibility === 'link')
    setConfirmDelete(false)
    setFailure(null)
  }

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setFailure(null)
    try {
      await action()
    } catch (error) {
      console.error(error)
      setFailure(isLimitReached(error) ? t('characters.limitReached', { max: MAX_CHARACTERS }) : t('characters.failed'))
    } finally {
      setBusy(false)
    }
  }

  const save = () => run(async () => {
    await ctx.updateMeta({
      name: name.trim() || character.name,
      serverId,
      uid: uid.trim(),
      showUid,
      visibility: shared ? 'link' : 'private',
    })
    onClose()
  })

  const list = ctx.characters ?? []
  const move = (index: number, by: -1 | 1) => {
    const ids = list.map((entry) => entry.id)
    const target = index + by
    if (target < 0 || target >= ids.length) return
    ;[ids[index], ids[target]] = [ids[target], ids[index]]
    void run(() => ctx.reorder(ids))
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (next) reset(); else onClose() }}>
      <DialogContent data-testid="character-manage-dialog">
        <DialogHeader>
          <DialogTitle className="arkive-dialog-title">{t('characters.manageTitle')}</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void save() }}>
          <Field label={t('characters.name')}>
            <Input value={name} maxLength={32} placeholder={t('characters.namePlaceholder')} onChange={(event) => setName(event.target.value)} data-testid="character-name" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={t('characters.server')}>
              {/* Only the game's own player servers: the list comes from the client's
                  ServerData, and the character keeps the id, never the name. A stored
                  id the list no longer has stays selectable as itself until changed. */}
              <GzSelect value={String(serverId)} onChange={(next) => setServerId(Number(next))}
                label={t('characters.server')} testId="character-server" className="gz-sel-form"
                options={[
                  { value: '0', label: t('characters.serverNone') },
                  ...servers.map((server) => ({ value: String(server.id), label: server.name })),
                  ...(serverId !== 0 && !servers.some((server) => server.id === serverId)
                    ? [{ value: String(serverId), label: t('characters.unknownServer') }]
                    : []),
                ]} />
            </Field>
            <Field label={t('characters.uid')} hint={t('characters.uidHint')}>
              <Input value={uid} maxLength={32} placeholder={t('characters.serverPlaceholder')} onChange={(event) => setUid(event.target.value)} data-testid="character-uid" />
            </Field>
          </div>
          <Check checked={shared} onChange={setShared} hint={t('characters.sharingHint')} testId="character-shared">{t('characters.sharing')}</Check>
          <Check checked={showUid} onChange={setShowUid} testId="character-show-uid">{t('characters.showUid')}</Check>
          {failure ? <p className="text-xs text-red-700 dark:text-red-300" role="alert">{failure}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="rounded-full px-5" onClick={onClose}>{t('characters.cancel')}</Button>
            <Button type="submit" className="arkive-dialog-primary px-5" disabled={busy} data-testid="character-manage-save">{t('characters.save')}</Button>
          </DialogFooter>
        </form>

        {list.length > 1 ? (
          <div className="space-y-1 border-t border-border pt-3">
            <div className={TYPE.label}>{t('characters.order')}</div>
            <ol className="space-y-1" data-testid="character-order">
              {list.map((entry, index) => (
                <li key={entry.id} className="flex items-center gap-2 text-sm">
                  <span className={`min-w-0 flex-1 truncate ${entry.id === character.id ? 'font-semibold text-foreground' : 'text-muted-foreground'}`}>{label(entry.name, entry.serverId)}</span>
                  <Button type="button" size="icon" variant="outline" className="size-8" disabled={busy || index === 0}
                    aria-label={t('characters.moveUp', { name: entry.name })} onClick={() => move(index, -1)}>
                    <IconArrowUp className="size-4" stroke={1.8} aria-hidden />
                  </Button>
                  <Button type="button" size="icon" variant="outline" className="size-8" disabled={busy || index === list.length - 1}
                    aria-label={t('characters.moveDown', { name: entry.name })} onClick={() => move(index, 1)}>
                    <IconArrowDown className="size-4" stroke={1.8} aria-hidden />
                  </Button>
                </li>
              ))}
            </ol>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button type="button" variant="outline" size="sm" disabled={busy || list.length >= MAX_CHARACTERS} data-testid="character-duplicate"
            onClick={() => void run(async () => {
              const created = await ctx.copy(character.id, t('characters.copyName', { name: character.name }).slice(0, 32))
              onClose()
              onOpen(created)
            })}>
            <IconCopy className="size-4" stroke={1.8} aria-hidden />
            {t('characters.duplicate')}
          </Button>
          {list.length >= MAX_CHARACTERS ? (
            <span className="text-xs text-muted-foreground">{t('characters.limitReached', { max: MAX_CHARACTERS })}</span>
          ) : null}
          <span className="ml-auto" />
          {confirmDelete ? (
            <>
              <span className="basis-full text-xs text-muted-foreground sm:basis-auto">{t('characters.deleteHint')}</span>
              <Button type="button" variant="destructive" size="sm" disabled={busy} data-testid="character-delete-confirm"
                onClick={() => void run(async () => {
                  await ctx.remove(character.id)
                  onClose()
                  onOpen(null)
                })}>
                {t('characters.deleteConfirm')}
              </Button>
            </>
          ) : (
            <Button type="button" variant="outline" size="sm" onClick={() => setConfirmDelete(true)} data-testid="character-delete">
              {t('characters.delete')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ConflictDialog() {
  const { t } = useTranslation()
  const { conflict, keepMine, takeServer } = useCharacter()
  return (
    <Dialog open={Boolean(conflict)}>
      <DialogContent size="sm" showCloseButton={false} data-testid="character-conflict"
        onEscapeKeyDown={(event) => event.preventDefault()} onPointerDownOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="arkive-dialog-title">{t('characters.conflictTitle')}</DialogTitle>
          <DialogDescription>{t('characters.conflictBody')}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" className="rounded-full px-5" onClick={takeServer} data-testid="character-conflict-server">{t('characters.takeServer')}</Button>
          <Button className="arkive-dialog-primary px-5" onClick={keepMine} data-testid="character-conflict-mine">{t('characters.keepMine')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * When a saved character's edits go to the server.
 *
 * Uploads after `idleMs` without an edit, and no later than `maxMs` after the
 * first unsent one, so a long stretch of continuous editing still saves
 * regularly. `flush` sends now — on switching character or leaving the page.
 * One upload at a time: an edit made while one is in flight is sent by the next.
 *
 * Nothing is lost by a send that never happens. Every edit is already in the
 * local working copy; this only decides when the server hears about it.
 */
export type Timers = {
  set(callback: () => void, ms: number): unknown
  clear(handle: unknown): void
  now(): number
}

const browserTimers: Timers = {
  set: (callback, ms) => setTimeout(callback, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  now: () => Date.now(),
}

export const IDLE_MS = 10_000
export const MAX_MS = 60_000

export class AutoSaver {
  private idleTimer: unknown = null
  private maxTimer: unknown = null
  private pendingSince: number | null = null
  private running: Promise<void> | null = null
  private disposed = false
  private readonly send: () => Promise<void>
  private readonly options: { idleMs?: number; maxMs?: number; timers?: Timers }

  constructor(send: () => Promise<void>, options: { idleMs?: number; maxMs?: number; timers?: Timers } = {}) {
    this.send = send
    this.options = options
  }

  private get timers(): Timers {
    return this.options.timers ?? browserTimers
  }

  /** Whether an edit is waiting to be sent. */
  get pending(): boolean {
    return this.pendingSince !== null
  }

  /** Records an edit. */
  touch(): void {
    if (this.disposed) return
    if (this.pendingSince === null) this.pendingSince = this.timers.now()
    if (this.running) return // rescheduled when the upload in flight finishes
    this.schedule()
  }

  /** Sends any pending edit now, and resolves once nothing is in flight. */
  async flush(): Promise<void> {
    if (this.running) await this.running
    if (this.pendingSince !== null && !this.disposed) await this.run()
  }

  dispose(): void {
    this.disposed = true
    this.clearTimers()
  }

  private schedule(): void {
    const idleMs = this.options.idleMs ?? IDLE_MS
    const maxMs = this.options.maxMs ?? MAX_MS
    if (this.idleTimer !== null) this.timers.clear(this.idleTimer)
    this.idleTimer = this.timers.set(() => void this.run(), idleMs)
    if (this.maxTimer === null && this.pendingSince !== null) {
      const remaining = Math.max(0, this.pendingSince + maxMs - this.timers.now())
      this.maxTimer = this.timers.set(() => void this.run(), remaining)
    }
  }

  private clearTimers(): void {
    if (this.idleTimer !== null) this.timers.clear(this.idleTimer)
    if (this.maxTimer !== null) this.timers.clear(this.maxTimer)
    this.idleTimer = null
    this.maxTimer = null
  }

  private run(): Promise<void> {
    if (this.running) return this.running
    this.clearTimers()
    if (this.pendingSince === null || this.disposed) return Promise.resolve()
    this.pendingSince = null
    this.running = this.send()
      .catch(() => {
        // The caller reports failures through its own status; the edit stays in
        // the working copy and goes with the next upload.
      })
      .finally(() => {
        this.running = null
        if (this.pendingSince !== null && !this.disposed) this.schedule()
      })
    return this.running
  }
}

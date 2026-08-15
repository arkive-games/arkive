import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react"
import {
  IconAlertCircle,
  IconCheck,
  IconEye,
  IconEyeOff,
  IconKey,
  IconLock,
  IconMail,
  IconShieldCheck,
  IconUser,
  IconX,
} from "@tabler/icons-react"
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  POPUP_CLOSE_CONTROL_CLASS,
} from "@gamemap/ui"
import { ArkiveMark } from "@gamemap/map-shell"

import { AltchaAbortError, solveAltcha } from "./altcha"
import { useAuth } from "./AuthProvider"
import { resolveAuthStrings, type AuthStrings } from "./strings"
import { AuthError } from "./types"

/** Which form the dialog is showing. */
export type AccountDialogMode = "login" | "register" | "forgot" | "reset"

export interface AccountDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  strings?: Partial<AuthStrings>
  /** Opening mode. `reset` is used when arriving from an emailed link. */
  initialMode?: AccountDialogMode
  /** Prefills the reset form when a token comes in via the URL. */
  resetToken?: string
}

export function AccountDialog({
  open,
  onOpenChange,
  strings: overrides,
  initialMode = "login",
  resetToken,
}: AccountDialogProps) {
  const strings = resolveAuthStrings(overrides)
  const { client, login, register, clearError } = useAuth()

  const [mode, setMode] = useState<AccountDialogMode>(initialMode)
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [passwordConfirm, setPasswordConfirm] = useState("")
  const [token, setToken] = useState(resetToken ?? "")
  const [showPassword, setShowPassword] = useState(false)

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)

  // Shown only once the confirmation has something in it, so the error does not
  // greet someone who has typed a password and not yet reached the next field.
  const needsConfirm = mode === "register" || mode === "reset"
  const mismatch = needsConfirm && passwordConfirm.length > 0 && password !== passwordConfirm

  const abort = useRef<AbortController | null>(null)

  // Reopening should not show the previous attempt's error or a half-typed
  // password, so transient state is dropped whenever the dialog opens.
  useEffect(() => {
    if (!open) {
      abort.current?.abort()
      abort.current = null
      return
    }
    setMode(initialMode)
    setToken(resetToken ?? "")
    setPassword("")
    setPasswordConfirm("")
    setShowPassword(false)
    setBusy(false)
    setMessage(null)
    setFailure(null)
    setProgress(null)
    clearError()
  }, [open, initialMode, resetToken, clearError])

  const describe = useCallback(
    (caught: unknown) =>
      caught instanceof AuthError
        ? (strings.errors[caught.code] ?? strings.errors.UnknownError)
        : strings.errors.UnknownError,
    [strings],
  )

  const switchMode = (next: AccountDialogMode) => {
    setMode(next)
    setPasswordConfirm("")
    setShowPassword(false)
    setFailure(null)
    setMessage(null)
    setProgress(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return

    // Checked before anything else, so a mismatch costs neither a challenge nor
    // the proof-of-work that follows it.
    if (needsConfirm && password !== passwordConfirm) {
      setFailure(strings.passwordMismatch)
      return
    }

    setBusy(true)
    setFailure(null)
    setMessage(null)

    try {
      switch (mode) {
        case "login":
          await login(email, password)
          onOpenChange(false)
          break

        case "register": {
          // The challenge is fetched and solved here rather than on mount, so
          // an expired one is never submitted and no work is done for a visitor
          // who only opens the dialog to sign in.
          const controller = new AbortController()
          abort.current = controller

          setProgress(0)
          const challenge = await client.getAltchaChallenge()
          const solution = await solveAltcha(challenge, {
            signal: controller.signal,
            onProgress: setProgress,
          })
          setProgress(null)

          await register({ name, email, password, altcha: solution })
          onOpenChange(false)
          break
        }

        case "forgot": {
          // Same gate as registration, and solved on submit rather than on open
          // so a visitor who only signs in never pays for the work.
          const controller = new AbortController()
          abort.current = controller

          setProgress(0)
          const challenge = await client.getAltchaChallenge()
          const solution = await solveAltcha(challenge, {
            signal: controller.signal,
            onProgress: setProgress,
          })
          setProgress(null)

          await client.forgotPassword(email, solution)
          // Deliberately unconditional: the API does not disclose whether the
          // address exists, and neither does this message.
          setMessage(strings.forgotSent)
          break
        }

        case "reset":
          await client.resetPassword(token, password)
          setMessage(strings.resetDone)
          setMode("login")
          setPassword("")
          setPasswordConfirm("")
          break
      }
    } catch (caught) {
      if (caught instanceof AltchaAbortError) return
      setProgress(null)
      setFailure(describe(caught))
    } finally {
      setBusy(false)
      abort.current = null
    }
  }

  const title =
    mode === "login"
      ? strings.loginTitle
      : mode === "register"
        ? strings.registerTitle
        : mode === "forgot"
          ? strings.forgotTitle
          : strings.resetTitle

  const submitLabel =
    mode === "login"
      ? strings.loginSubmit
      : mode === "register"
        ? strings.registerSubmit
        : mode === "forgot"
          ? strings.forgotSubmit
          : strings.resetSubmit

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        size="sm"
        showCloseButton={false}
        overlayClassName="z-[var(--arkive-layer-sheet-backdrop)]"
        className="z-[var(--arkive-layer-sheet)] max-h-[calc(100dvh-2rem)] gap-0 overflow-y-auto p-0"
        data-testid="account-dialog"
      >
        <div className="relative border-b border-border bg-background px-6 py-5">
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={`absolute right-3 top-3 ${POPUP_CLOSE_CONTROL_CLASS}`}
              aria-label={strings.close}
              title={strings.close}
            >
              <IconX className="size-4" stroke={1.8} />
            </Button>
          </DialogClose>

          <DialogHeader className="items-start pr-10 text-left">
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [--arkive-mark-cutout:var(--background)]">
                <ArkiveMark />
              </span>
              <DialogTitle>{title}</DialogTitle>
            </div>
            {mode === "forgot" && (
              <DialogDescription className="max-w-sm leading-relaxed">
                {strings.forgotDescription}
              </DialogDescription>
            )}
          </DialogHeader>
        </div>

        <form onSubmit={submit} className="space-y-5 px-6 py-6">
          {mode === "register" && (
            <Field
              label={strings.nameLabel}
              htmlFor="arkive-auth-name"
              icon={<IconUser className="size-5" stroke={1.8} />}
            >
              <Input
                id="arkive-auth-name"
                name="name"
                autoComplete="nickname"
                required
                value={name}
                placeholder={strings.namePlaceholder}
                className="h-11 rounded-lg bg-background pl-10"
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          )}

          {mode !== "reset" && (
            <Field
              label={strings.emailLabel}
              htmlFor="arkive-auth-email"
              icon={<IconMail className="size-5" stroke={1.8} />}
            >
              <Input
                id="arkive-auth-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                placeholder={strings.emailPlaceholder}
                className="h-11 rounded-lg bg-background pl-10"
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          )}

          {mode === "reset" && (
            <Field
              label={strings.resetTokenLabel}
              htmlFor="arkive-auth-token"
              icon={<IconKey className="size-5" stroke={1.8} />}
            >
              <Input
                id="arkive-auth-token"
                name="token"
                required
                value={token}
                className="h-11 rounded-lg bg-background pl-10"
                onChange={(event) => setToken(event.target.value)}
              />
            </Field>
          )}

          {mode !== "forgot" && (
            <Field
              label={mode === "reset" ? strings.newPasswordLabel : strings.passwordLabel}
              htmlFor="arkive-auth-password"
              icon={<IconLock className="size-5" stroke={1.8} />}
            >
              <Input
                id="arkive-auth-password"
                name="password"
                type={showPassword ? "text" : "password"}
                // "new-password" tells a password manager to offer a generated
                // one and stops it overwriting the field on the login form.
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "login" ? undefined : 8}
                value={password}
                placeholder={strings.passwordPlaceholder}
                className="h-11 rounded-lg bg-background pl-10 pr-11"
                onChange={(event) => setPassword(event.target.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg text-muted-foreground hover:text-foreground"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? strings.hidePassword : strings.showPassword}
                title={showPassword ? strings.hidePassword : strings.showPassword}
              >
                {showPassword ? (
                  <IconEyeOff className="size-5" stroke={1.8} />
                ) : (
                  <IconEye className="size-5" stroke={1.8} />
                )}
              </Button>
            </Field>
          )}

          {/* Confirming the password on the two forms that set one.
              A password field is masked, so a typo is invisible until the next
              sign-in fails — and on registration that is a locked-out account
              with an address the person cannot prove is theirs. Deliberately not
              on the login form, where a typo costs one retry. */}
          {(mode === "register" || mode === "reset") && (
            <Field
              label={strings.confirmPasswordLabel}
              htmlFor="arkive-auth-password-confirm"
              icon={<IconLock className="size-5" stroke={1.8} />}
            >
              <Input
                id="arkive-auth-password-confirm"
                name="passwordConfirm"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                required
                minLength={8}
                value={passwordConfirm}
                placeholder={strings.confirmPasswordPlaceholder}
                className="h-11 rounded-lg bg-background pl-10 pr-11"
                onChange={(event) => setPasswordConfirm(event.target.value)}
                aria-invalid={mismatch ? true : undefined}
              />
            </Field>
          )}

          {mismatch && (
            <div
              className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              role="alert"
            >
              <IconAlertCircle className="mt-0.5 size-5 shrink-0" stroke={1.8} aria-hidden="true" />
              <span>{strings.passwordMismatch}</span>
            </div>
          )}

          {/* The human check, shown as a row rather than only while it runs.
              The proof-of-work is invisible by design — there is no puzzle to
              solve — but on a fast machine it finished in a few milliseconds, so
              the only sign it existed flashed past and readers reasonably
              concluded there was no check at all. The row is present for the
              whole of both gated forms and reports which state it is in. */}
          {(mode === "register" || mode === "forgot") && (
            <StatusMessage icon={<IconShieldCheck className="size-5" stroke={1.8} />}>
              {progress === null
                ? strings.challengeIdle
                : progress >= 1
                  ? strings.challengeReady
                  : `${strings.challengeSolving} ${Math.round(progress * 100)}%`}
            </StatusMessage>
          )}

          {failure && (
            <div
              className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
              role="alert"
              data-testid="account-dialog-error"
            >
              <IconAlertCircle className="mt-0.5 size-5 shrink-0" stroke={1.8} aria-hidden="true" />
              <span>{failure}</span>
            </div>
          )}

          {message && (
            <div
              className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2.5 text-sm text-foreground"
              role="status"
              data-testid="account-dialog-message"
            >
              <IconCheck className="mt-0.5 size-5 shrink-0 text-primary" stroke={1.8} aria-hidden="true" />
              <span>{message}</span>
            </div>
          )}

          <Button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-lg bg-[color:var(--arkive-nav-active)] font-semibold text-white hover:brightness-95"
          >
            {busy ? strings.working : submitLabel}
          </Button>

          {mode === "login" && (
            <div className="space-y-3 border-t border-border pt-5 text-center">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-lg bg-background font-semibold"
                onClick={() => switchMode("register")}
              >
                {strings.switchToRegister}
              </Button>
              <LinkButton onClick={() => switchMode("forgot")}>{strings.forgotPassword}</LinkButton>
            </div>
          )}
          {mode !== "login" && (
            <div className="border-t border-border pt-5 text-center">
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full rounded-lg bg-background font-semibold"
                onClick={() => switchMode("login")}
              >
                {strings.switchToLogin}
              </Button>
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  icon,
  children,
}: {
  label: string
  htmlFor: string
  icon: ReactNode
  children: ReactNode
}) {
  return (
    <div className="space-y-2">
      {/* packages/ui has no label primitive, so this is a plain element rather
          than a new shared component for one consumer. */}
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-foreground">
        {label}
      </label>
      <div className="relative isolate">
        <span
          className="pointer-events-none absolute left-3 top-1/2 z-[var(--arkive-layer-local-control)] -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        >
          {icon}
        </span>
        {children}
      </div>
    </div>
  )
}

function StatusMessage({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <p className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2.5 text-sm text-muted-foreground" role="status">
      <span className="shrink-0 text-primary" aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </p>
  )
}

function LinkButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md px-2 py-1 text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  )
}

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react"
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
} from "@gamemap/ui"

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
  const [token, setToken] = useState(resetToken ?? "")

  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [progress, setProgress] = useState<number | null>(null)

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
    setFailure(null)
    setMessage(null)
    setProgress(null)
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return

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

        case "forgot":
          await client.forgotPassword(email)
          // Deliberately unconditional: the API does not disclose whether the
          // address exists, and neither does this message.
          setMessage(strings.forgotSent)
          break

        case "reset":
          await client.resetPassword(token, password)
          setMessage(strings.resetDone)
          setMode("login")
          setPassword("")
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
      <DialogContent className="sm:max-w-md" data-testid="account-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {mode === "forgot" && <DialogDescription>{strings.forgotDescription}</DialogDescription>}
        </DialogHeader>

        <form onSubmit={submit} className="flex flex-col gap-4">
          {mode === "register" && (
            <Field label={strings.nameLabel} htmlFor="arkive-auth-name">
              <Input
                id="arkive-auth-name"
                name="name"
                autoComplete="nickname"
                required
                value={name}
                placeholder={strings.namePlaceholder}
                onChange={(event) => setName(event.target.value)}
              />
            </Field>
          )}

          {mode !== "reset" && (
            <Field label={strings.emailLabel} htmlFor="arkive-auth-email">
              <Input
                id="arkive-auth-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                placeholder={strings.emailPlaceholder}
                onChange={(event) => setEmail(event.target.value)}
              />
            </Field>
          )}

          {mode === "reset" && (
            <Field label={strings.resetTokenLabel} htmlFor="arkive-auth-token">
              <Input
                id="arkive-auth-token"
                name="token"
                required
                value={token}
                onChange={(event) => setToken(event.target.value)}
              />
            </Field>
          )}

          {mode !== "forgot" && (
            <Field
              label={mode === "reset" ? strings.newPasswordLabel : strings.passwordLabel}
              htmlFor="arkive-auth-password"
            >
              <Input
                id="arkive-auth-password"
                name="password"
                type="password"
                // "new-password" tells a password manager to offer a generated
                // one and stops it overwriting the field on the login form.
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                required
                minLength={mode === "login" ? undefined : 8}
                value={password}
                placeholder={strings.passwordPlaceholder}
                onChange={(event) => setPassword(event.target.value)}
              />
            </Field>
          )}

          {progress !== null && (
            <p className="text-xs text-muted-foreground" role="status">
              {progress >= 1 ? strings.challengeReady : strings.challengeSolving}
              {progress < 1 && ` ${Math.round(progress * 100)}%`}
            </p>
          )}

          {failure && (
            <p
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              role="alert"
              data-testid="account-dialog-error"
            >
              {failure}
            </p>
          )}

          {message && (
            <p
              className="rounded-md bg-muted px-3 py-2 text-sm text-foreground"
              role="status"
              data-testid="account-dialog-message"
            >
              {message}
            </p>
          )}

          <Button type="submit" disabled={busy} className="w-full">
            {busy ? strings.working : submitLabel}
          </Button>
        </form>

        <div className="flex flex-col gap-1 text-sm">
          {mode === "login" && (
            <>
              <LinkButton onClick={() => switchMode("register")}>
                {strings.switchToRegister}
              </LinkButton>
              <LinkButton onClick={() => switchMode("forgot")}>{strings.forgotPassword}</LinkButton>
            </>
          )}
          {mode !== "login" && (
            <LinkButton onClick={() => switchMode("login")}>{strings.switchToLogin}</LinkButton>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* packages/ui has no label primitive, so this is a plain element rather
          than a new shared component for one consumer. */}
      <label htmlFor={htmlFor} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {children}
    </button>
  )
}

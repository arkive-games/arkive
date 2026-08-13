# `@gamemap/api-core`

The typed client for the backend's `core` module: accounts, authentication, avatars and the
forum. Generated from `backend-go/openapi/core.json`, with a small hand-written layer for the
two things a generator cannot know.

## Regenerating

```sh
pnpm --filter @gamemap/api-core generate   # rewrites src/generated/
pnpm check:api-drift                       # from frontend/, fails if it is stale
```

`src/generated/` is **committed**. That buys two things worth the diff noise: a fresh checkout
typechecks and builds with no backend and no network, and a backend change arrives as a
reviewable diff instead of a runtime surprise. Do not hand-edit those files — change the Go
handler, run `go run ./cmd/arkive openapi` in `backend-go`, then regenerate here. CI runs both
gates, so a stale client fails the build rather than reaching a user.

## Using it

```ts
import { createApiClient, result, getCurrentUser, listForumPosts } from "@gamemap/api-core"

const api = createApiClient({ baseUrl: "https://api.example.com/api/v1/core" })

const user = await result(getCurrentUser({ client: api.client, throwOnError: true }))
user.name // a UserRead, not an envelope
```

Nothing here reads the environment, storage or a locale — an app passes the base URL, the
transport and (for bearer) the token store, in keeping with the workspace rule that shared
packages take their world as an argument.

For accounts specifically, prefer `CoreClient` from `@gamemap/auth`: it wraps these operations
in the shape the screens want and translates failures into the narrow `AuthError` vocabulary
the UI branches on.

## Three rules that are not obvious

**`throwOnError: true` is mandatory.** The generated client defaults it to `false`, and in that
mode it *returns* a rejection instead of raising it — so an error would arrive as a return value
with `data: undefined`, and a caller reading the payload would see `undefined` rather than an
error. `result()` requires the flag for that reason, and demanding it also narrows the generated
signature to a plain response instead of a union with an error branch. `src/client.test.ts` pins
the trap rather than describing it.

**The envelope is unwrapped by an interceptor, and `Payload<T>` mirrors that in the types.**
Every endpoint but one wraps its payload as `{errorCode, errorMessage, showType, data}`, so a
generated call would otherwise hand back the wrapper and every call site would write
`res.data.data`. Removing either half breaks the other: without the interceptor the payload
never surfaces, and without the type every call site is typed as a wrapper it never receives.

**`POST /auth/jwt/login` is not enveloped** — it answers with the bare token, so that ordinary
OAuth2 tooling can find it. `isEnvelope` is therefore a structural test rather than a list of
operations. Unwrapping it unconditionally would return `undefined` for the access token and
break sign-in for the bearer transport alone, which is the Bilibili Toy: the one place a
regression is slowest to be noticed.

## Transports

`cookie` (the default) sends the httpOnly session cookie and is the safer of the two: script
cannot read the cookie, so an XSS cannot exfiltrate the session. `bearer` reads a token from the
supplied `TokenStorage` and is for the Bilibili Toy, where the page is a third-party iframe and
the browser withholds the cookie whatever CORS says.

The choice decides `withCredentials`, and any `Authorization` header is set or removed rather
than merely left — a retried request otherwise carries the token that was just discarded.

Each client owns its axios instance, and tests inject an `adapter` rather than an instance.
That is deliberate: interceptors belong to an instance and are never scoped or ejected, so two
clients sharing one would run each other's. Request interceptors also run in reverse
registration order, which means a shared instance would let whichever client was built *first*
decide `withCredentials` for both — silently stopping the cookie client from sending the session
cookie. Owning the instance makes that unrepresentable instead of merely documented. To add
behaviour to an existing client, use `api.axios` after construction.

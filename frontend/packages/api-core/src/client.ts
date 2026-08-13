import axios, { type AxiosAdapter, type AxiosInstance, type AxiosResponse } from "axios"

import { type Client, createClient } from "./generated/client"
import { ApiError, normaliseCode, unwrap } from "./envelope"

/**
 * How a caller proves who it is.
 *
 * "cookie" is the default and the better one: the session cookie is HttpOnly, so
 * script cannot read it. "bearer" exists for the Bilibili Toy, which runs as a
 * third-party iframe where the browser withholds the cookie whatever CORS says,
 * so a token in storage is the only thing that can work there.
 */
export type Transport = "cookie" | "bearer"

/** Where a bearer token is kept. Supplied by the caller, never assumed. */
export interface TokenStorage {
  read(): string | null
  write(token: string): void
  clear(): void
}

export interface ApiClientOptions {
  baseUrl: string
  transport?: Transport
  storage?: TokenStorage
  /**
   * Answers requests instead of the network. Tests supply one; production does
   * not.
   *
   * An adapter rather than a whole axios instance, deliberately. Interceptors
   * belong to an instance, not to the client that installed them, and they are
   * never scoped or ejected — so two clients sharing one instance would run each
   * other's interceptors. Since request interceptors run in reverse registration
   * order, a cookie client built after a bearer client would find its
   * `withCredentials` overwritten by the bearer client's, and would stop sending
   * the session cookie. Owning the instance makes that unrepresentable rather
   * than merely documented.
   */
  adapter?: AxiosAdapter
}

/**
 * An axios instance plus the generated client bound to it.
 *
 * Both are exposed because they answer different needs: `client` is what the
 * generated operations take, and `axios` is what a test or an interceptor needs
 * to reach.
 */
export interface ApiClient {
  axios: AxiosInstance
  client: Client
}

/**
 * createApiClient builds the transport every generated operation will use.
 *
 * Two interceptors carry the behaviour all 33 operations share, so none of it is
 * repeated per call site: the request side attaches credentials according to the
 * transport, and the response side unwraps the envelope and turns a non-Success
 * code into an ApiError.
 *
 * Deliberately returns a client rather than configuring the generated module's
 * default one. A module-level `setConfig` would make correctness depend on
 * whether any generated function is called before configuration runs — an
 * ordering hazard with no symptom until it fires. Passing the client explicitly
 * cannot be got wrong, and it lets two clients (different base URLs, or a test
 * and the app) coexist.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const transport = options.transport ?? "cookie"
  if (transport === "bearer" && !options.storage) {
    throw new Error("createApiClient: the bearer transport requires a TokenStorage")
  }

  const instance = axios.create({ baseURL: options.baseUrl, adapter: options.adapter })

  instance.interceptors.request.use((config) => {
    // Decided per request rather than at construction, so it cannot be left
    // behind by a config path that skipped it. True for the cookie transport
    // only: asking for credentials on a cross-origin Toy request makes the
    // browser refuse it outright, turning a working bearer call into a CORS
    // failure.
    config.withCredentials = transport === "cookie"

    // Set or removed, never merely left. A retried request carries the config it
    // already had, so a bearer request retried after sign-out would otherwise
    // resend the token that has just been discarded.
    const token = transport === "bearer" ? options.storage?.read() : null
    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`)
    } else {
      config.headers.delete("Authorization")
    }
    return config
  })

  instance.interceptors.response.use(
    (response) => {
      // Replacing response.data with the payload is what lets a caller receive a
      // User rather than a wrapper around one. unwrap also throws for a 200 whose
      // envelope reports a failure.
      //
      // Note the ordering if a `responseValidator` or `responseTransformer` is
      // ever configured on the generated client: axios runs this interceptor
      // first, so those hooks would see the unwrapped payload while the generated
      // schema they were built for describes the envelope. Unwrap inside the hook
      // instead of here if that day comes.
      response.data = unwrap(response.data, response.status, response.statusText)
      return response
    },
    (error: unknown) => {
      // A response body on an error status usually carries the backend's own
      // errorCode, which is more specific than the status: 409 alone cannot
      // distinguish a taken name from a taken email.
      if (axios.isAxiosError(error) && error.response) {
        const body = error.response.data as
          | { errorCode?: string; errorMessage?: string }
          | undefined
        throw new ApiError(
          normaliseCode(body?.errorCode, error.response.status),
          body?.errorMessage || error.message,
          error.response.status,
          // Carried so that a caller who omitted `throwOnError: true` still gets
          // the backend's body: in that mode the generated client returns the
          // rejection after setting `error = e.response?.data ?? {}`, which
          // without this would always be an empty object.
          error.response,
        )
      }
      // No response at all: offline, DNS, TLS, an aborted request, or a refused
      // CORS preflight. There is no code to report, so the original survives.
      throw error
    },
  )

  return {
    axios: instance,
    client: createClient({ axios: instance, baseURL: options.baseUrl }),
  }
}

/**
 * The payload inside an envelope, or the body itself when there is no envelope.
 *
 * This mirrors at the type level what the response interceptor does at runtime.
 * Without it the two disagree: the generated signature for `getCurrentUser`
 * describes an `EnvelopeUserRead`, while what actually arrives is the `UserRead`
 * the interceptor unwrapped — so every call site would be typed as a wrapper it
 * never receives, and `user.name` would not compile while working perfectly.
 *
 * Keyed on `errorCode` as well as `data`, so that a future payload which happens
 * to have its own `data` field is not mistaken for an envelope.
 */
export type Payload<T> = T extends { errorCode: string; data: infer D } ? D : T

/**
 * result takes the payload out of a generated call, and requires that call to
 * have been made with `throwOnError: true`.
 *
 * That flag is not optional, for a reason worth stating: the generated client
 * defaults it to false, and in that mode it *returns* a rejection instead of
 * propagating it — so an ApiError raised by the interceptor above would arrive as
 * a return value with `data: undefined`, and a caller reading `.data` would see
 * undefined rather than an error. Demanding it is also what narrows the generated
 * signature to a plain AxiosResponse instead of a union with an error branch.
 */
export async function result<T>(call: Promise<AxiosResponse<T>>): Promise<Payload<T>> {
  return (await call).data as Payload<T>
}

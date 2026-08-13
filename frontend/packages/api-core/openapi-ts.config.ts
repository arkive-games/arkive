import { defineConfig } from "@hey-api/openapi-ts"

/**
 * Generates the typed client from the backend's committed specification.
 *
 * The input is the file `backend-go` writes with `arkive openapi`, not a running
 * server: the frontend can therefore be generated without a backend, a database
 * or credentials, and a breaking API change shows up as a reviewable diff in this
 * repository rather than as a production 422.
 *
 * Output is committed. That is what makes the diff reviewable, and it is why CI
 * regenerates and fails when the result differs from what is checked in.
 */
export default defineConfig({
  input: "../../../backend-go/openapi/core.json",
  output: {
    path: "src/generated",
    // Generated output is neither formatted nor linted by this project's rules:
    // it is machine-written and excluded from eslint, and reformatting it would
    // make the drift gate fail on cosmetics.
    postProcess: [],
  },
  plugins: [
    { name: "@hey-api/client-axios" },
    { name: "@hey-api/typescript" },
    { name: "@hey-api/sdk" },
  ],
})

import { existsSync, readdirSync, readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const FRONTEND = join(dirname(fileURLToPath(import.meta.url)), "..")
const REPO = join(FRONTEND, "..")
const DOCS = join(REPO, "docs")
const appRequire = createRequire(join(FRONTEND, "apps", "aion2", "package.json"))
const { parse: parseYaml } = appRequire("yaml")

const CANONICAL_YAML = readdirSync(DOCS)
  .filter((name) => /^ARKIVE_.*\.yaml$/.test(name))
  .sort()

const REQUIRED_HEADER_KEYS = [
  "schema_version",
  "spec_id",
  "title",
  "status",
  "last_reviewed",
]

const REQUIRED_SPECS = [
  "ARKIVE_SITE_SPEC.yaml",
  "ARKIVE_UI_FOUNDATIONS_SPEC.yaml",
  "ARKIVE_SITE_COLOR_SYSTEM.yaml",
  "ARKIVE_INTERACTIVE_MAP_UI_SPEC.yaml",
  "ARKIVE_MOBILE_EXPERIENCE_SPEC.yaml",
  "ARKIVE_STATE_MEMORY_SPEC.yaml",
  "ARKIVE_CONTENT_MODERATION_SPEC.yaml",
]

const MARKDOWN_SURFACES = [
  join(DOCS, "ARKIVE_UI_INDEX.md"),
  join(DOCS, "ARKIVE_PRODUCT_IA_DRAFT.md"),
  join(REPO, ".agents", "skills", "arkive-ui", "SKILL.md"),
  join(REPO, ".agents", "skills", "arkive-ui", "references", "implementation-map.md"),
  ...readdirSync(join(DOCS, "ui-system"))
    .filter((name) => name.endsWith(".md"))
    .sort()
    .map((name) => join(DOCS, "ui-system", name)),
]

function collectYamlRepoPaths(node, out = []) {
  if (typeof node === "string") {
    for (const match of node.matchAll(/(?<![\w./-])((?:docs|frontend|\.github|\.agents|\.apm)\/[A-Za-z0-9_./*<>-]+\.[A-Za-z0-9]+|CLAUDE\.md|AGENTS\.md)\b/g)) {
      if (!/[*<>]/.test(match[1])) out.push(match[1])
    }
    return out
  }
  if (Array.isArray(node)) {
    for (const item of node) collectYamlRepoPaths(item, out)
    return out
  }
  if (node && typeof node === "object") {
    for (const value of Object.values(node)) collectYamlRepoPaths(value, out)
  }
  return out
}

function slugifyHeading(heading) {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
}

describe("Arkive canonical UI specifications", () => {
  it("finds hidden-directory references without treating glob and template paths as concrete files", () => {
    expect(collectYamlRepoPaths({
      refs: [".agents/skills/arkive-ui/SKILL.md", ".github/workflows/ci.yml", ".apm/instructions/frontend.instructions.md"],
      templates: "docs/ui-system/*.md and frontend/apps/<app>/src/index.css",
    })).toEqual([".agents/skills/arkive-ui/SKILL.md", ".github/workflows/ci.yml", ".apm/instructions/frontend.instructions.md"])
  })

  it("parses every canonical YAML specification with required metadata and unique ids", () => {
    expect(CANONICAL_YAML).toEqual(expect.arrayContaining(REQUIRED_SPECS))
    const ids = new Set()
    for (const name of CANONICAL_YAML) {
      const parsed = parseYaml(readFileSync(join(DOCS, name), "utf8"))
      for (const key of REQUIRED_HEADER_KEYS) {
        expect(parsed[key], `${name}: missing or invalid ${key}`).toBeTypeOf("string")
        expect(parsed[key].trim(), `${name}: empty ${key}`).not.toBe("")
      }
      expect(parsed.schema_version, name).toMatch(/^\d+\.\d+\.\d+$/)
      expect(parsed.status, name).toBe("canonical")
      expect(parsed.last_reviewed, name).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(ids.has(parsed.spec_id), `duplicate spec_id ${parsed.spec_id}`).toBe(false)
      ids.add(parsed.spec_id)
    }
  })

  it("resolves every concrete repository file referenced inside canonical YAML specifications", () => {
    const checked = new Set()
    for (const name of CANONICAL_YAML) {
      const parsed = parseYaml(readFileSync(join(DOCS, name), "utf8"))
      for (const relPath of collectYamlRepoPaths(parsed)) {
        const key = `${name}:${relPath}`
        if (checked.has(key)) continue
        checked.add(key)
        expect(existsSync(join(REPO, relPath)), `${name}: missing ${relPath}`).toBe(true)
      }
    }
  })

  it("resolves every relative Markdown link and section anchor across UI index, ui-system topics, and arkive-ui skill", () => {
    const checked = new Set()
    const headingCache = new Map()
    for (const file of MARKDOWN_SURFACES) {
      const text = readFileSync(file, "utf8")
      for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
        const raw = match[1].trim()
        if (!raw || /^(?:https?:|mailto:|codex:)/.test(raw)) continue
        const [targetPart, anchorPart] = raw.split("#")
        const resolved = targetPart ? resolve(dirname(file), targetPart) : file
        const checkKey = `${resolved}#${anchorPart ?? ""}`
        if (checked.has(checkKey)) continue
        checked.add(checkKey)
        expect(existsSync(resolved), `${file}: broken link -> ${raw}`).toBe(true)
        if (anchorPart && resolved.endsWith(".md")) {
          if (!headingCache.has(resolved)) {
            const targetText = readFileSync(resolved, "utf8")
            headingCache.set(
              resolved,
              new Set([...targetText.matchAll(/^#{1,6}\s+(.+)$/gm)].map((h) => slugifyHeading(h[1]))),
            )
          }
          expect(headingCache.get(resolved).has(anchorPart.toLowerCase()), `${file}: missing anchor -> ${raw}`).toBe(true)
        }
      }
    }
  })
})

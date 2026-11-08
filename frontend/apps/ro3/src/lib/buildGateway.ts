import type { PlannerBuild } from './plannerModel'

/** Frontend contract only. The backend integration is owned by the API maintainer. */
export type BuildPayload = Omit<PlannerBuild, 'id' | 'original' | 'recovery'>
export type BuildCollection = 'public' | 'mine' | 'favorites'
export interface CloudBuild {
  id: string
  revision: number
  publishedRevision: number | null
  editable: boolean
  favorited: boolean
  data: BuildPayload
}
export interface BuildPage { items: CloudBuild[]; total: number }
export interface BuildQuery { collection: BuildCollection; search: string; root: number; branch: number; page: number; pageSize: number }
export interface BuildGateway {
  readonly available: boolean
  list(query: BuildQuery): Promise<BuildPage>
  getPublic(id: string): Promise<CloudBuild>
  save(input: { id?: string; revision?: number; requestId: string; data: BuildPayload }): Promise<CloudBuild>
  publish(id: string, revision: number): Promise<CloudBuild>
  unpublish(id: string, revision: number): Promise<CloudBuild>
  remove(id: string, revision: number): Promise<void>
  favorite(id: string, enabled: boolean): Promise<void>
}

export type BuildFailureCode = 'unavailable' | 'unauthorized' | 'conflict' | 'notFound' | 'failed'
export class BuildFailure extends Error {
  readonly code: BuildFailureCode
  constructor(code: BuildFailureCode) { super(code); this.code = code }
}

const unavailable = async (): Promise<never> => { throw new BuildFailure('unavailable') }
/** No fake success, browser fallback, or speculative requests to production. */
export const pendingBuildGateway: BuildGateway = {
  available: false,
  list: unavailable, getPublic: unavailable, save: unavailable, publish: unavailable,
  unpublish: unavailable, remove: unavailable, favorite: unavailable,
}

export function buildPayload(build: PlannerBuild): BuildPayload {
  return structuredClone({
    schemaVersion: build.schemaVersion, title: build.title.trim(), summary: build.summary,
    jobId: build.jobId, branchId: build.branchId, rulesVariant: build.rulesVariant,
    attributes: build.attributes, skills: build.skills, equipment: build.equipment,
    cardSlots: build.cardSlots, combat: build.combat, assist: build.assist,
    talents: build.talents, souls: build.souls,
  })
}
export function editableBuild(build: CloudBuild): PlannerBuild {
  return { ...structuredClone(build.data), id: build.id, recovery: [] }
}
export function publicBuildLink(id: string, origin = window.location.origin): string {
  const url = new URL('/builds', origin)
  url.searchParams.set('build', id)
  return url.href
}

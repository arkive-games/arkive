import type { ResearchProject } from './catalog'

/** One node of a research-lab prerequisite tree. `leaves` is the number of
 *  leaf descendants (own column span in the tree layout). */
export interface ResearchTreeNode {
  project: ResearchProject
  children: ResearchTreeNode[]
  leaves: number
}

export interface ResearchCategoryTree {
  category: string
  roots: ResearchTreeNode[]
}

/** Build one prerequisite tree per category from the flat project list
 *  (single-parent `requires` links). Categories keep first-seen order,
 *  siblings keep file order; a project whose prerequisite is missing from
 *  the dataset becomes an extra root of its category. */
export function buildResearchTrees(projects: ResearchProject[]): ResearchCategoryTree[] {
  const nodes = new Map<string, ResearchTreeNode>()
  for (const project of projects) {
    nodes.set(project.id, { project, children: [], leaves: 0 })
  }

  const order: string[] = []
  const rootsByCat = new Map<string, ResearchTreeNode[]>()
  for (const project of projects) {
    if (!rootsByCat.has(project.category)) {
      rootsByCat.set(project.category, [])
      order.push(project.category)
    }
    const node = nodes.get(project.id)!
    const parent = project.requires ? nodes.get(project.requires) : undefined
    if (parent) parent.children.push(node)
    else rootsByCat.get(project.category)!.push(node)
  }

  const countLeaves = (node: ResearchTreeNode): number => {
    node.leaves = node.children.length
      ? node.children.reduce((sum, c) => sum + countLeaves(c), 0)
      : 1
    return node.leaves
  }
  for (const roots of rootsByCat.values()) roots.forEach(countLeaves)

  return order.map((category) => ({ category, roots: rootsByCat.get(category)! }))
}

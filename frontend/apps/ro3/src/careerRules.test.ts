import { expect, it } from 'vitest'
import { CAREER_ROOTS, careerJobs, careerRoot, careerTalentEffects, type BuildRuleSet } from './lib/buildRules'
const rows = [[1100,1000],[1200,1100],[1300,1200],[1400,1300],[1210,1100],[1310,1210],[1410,1310],[3100,1000],[3200,3100],[3300,3200],[3400,3300]]
const rules: BuildRuleSet = { jobs: rows.map(([id,parentId])=>({id,parentId,name:'',rank:2,branchIds:[],subtypes:[],weaponForms:[]})), branches:[], recommendations:[], talentEffects:[{id:1,group:1,level:1,jobIds:[3400],professionIds:[]},{id:2,group:2,level:1,jobIds:[1410],professionIds:[]}] }
it('exposes six careers and maps advanced saved jobs to their roots',()=>{
  expect(CAREER_ROOTS).toHaveLength(6)
  expect(careerRoot(3400)).toBe(3100)
  expect(careerRoot(1410)).toBe(1100)
  expect(careerRoot(0)).toBe(0)
})
it('separates the two swordman routes while retaining the shared base',()=>{
  expect(careerJobs(rules,1100).map(j=>j.id)).toEqual([1100,1200,1300,1400])
  expect(careerJobs(rules,1210).map(j=>j.id)).toEqual([1100,1210,1310,1410])
})
it('makes later-stage talents available from the base career selection',()=>{
  expect(careerTalentEffects(rules,3100).map(e=>e.id)).toEqual([1])
  expect(careerTalentEffects(rules,1100)).toEqual([])
  expect(careerTalentEffects(rules,1210).map(e=>e.id)).toEqual([2])
})

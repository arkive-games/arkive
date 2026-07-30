import { describe, expect, it } from 'vitest'
import { cardTextToPlain, hasUpgrade, resolvePlaceholders } from './cardText'

const vars = {
  Damage: { base: 6, upgraded: 9 },
  Cards: { base: 1 },
  Accelerant: { base: 2 },
}

describe('resolvePlaceholders', () => {
  it('splices the base magnitude into a description template', () => {
    // The pack ships the sentence, the assembly ships the 6. Neither renders alone.
    expect(resolvePlaceholders('Deal {Damage:diff()} damage.', vars)).toBe('Deal 6 damage.')
  })

  it('uses the upgraded magnitude when asked', () => {
    expect(resolvePlaceholders('Deal {Damage:diff()} damage.', vars, true)).toBe('Deal 9 damage.')
  })

  it('picks the plural form from the variable value', () => {
    expect(resolvePlaceholders('Draw {Cards:diff()} {Cards:plural:card|cards}.', vars))
      .toBe('Draw 1 card.')
    expect(resolvePlaceholders('Triggered {Accelerant:diff()} {Accelerant:plural:time|times}.', vars))
      .toBe('Triggered 2 times.')
  })

  it('reveals upgrade-only fragments only on the upgraded rendering', () => {
    const text = '{Damage:show: [gold]Upgraded[/gold]}'
    expect(resolvePlaceholders(text, vars)).toBe('')
    expect(resolvePlaceholders(text, vars, true)).toBe('[gold]Upgraded[/gold]')
  })

  it('leaves an unknown placeholder visible rather than dropping it', () => {
    // A template the game adds later should degrade to something a reader can
    // report, not vanish silently.
    expect(resolvePlaceholders('Gain {Mystery:diff()} things.', vars)).toBe('Gain {Mystery:diff()} things.')
  })
})

describe('cardTextToPlain', () => {
  it('strips markup so the text can be searched', () => {
    expect(cardTextToPlain('Add {Cards:diff()} [gold]Shivs[/gold].\nDraw.', vars))
      .toBe('Add 1 Shivs. Draw.')
  })
})

describe('hasUpgrade', () => {
  it('is true only when some value actually changes', () => {
    expect(hasUpgrade(vars)).toBe(true)
    expect(hasUpgrade({ Cards: { base: 1 } })).toBe(false)
    expect(hasUpgrade(undefined)).toBe(false)
  })
})

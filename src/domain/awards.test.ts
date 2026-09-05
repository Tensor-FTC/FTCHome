import { describe, expect, it } from 'vitest'
import { awardLabel, describeAward, placementLabel, topAwards } from './awards'
import type { TeamAward } from './types'

const award = (type: string, placement: number, eventCode = 'USWABAM1'): TeamAward => ({ type, placement, eventCode })

/**
 * The rule these pin: the app shows what FTCScout said, tidied. It never
 * substitutes a name of its own, because a lookup table of friendly names is a
 * guess that goes wrong the season FIRST renames an award.
 */
describe('awardLabel', () => {
  it('passes a plain name through', () => {
    expect(awardLabel('Inspire')).toBe('Inspire')
  })

  it('reads a screaming-snake name the way a person would say it', () => {
    expect(awardLabel('INSPIRE_AWARD')).toBe('Inspire')
    expect(awardLabel('CONTROL_AWARD')).toBe('Control')
  })

  it('splits a camel-cased name', () => {
    expect(awardLabel('ThinkAward')).toBe('Think')
    expect(awardLabel('MotivateAward')).toBe('Motivate')
  })

  it('keeps a two-word name whole', () => {
    expect(awardLabel('JUDGES_CHOICE')).toBe('Judges Choice')
  })

  it('falls back to whatever it was given rather than showing nothing', () => {
    expect(awardLabel('')).toBe('')
    expect(awardLabel('Award')).toBe('Award')
  })
})

describe('placementLabel', () => {
  it('ordinals the ones people actually win', () => {
    expect(placementLabel(1)).toBe('1st')
    expect(placementLabel(2)).toBe('2nd')
    expect(placementLabel(3)).toBe('3rd')
    expect(placementLabel(4)).toBe('4th')
  })

  it('gets the teens right', () => {
    expect(placementLabel(11)).toBe('11th')
    expect(placementLabel(12)).toBe('12th')
    expect(placementLabel(13)).toBe('13th')
    expect(placementLabel(21)).toBe('21st')
  })

  it('says nothing when upstream did not say', () => {
    expect(placementLabel(0)).toBe('')
  })
})

describe('describeAward', () => {
  it('names the award and where it placed', () => {
    expect(describeAward(award('INSPIRE_AWARD', 2))).toBe('Inspire · 2nd')
  })

  it('leaves the placement off rather than inventing one', () => {
    expect(describeAward(award('Inspire', 0))).toBe('Inspire')
  })
})

describe('topAwards', () => {
  it('leads with the best result, not the first one fetched', () => {
    const list = [award('Connect', 3), award('Inspire', 1), award('Think', 2)]
    expect(topAwards(list).map((a) => a.type)).toEqual(['Inspire', 'Think', 'Connect'])
  })

  it('sinks an award with no placement below one that has it', () => {
    const list = [award('Judges Choice', 0), award('Inspire', 2)]
    expect(topAwards(list)[0].type).toBe('Inspire')
  })

  it('shows only as many as there is room for', () => {
    const list = [award('A', 1), award('B', 2), award('C', 3), award('D', 4)]
    expect(topAwards(list, 2)).toHaveLength(2)
  })
})

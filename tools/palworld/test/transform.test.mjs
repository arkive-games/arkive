import { describe, it, expect } from 'vitest';
import { makeTransform } from '../src/transform.mjs';
import { assignMap } from '../src/bounds.mjs';

const bounds = { min: { X: -1099400, Y: -724400 }, max: { X: 349400, Y: 724400 } };

describe('makeTransform', () => {
  it('maps min corner to 0,0 and max corner to W,H with identity orientation', () => {
    const t = makeTransform(bounds, { pxAxis: 'X', flipX: false, flipY: false }, 8192, 8192);
    expect(t({ X: -1099400, Y: -724400 })).toEqual({ x: 0, y: 0 });
    expect(t({ X: 349400, Y: 724400 })).toEqual({ x: 8192, y: 8192 });
  });
  it('swaps axes when pxAxis is Y', () => {
    const t = makeTransform(bounds, { pxAxis: 'Y', flipX: false, flipY: false }, 8192, 8192);
    // px driven by world Y, py by world X
    expect(t({ X: -1099400, Y: 724400 })).toEqual({ x: 8192, y: 0 });
  });
  it('applies flips', () => {
    const t = makeTransform(bounds, { pxAxis: 'X', flipX: true, flipY: true }, 8192, 8192);
    expect(t({ X: -1099400, Y: -724400 })).toEqual({ x: 8192, y: 8192 });
  });
});

describe('assignMap', () => {
  const maps = [
    { mapId: 'WorldTree', min: { X: 347351.5, Y: -818197 }, max: { X: 689148.5, Y: -476400 } },
    { mapId: 'MainWorld', min: { X: -1099400, Y: -724400 }, max: { X: 349400, Y: 724400 } },
  ];
  it('assigns Tree-region points to WorldTree (Tree tested first despite overlap)', () => {
    expect(assignMap({ X: 500000, Y: -600000 }, maps)).toBe('WorldTree');
  });
  it('assigns main-region points to MainWorld', () => {
    expect(assignMap({ X: 0, Y: 0 }, maps)).toBe('MainWorld');
  });
  it('returns null outside all bounds', () => {
    expect(assignMap({ X: 9e6, Y: 9e6 }, maps)).toBe(null);
  });
});

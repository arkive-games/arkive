import { describe, it, expect } from 'vitest';
import { ORIENTATIONS } from '../src/orientation.mjs';
import { makeTransform } from '../src/transform.mjs';

describe('orientation lock', () => {
  it('per-map orientations are the calibrated ones', () => {
    expect(ORIENTATIONS.MainWorld).toEqual({ pxAxis: 'Y', flipX: false, flipY: true });
    expect(ORIENTATIONS.WorldTree).toEqual({ pxAxis: 'Y', flipX: false, flipY: true });
  });
  it('golden pixels for known statues stay fixed', () => {
    const bounds = { min: { X: -1099400, Y: -724400 }, max: { X: 349400, Y: 724400 } };
    const t = makeTransform(bounds, ORIENTATIONS.MainWorld, 8192, 8192);
    // TowerFastTravelPoint UAID_50EBF656371D32C702: world (-108666.75, 79119.87)
    expect(t({ X: -108666.75, Y: 79119.87 })).toEqual({ x: 4543.370220209828, y: 2590.062683600221 });
    // TowerFastTravelPoint UAID_FC349764B52DFF6801: world (-302825, 241060)
    expect(t({ X: -302825, Y: 241060 })).toEqual({ x: 5459.0339039204855, y: 3687.8983986747653 });
  });
});

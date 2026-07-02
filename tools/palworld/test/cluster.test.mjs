import { describe, it, expect } from 'vitest';
import { clusterPoints } from '../src/cluster.mjs';

describe('clusterPoints', () => {
  it('merges points within radius into one cluster at their centroid', () => {
    const pts = [
      { x: 100, y: 100, z: 0, key: 'a' },
      { x: 150, y: 100, z: 0, key: 'b' },
    ];
    const out = clusterPoints(pts, 200);
    expect(out).toHaveLength(1);
    expect(out[0].x).toBe(125);
    expect(out[0].y).toBe(100);
    expect(out[0].items.map((p) => p.key)).toEqual(['a', 'b']);
  });
  it('keeps far-apart points separate', () => {
    const out = clusterPoints(
      [{ x: 0, y: 0, z: 0 }, { x: 1000, y: 1000, z: 0 }],
      200,
    );
    expect(out).toHaveLength(2);
  });
  it('is deterministic under input shuffling', () => {
    const pts = Array.from({ length: 50 }, (_, i) => ({
      x: (i * 137) % 900, y: (i * 251) % 900, z: 0, key: String(i),
    }));
    const shuffled = [...pts].reverse();
    const a = clusterPoints(pts, 200).map((c) => [c.x, c.y, c.items.length]);
    const b = clusterPoints(shuffled, 200).map((c) => [c.x, c.y, c.items.length]);
    expect(a).toEqual(b);
  });
  it('rounds centroid coords to 2 decimals', () => {
    const out = clusterPoints(
      [{ x: 0.111, y: 0.111, z: 0 }, { x: 0.115, y: 0.115, z: 0 }],
      200,
    );
    expect(out[0].x).toBe(0.11);
  });
});

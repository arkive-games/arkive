import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { runExtract } from '../src/extract.mjs';

const RAW = process.env.PALWORLD_RAW
  ?? 'E:/SteamLibrary/steamapps/common/Palworld/Exports/Pal/Content/Pal';
const hasRaw = fs.existsSync(RAW);

describe.skipIf(!hasRaw)('extract (integration)', () => {
  it('parses the raw export into expected candidate counts', () => {
    const out = runExtract(RAW);
    const bySubtype = (k) => out.pois.filter((p) => p.subtype === k).length;
    expect(bySubtype('fastTravel')).toBe(152);
    expect(bySubtype('eagleStatue')).toBe(22);
    expect(bySubtype('dungeon')).toBe(157);
    expect(bySubtype('treasureMap')).toBe(42);
    expect(bySubtype('note')).toBe(15);
    expect(bySubtype('copper')).toBe(39);
    expect(bySubtype('quartz')).toBe(27);
    expect(bySubtype('coal')).toBe(23);
    expect(bySubtype('sulfur')).toBe(23);
    expect(out.pois.every((p) => Number.isFinite(p.location.X) && Number.isFinite(p.location.Y))).toBe(true);
    // 159 rows: 70 are CharacterID "None"; 89 start BOSS_ + 1 is "Boss_Anubis"
    // (mixed case, a real field boss) → case-insensitive filter yields 90.
    expect(out.bosses.length).toBe(90);
    expect(out.bosses.every((b) => /^BOSS_/i.test(b.characterId))).toBe(true);
    expect(out.palSpawns.length).toBeGreaterThan(5000);
    expect(out.palSpawns.every((s) => s.pals.length >= 1)).toBe(true);
    expect(out.names.Kitsunebi).toBeTruthy();
    expect(out.bounds.MainWorld.min.X).toBe(-1099400);
    expect(out.bounds.WorldTree.max.Y).toBe(-476400);
    // Texture/PalIcon/Normal has 827 files = 413 .png + 414 .json sidecars;
    // only .png stems are collected.
    expect(out.palIcons.size).toBeGreaterThan(400);
  }, 120_000);
});

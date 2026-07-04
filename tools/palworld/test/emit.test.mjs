import { describe, it, expect } from 'vitest';
import { buildDataset } from '../src/emit.mjs';
import { makeTransform } from '../src/transform.mjs';

const languages = ['en-US', 'ja-JP', 'de-DE', 'es-ES', 'es-MX', 'fr-FR', 'id-ID', 'it-IT', 'ko-KR', 'pl-PL', 'pt-BR', 'ru-RU', 'th-TH', 'tr-TR', 'vi-VN', 'zh-CN', 'zh-TW'];
const namesByLang = Object.fromEntries(languages.map((lng) => [lng, {
  Kitsunebi: `${lng} Kitsunebi`,
  SheepBall: `${lng} SheepBall`,
}]));
namesByLang['en-US'] = { Kitsunebi: 'Foxparks', SheepBall: 'Lamball' };
namesByLang['ko-KR'] = { Kitsunebi: '불꽃여우', SheepBall: '도로롱' };

const parsed = {
  bounds: {
    MainWorld: { min: { X: -1099400, Y: -724400 }, max: { X: 349400, Y: 724400 } },
    WorldTree: { min: { X: 347351.5, Y: -818197 }, max: { X: 689148.5, Y: -476400 } },
  },
  pois: [
    { subtype: 'fastTravel', sourceName: 'FT_1', location: { X: 0, Y: 0, Z: 10 } },
    { subtype: 'fastTravel', sourceName: 'FT_2', location: { X: 400000, Y: -600000, Z: 10 } },
    { subtype: 'copper', sourceName: 'CU_1', location: { X: 100, Y: 100, Z: 0 } },
  ],
  bosses: [
    { key: '0', characterId: 'BOSS_Kitsunebi', level: 12, location: { X: 5000, Y: 5000, Z: 0 } },
  ],
  palSpawns: [
    { spawnerName: 'sp1', pals: [{ id: 'SheepBall', lvMin: 1, lvMax: 3 }], location: { X: 0, Y: 0, Z: 0 } },
    { spawnerName: 'sp1', pals: [{ id: 'SheepBall', lvMin: 1, lvMax: 3 }], location: { X: 50, Y: 50, Z: 0 } },
  ],
  namesByLang,
  palMeta: {
    SheepBall: { zukanIndex: 2, zukanIndexSuffix: '' },
    Kitsunebi: { zukanIndex: 5, zukanIndexSuffix: '' },
  },
  palIcons: new Set(['T_Kitsunebi_icon_normal', 'T_SheepBall_icon_normal']),
};

describe('buildDataset', () => {
  const ds = buildDataset(parsed);

  it('emits two maps with 1024x8x8 tiling', () => {
    expect(ds.maps.map((m) => m.id)).toEqual(['MainWorld', 'WorldTree']);
    expect(ds.maps[0]).toMatchObject({ tileWidth: 1024, tileHeight: 1024, tilesCountX: 8, tilesCountY: 8, isVisible: true });
  });

  it('assigns markers to maps by bounds with stable ids and indexInSubtype', () => {
    const main = ds.markers.MainWorld;
    const tree = ds.markers.WorldTree;
    const ft = main.filter((m) => m.subtype === 'fastTravel');
    expect(ft).toHaveLength(1);
    expect(ft[0].id).toBe('MainWorld-fastTravel-1');
    expect(ft[0].indexInSubtype).toBe(1);
    expect(ft[0].images).toEqual([]);
    expect(ft[0].contributors).toEqual([]);
    expect(typeof ft[0].z).toBe('number');
    expect(tree.filter((m) => m.subtype === 'fastTravel')).toHaveLength(1);
  });

  it('gives bosses per-pal icons and localized Lv names in every locale', () => {
    const boss = ds.markers.MainWorld.find((m) => m.subtype === 'alphaPal');
    expect(boss.icon).toBe('T_Kitsunebi_icon_normal');
    expect(ds.locales['en-US'].markers.MainWorld[boss.id].name).toBe('Foxparks Lv.12');
    expect(ds.locales['ko-KR'].markers.MainWorld[boss.id].name).toBe('불꽃여우 Lv.12');
  });

  it('clusters pal spawns into a per-pal subtype with a Lv-range description', () => {
    const spawns = ds.markers.MainWorld.filter((m) => m.subtype === 'SheepBall');
    expect(spawns).toHaveLength(1); // two placements 70px apart → one cluster
    expect(spawns[0].icon).toBe('T_SheepBall_icon_normal');
    expect(spawns[0].count).toBe(2); // both spawn points merged into this cluster
    const en = ds.locales['en-US'].markers.MainWorld[spawns[0].id];
    const ko = ds.locales['ko-KR'].markers.MainWorld[spawns[0].id];
    expect(en.description).toBe('Lv.1–3');
    expect(ko.description).toBe('Lv.1–3');
  });

  it('publishes world→pixel params (bounds + orientation) in maps.json', () => {
    expect(ds.maps[0].worldBounds).toEqual({
      min: { x: -1099400, y: -724400 },
      max: { x: 349400, y: 724400 },
    });
    expect(ds.maps[0].orientation).toEqual({ pxAxis: 'Y', flipX: false, flipY: true });
  });

  it('emits raw world coords that reproduce the tile-pixel position', () => {
    const ft = ds.markers.MainWorld.find((m) => m.id === 'MainWorld-fastTravel-1');
    // poi FT_1 world (0,0) → stored verbatim as world coords
    expect(ft.x).toBe(0);
    expect(ft.y).toBe(0);
    // and world→pixel places it where the old pixel-space data would have
    const t = makeTransform(
      { min: { X: -1099400, Y: -724400 }, max: { X: 349400, Y: 724400 } },
      { pxAxis: 'Y', flipX: false, flipY: true },
      8192,
      8192,
    );
    const px = t({ X: ft.x, Y: ft.y });
    expect(px.x).toBeCloseTo(4096, 3);
    expect(px.y).toBeCloseTo(1975.62, 1);
  });

  it('emits empty regions and complete locale trees for all 16 languages', () => {
    expect(ds.regions.MainWorld).toEqual([]);
    expect(Object.keys(ds.locales)).toEqual(languages);
    for (const lng of languages) {
      expect(ds.locales[lng].maps.MainWorld.name).toBeTruthy();
      expect(ds.locales[lng].types.subtypes.fastTravel.name).toBeTruthy();
      expect(ds.locales[lng].regions.MainWorld).toEqual({});
    }
  });
});

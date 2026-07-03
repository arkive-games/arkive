import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { L10N_LANG_TAGS, runExtract } from '../src/extract.mjs';

const RAW = process.env.PALWORLD_RAW
  ?? 'E:/SteamLibrary/steamapps/common/Palworld/Exports/Pal/Content/Pal';
const hasRaw = fs.existsSync(RAW);

const writeJson = (file, obj) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj));
};

const makeFixtureRaw = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'palworld-raw-'));
  const raw = path.join(root, 'Content', 'Pal');
  writeJson(path.join(raw, 'DataTable/WorldMapUIData/DT_WorldMapUIData.json'), [{
    Rows: {
      MainMap: { landScapeRealPositionMin: { X: 0, Y: 0 }, landScapeRealPositionMax: { X: 100, Y: 100 } },
      Tree: { landScapeRealPositionMin: { X: 200, Y: 200 }, landScapeRealPositionMax: { X: 300, Y: 300 } },
    },
  }]);
  writeJson(path.join(raw, 'Maps/MainWorld_5/PL_MainWorld5.json'), []);
  writeJson(path.join(raw, 'DataTable/UI/DT_BossSpawnerLoactionData.json'), [{ Rows: {} }]);
  writeJson(path.join(raw, 'DataTable/Spawner/DT_PalWildSpawner.json'), [{ Rows: {} }]);
  writeJson(path.join(raw, 'DataTable/Spawner/DT_PalSpawnerPlacement.json'), [{ Rows: {} }]);
  fs.mkdirSync(path.join(raw, 'Texture/PalIcon/Normal'), { recursive: true });

  for (const [folder, tag] of Object.entries(L10N_LANG_TAGS)) {
    writeJson(path.join(root, 'Content', 'L10N', folder, 'Pal/DataTable/Text/DT_PalNameText_Common.json'), [{
      Rows: {
        PAL_NAME_Alpaca: { TextData: { SourceString: tag === 'ko-KR' ? '멜파카' : `${tag} Alpaca` } },
      },
    }]);
  }
  return { root, raw };
};

describe('L10N extraction', () => {
  it('defines the complete Palworld folder to BCP 47 tag map', () => {
    expect(L10N_LANG_TAGS).toEqual({
      de: 'de-DE', en: 'en-US', es: 'es-ES', 'es-MX': 'es-MX', fr: 'fr-FR',
      id: 'id-ID', it: 'it-IT', ko: 'ko-KR', pl: 'pl-PL', 'pt-BR': 'pt-BR',
      ru: 'ru-RU', th: 'th-TH', tr: 'tr-TR', vi: 'vi-VN',
      'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW',
    });
    expect(Object.keys(L10N_LANG_TAGS)).toHaveLength(16);
  });

  it('reads pal names from every L10N table into namesByLang', () => {
    const { root, raw } = makeFixtureRaw();
    try {
      const out = runExtract(raw);
      expect(out.namesByLang['ko-KR'].Alpaca).toBe('멜파카');
      expect(out.namesByLang['en-US'].Alpaca).toBe('en-US Alpaca');
      expect(Object.keys(out.namesByLang)).toHaveLength(16);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

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
    expect(out.namesByLang['en-US'].Kitsunebi).toBeTruthy();
    expect(out.bounds.MainWorld.min.X).toBe(-1099400);
    expect(out.bounds.WorldTree.max.Y).toBe(-476400);
    // Texture/PalIcon/Normal has 827 files = 413 .png + 414 .json sidecars;
    // only .png stems are collected.
    expect(out.palIcons.size).toBeGreaterThan(400);
  }, 120_000);
});

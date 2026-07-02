import fs from 'node:fs';
import path from 'node:path';

const readRows = (raw, rel) =>
  JSON.parse(fs.readFileSync(path.join(raw, rel), 'utf8'))[0].Rows;

const POI_CLASSES = [
  { subtype: 'fastTravel', match: (t) => t === 'BP_LevelObject_TowerFastTravelPoint_C' },
  { subtype: 'eagleStatue', match: (t) => t === 'BP_LevelObject_UnlockMapPoint_C' },
  { subtype: 'dungeon', match: (t) => /^BP_DungeonPortalMarker_.+_C$/.test(t) },
  { subtype: 'treasureMap', match: (t) => t === 'BP_LevelObject_TreasureMapPoint_C' },
  { subtype: 'note', match: (t) => t === 'BP_LevelObject_Note_C' },
  { subtype: 'copper', match: (t) => t === 'BP_PalMapObjectSpawner_RockCopper_C' },
  { subtype: 'quartz', match: (t) => t === 'BP_PalMapObjectSpawner_RockQuartz_C' },
  { subtype: 'coal', match: (t) => t === 'BP_PalMapObjectSpawner_RockCoal_C' },
  { subtype: 'sulfur', match: (t) => t === 'BP_PalMapObjectSpawner_Sulfur_C' },
];

function actorLocation(actor, exportsArr) {
  const objPath = actor.Properties?.RootComponent?.ObjectPath;
  if (!objPath) return null;
  const idx = Number(objPath.split('.').pop());
  const loc = exportsArr[idx]?.Properties?.RelativeLocation;
  return loc ? { X: loc.X, Y: loc.Y, Z: loc.Z ?? 0 } : null;
}

export function runExtract(raw) {
  const uiRows = readRows(raw, 'DataTable/WorldMapUIData/DT_WorldMapUIData.json');
  const bounds = {
    MainWorld: { min: uiRows.MainMap.landScapeRealPositionMin, max: uiRows.MainMap.landScapeRealPositionMax },
    WorldTree: { min: uiRows.Tree.landScapeRealPositionMin, max: uiRows.Tree.landScapeRealPositionMax },
  };

  const level = JSON.parse(fs.readFileSync(
    path.join(raw, 'Maps/MainWorld_5/PL_MainWorld5.json'), 'utf8'));
  const pois = [];
  for (const exp of level) {
    const cls = POI_CLASSES.find((c) => c.match(exp.Type ?? ''));
    if (!cls) continue;
    const location = actorLocation(exp, level);
    if (!location) continue;
    pois.push({ subtype: cls.subtype, sourceName: exp.Name, location });
  }

  const bossRows = readRows(raw, 'DataTable/UI/DT_BossSpawnerLoactionData.json');
  const bosses = Object.entries(bossRows)
    .map(([key, r]) => ({
      key, characterId: r.CharacterID, level: r.Level,
      location: { X: r.Location.X, Y: r.Location.Y, Z: r.Location.Z ?? 0 },
    }))
    .filter((b) => b.characterId && /^BOSS_/i.test(b.characterId)); // /i: "Boss_Anubis" is mixed case

  const wildRows = readRows(raw, 'DataTable/Spawner/DT_PalWildSpawner.json');
  const wildByName = new Map();
  for (const r of Object.values(wildRows)) {
    const pals = [];
    for (const n of [1, 2, 3]) {
      const id = r[`Pal_${n}`];
      if (id && id !== 'None') pals.push({ id, lvMin: r[`LvMin_${n}`], lvMax: r[`LvMax_${n}`] });
    }
    if (pals.length) wildByName.set(r.SpawnerName, pals);
  }
  const placeRows = readRows(raw, 'DataTable/Spawner/DT_PalSpawnerPlacement.json');
  const palSpawns = [];
  for (const r of Object.values(placeRows)) {
    if (r.SpawnerType !== 'EPalSpawnedCharacterType::Common') continue;
    const pals = wildByName.get(r.SpawnerName);
    if (!pals) continue;
    palSpawns.push({
      spawnerName: r.SpawnerName, pals,
      location: { X: r.Location.X, Y: r.Location.Y, Z: r.Location.Z ?? 0 },
    });
  }

  const nameRows = readRows(raw, 'DataTable/Text/DT_PalNameText_Common.json');
  const names = {};
  for (const [key, r] of Object.entries(nameRows)) {
    if (key.startsWith('PAL_NAME_')) names[key.slice('PAL_NAME_'.length)] = r.TextData.SourceString;
  }

  const palIcons = new Set(
    fs.readdirSync(path.join(raw, 'Texture/PalIcon/Normal'))
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.slice(0, -4)),
  );

  return { bounds, pois, bosses, palSpawns, names, palIcons };
}

export function writeParsed(raw, outDir) {
  const out = runExtract(raw);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'parsed.json'), JSON.stringify(
    { ...out, palIcons: [...out.palIcons] }, null, 1));
  return out;
}

export function readParsed(outDir) {
  const p = JSON.parse(fs.readFileSync(path.join(outDir, 'parsed.json'), 'utf8'));
  p.palIcons = new Set(p.palIcons);
  return p;
}

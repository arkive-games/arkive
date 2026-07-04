import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const readRowsFile = (file) =>
  JSON.parse(fs.readFileSync(file, 'utf8'))[0].Rows;

const readRows = (raw, rel) => readRowsFile(path.join(raw, rel));

export const L10N_LANG_TAGS = {
  de: 'de-DE', en: 'en-US', es: 'es-ES', 'es-MX': 'es-MX', fr: 'fr-FR',
  id: 'id-ID', it: 'it-IT', ko: 'ko-KR', pl: 'pl-PL', 'pt-BR': 'pt-BR',
  ru: 'ru-RU', th: 'th-TH', tr: 'tr-TR', vi: 'vi-VN',
  'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW',
};
// The game's BASE tables (SourceString) are authored in Japanese, so ja-JP is
// sourced from the base tables rather than an L10N folder.
export const JA_TAG = 'ja-JP';

// Persistent-level actors (Maps/MainWorld_5/PL_MainWorld5.json).
const POI_CLASSES = [
  { subtype: 'fastTravel', match: (t) => t === 'BP_LevelObject_TowerFastTravelPoint_C' },
  { subtype: 'eagleStatue', match: (t) => t === 'BP_LevelObject_UnlockMapPoint_C' },
  { subtype: 'tower', match: (t) => /^BP_PalBossTower(_.+)?_C$/.test(t) },
  { subtype: 'dungeon', match: (t) => /^BP_DungeonPortalMarker_.+_C$/.test(t) },
  { subtype: 'treasureMap', match: (t) => t === 'BP_LevelObject_TreasureMapPoint_C' },
  { subtype: 'note', match: (t) => t === 'BP_LevelObject_Note_C' },
  { subtype: 'copper', match: (t) => t === 'BP_PalMapObjectSpawner_RockCopper_C' },
  { subtype: 'quartz', match: (t) => t === 'BP_PalMapObjectSpawner_RockQuartz_C' },
  { subtype: 'coal', match: (t) => t === 'BP_PalMapObjectSpawner_RockCoal_C' },
  { subtype: 'sulfur', match: (t) => t === 'BP_PalMapObjectSpawner_Sulfur_C' },
];

// World-Partition cell actors (PL_MainWorld5/_Generated_/MainGrid*.json). These
// appear at inconsistent LODs (effigies only in L15, chests/eggs only in L0),
// so we scan every MainGrid cell that references any target class and dedup by
// rounded world location.
const CELL_CLASSES = [
  { subtype: 'lifmunkEffigy', match: (t) => t === 'BP_LevelObject_Relic_C' },
  { subtype: 'skillFruit', match: (t) => /^BP_PalMapObjectSpawner_SkillFruits_.+_C$/.test(t) },
  { subtype: 'egg', match: (t) => /^bp_palmapobjectspawner_palegg_.+_C$/i.test(t) },
  { subtype: 'chest', match: (t) => /^BP_PalMapObjectSpawner_Treasure_.+_C$/.test(t) },
  { subtype: 'camp', match: (t) => /^BP_NPCCampSpawner_.+_C$/.test(t) },
  // Post-1.0 Oil Rig raid treasure boxes; exact `_C` match excludes the
  // `_Goal_C` variant (raid objective points, not lootable treasure).
  { subtype: 'oilrigTreasure', match: (t) => t === 'BP_OilrigTreasureBoxSpawner_C' },
];
const CELL_GREP = 'BP_LevelObject_Relic_C|BP_PalMapObjectSpawner_SkillFruits_|palmapobjectspawner_palegg_|BP_PalMapObjectSpawner_Treasure_|BP_NPCCampSpawner_|BP_OilrigTreasureBoxSpawner_C';

// Post-1.0 content not covered by the pre-1.0 taxonomy — surfaced for the
// point-11 report. Values are raw class/id patterns; counts computed at extract.
const NEW_TYPE_WATCH = [
  { key: 'oilrigTreasure', desc: 'Oil Rig raid treasure boxes', pattern: 'BP_OilrigTreasureBoxSpawner_C' },
  { key: 'oilrigGoal', desc: 'Oil Rig raid goal points', pattern: 'BP_OilrigTreasureBoxSpawner_Goal_C' },
  { key: 'dlcCamp', desc: 'DLC syndicate camps (fold into camp)', pattern: 'BP_NPCCampSpawner_DLC[0-9]' },
];

function readPalNames(tablePath) {
  const rows = readRowsFile(tablePath);
  const names = {};
  for (const [key, r] of Object.entries(rows)) {
    if (key.startsWith('PAL_NAME_')) names[key.slice('PAL_NAME_'.length)] = r.TextData.SourceString;
  }
  return names;
}

function readL10nPalNames(raw, folder, tag) {
  const tablePath = path.join(raw, '..', 'L10N', folder, 'Pal/DataTable/Text/DT_PalNameText_Common.json');
  if (!fs.existsSync(tablePath)) {
    throw new Error(`Missing Palworld L10N name table for ${folder} (${tag}): ${tablePath}`);
  }
  return readPalNames(tablePath);
}

// Fast-travel / respawn-point display names. Base table holds ja SourceString;
// each L10N folder holds LocalizedString for one language.
function readRespawnNames(tablePath) {
  if (!fs.existsSync(tablePath)) return {};
  const rows = readRowsFile(tablePath);
  const m = {};
  for (const [key, r] of Object.entries(rows)) {
    const s = r?.TextData?.LocalizedString || r?.TextData?.SourceString;
    if (s) m[key] = s;
  }
  return m;
}

function readRespawnNamesByLang(raw) {
  const base = readRespawnNames(path.join(raw, 'DataTable/Text/DT_MapRespawnPointInfoText.json'));
  const byLang = { [JA_TAG]: base };
  for (const [folder, tag] of Object.entries(L10N_LANG_TAGS)) {
    const loc = readRespawnNames(path.join(raw, '..', 'L10N', folder, 'Pal/DataTable/Text/DT_MapRespawnPointInfoText.json'));
    byLang[tag] = { ...base, ...loc }; // fall back to ja for keys missing a translation
  }
  return byLang;
}

// Human NPC names (wanted criminals etc.), keyed NAME_<id>, by language.
function readHumanNamesByLang(raw) {
  const base = readRespawnNames(path.join(raw, 'DataTable/Text/DT_HumanNameText_Common.json'));
  const byLang = { [JA_TAG]: base };
  for (const [folder, tag] of Object.entries(L10N_LANG_TAGS)) {
    const loc = readRespawnNames(path.join(raw, '..', 'L10N', folder, 'Pal/DataTable/Text/DT_HumanNameText_Common.json'));
    byLang[tag] = { ...base, ...loc };
  }
  return byLang;
}

// Resolve the display name for a fast-travel point across all languages.
function fastTravelNameByLng(ftNames, pointId) {
  if (!pointId) return null;
  const byLng = {};
  let any = false;
  for (const [tag, table] of Object.entries(ftNames)) {
    const name = table[pointId] || table[`${pointId}_Title`];
    if (name) { byLng[tag] = name; any = true; }
  }
  return any ? byLng : null;
}

// Tower point names come back as "<Tower name> <Entrance>" (e.g. "Rayne
// Syndicate Tower Entrance", "雷恩盗猎集团的高塔 入口"). Strip the trailing
// localized "Entrance" word per language WITHOUT a hardcoded word list: across
// the tower set the entrance word is the shared trailing space-token, so we
// find the most common one per language and strip only that. Names with no
// such suffix (e.g. "Deserted Islet", "Within the Seal") are left untouched.
function stripEntranceSuffixes(nameMaps) {
  const langs = new Set();
  for (const m of nameMaps) for (const l of Object.keys(m)) langs.add(l);
  for (const lng of langs) {
    const counts = new Map();
    for (const m of nameMaps) {
      const s = m[lng];
      const i = s ? s.lastIndexOf(' ') : -1;
      if (i < 0) continue;
      const tok = s.slice(i + 1);
      counts.set(tok, (counts.get(tok) ?? 0) + 1);
    }
    let suffix = null, best = 0;
    for (const [tok, n] of counts) if (n > best) { best = n; suffix = tok; }
    if (!suffix || best < 3) continue; // needs to recur to count as "Entrance"
    const tail = ` ${suffix}`;
    for (const m of nameMaps) {
      if (m[lng]?.endsWith(tail)) m[lng] = m[lng].slice(0, -tail.length);
    }
  }
}

function actorLocation(actor, exportsArr) {
  const objPath = actor.Properties?.RootComponent?.ObjectPath;
  if (!objPath) return null;
  const idx = Number(objPath.split('.').pop());
  const loc = exportsArr[idx]?.Properties?.RelativeLocation;
  return loc ? { X: loc.X, Y: loc.Y, Z: loc.Z ?? 0 } : null;
}

// Scan every MainGrid cell that references a target class; dedup identical
// actors that recur across LOD levels by rounded (1m grid) world location.
function extractCellPois(raw) {
  const cellsDir = path.join(raw, 'Maps/MainWorld_5/PL_MainWorld5/_Generated_');
  let files = [];
  try {
    const out = execSync(`grep -rlEi --include='MainGrid*.json' --include='oilrig_L0_*.json' --include='CloseRange_L0_*.json' "${CELL_GREP}" .`,
      { cwd: cellsDir, maxBuffer: 1 << 28 }).toString();
    files = out.split('\n').map((f) => f.trim()).filter(Boolean);
  } catch (err) {
    // grep exits non-zero when nothing matches; treat as empty
    if (err.status !== 1) throw err;
  }
  const pois = [];
  const seen = new Set();
  const key = (subtype, loc) =>
    `${subtype}|${Math.round(loc.X / 100)}|${Math.round(loc.Y / 100)}`;
  for (const rel of files) {
    const arr = JSON.parse(fs.readFileSync(path.join(cellsDir, rel), 'utf8'));
    for (const exp of arr) {
      const cls = CELL_CLASSES.find((c) => c.match(exp.Type ?? ''));
      if (!cls) continue;
      const location = actorLocation(exp, arr);
      if (!location) continue;
      const k = key(cls.subtype, location);
      if (seen.has(k)) continue;
      seen.add(k);
      pois.push({ subtype: cls.subtype, sourceName: exp.Name, location });
    }
  }
  return pois;
}

function countNewTypeCandidates(raw) {
  const cellsDir = path.join(raw, 'Maps/MainWorld_5/PL_MainWorld5/_Generated_');
  const levelFile = path.join(raw, 'Maps/MainWorld_5/PL_MainWorld5.json');
  const grepCount = (pattern, target, opts = '') => {
    try {
      const out = execSync(`grep -rhoEi ${opts} "\\"Type\\": \\"${pattern}[A-Za-z0-9_]*\\"" ${target}`,
        { cwd: cellsDir, maxBuffer: 1 << 28 }).toString();
      return out.split('\n').filter(Boolean).length;
    } catch (err) {
      if (err.status === 1) return 0;
      throw err;
    }
  };
  const out = {};
  for (const w of NEW_TYPE_WATCH) {
    const inCells = grepCount(w.pattern, ".", "--include='*.json'");
    const inLevel = grepCount(w.pattern, `'${levelFile}'`);
    out[w.key] = { desc: w.desc, pattern: w.pattern, count: inCells + inLevel };
  }
  return out;
}

export function runExtract(raw) {
  const uiRows = readRows(raw, 'DataTable/WorldMapUIData/DT_WorldMapUIData.json');
  const bounds = {
    MainWorld: { min: uiRows.MainMap.landScapeRealPositionMin, max: uiRows.MainMap.landScapeRealPositionMax },
    WorldTree: { min: uiRows.Tree.landScapeRealPositionMin, max: uiRows.Tree.landScapeRealPositionMax },
  };

  const ftNames = readRespawnNamesByLang(raw);

  const level = JSON.parse(fs.readFileSync(
    path.join(raw, 'Maps/MainWorld_5/PL_MainWorld5.json'), 'utf8'));

  // Tower fast-travel points carry a FastTravelPointID that keys the tower's
  // name in the respawn table. Two blueprint classes exist
  // (BP_LevelObject_ and BP_MapObject_TowerFastTravelPoint_C); match both. Each
  // BP_PalBossTower actor sits at exactly one of these (verified 1:1 mutual
  // nearest), so a nearest-point lookup resolves the tower's name.
  const towerFtPoints = [];
  for (const exp of level) {
    if (!/TowerFastTravelPoint_C$/.test(exp.Type ?? '')) continue;
    const id = exp.Properties?.FastTravelPointID;
    const loc = actorLocation(exp, level);
    if (id && loc) towerFtPoints.push({ id, loc });
  }
  const towerNameByLng = (loc) => {
    let best = null, bd = Infinity;
    for (const f of towerFtPoints) {
      const d = Math.hypot(f.loc.X - loc.X, f.loc.Y - loc.Y);
      if (d < bd) { bd = d; best = f; }
    }
    return best ? fastTravelNameByLng(ftNames, best.id) : null;
  };

  const pois = [];
  for (const exp of level) {
    const cls = POI_CLASSES.find((c) => c.match(exp.Type ?? ''));
    if (!cls) continue;
    const location = actorLocation(exp, level);
    if (!location) continue;
    const poi = { subtype: cls.subtype, sourceName: exp.Name, location };
    if (cls.subtype === 'fastTravel') {
      const nameByLng = fastTravelNameByLng(ftNames, exp.Properties?.FastTravelPointID);
      if (nameByLng) poi.nameByLng = nameByLng;
    } else if (cls.subtype === 'tower') {
      const nameByLng = towerNameByLng(location);
      if (nameByLng) poi.nameByLng = nameByLng;
    }
    pois.push(poi);
  }
  // Drop the localized "Entrance" suffix from tower names (data-driven, no
  // per-language word list).
  stripEntranceSuffixes(pois.filter((p) => p.subtype === 'tower' && p.nameByLng).map((p) => p.nameByLng));
  // World-Partition cell collectibles (effigies, skill fruit, eggs, chests, camps)
  pois.push(...extractCellPois(raw));

  const bossRows = readRows(raw, 'DataTable/UI/DT_BossSpawnerLoactionData.json');
  const bosses = Object.entries(bossRows)
    .map(([key, r]) => ({
      key, characterId: r.CharacterID, level: r.Level,
      location: { X: r.Location.X, Y: r.Location.Y, Z: r.Location.Z ?? 0 },
    }))
    .filter((b) => b.characterId && /^BOSS_/i.test(b.characterId)); // /i: "Boss_Anubis" is mixed case

  // Wanted criminals: human bosses in the same boss-spawner table, identified
  // by CharacterID "None" + a BOSS_* SpawnerID (excludes REGION_Oilrig_* rows).
  // Name comes from DT_HumanNameText (NAME_<SpawnerID>, e.g. "通缉犯 威普"),
  // portrait icon from DT_PalBossNPCIcon. The table has duplicate rows, so
  // dedup by spawner + rounded location.
  const humanNames = readHumanNamesByLang(raw);
  const bossNpcIcon = readRows(raw, 'DataTable/Character/DT_PalBossNPCIcon.json');
  const wantedSeen = new Set();
  const wanted = [];
  for (const r of Object.values(bossRows)) {
    const sid = r.SpawnerID ?? '';
    if (r.CharacterID && r.CharacterID !== 'None') continue; // pal bosses handled above
    if (!/^BOSS_/i.test(sid)) continue;
    const k = `${sid}|${Math.round(r.Location.X)}|${Math.round(r.Location.Y)}`;
    if (wantedSeen.has(k)) continue;
    wantedSeen.add(k);
    const nameByLng = {};
    for (const [tag, table] of Object.entries(humanNames)) {
      const nm = table[`NAME_${sid}`];
      if (nm) nameByLng[tag] = nm;
    }
    const iconStem = (bossNpcIcon[sid]?.Icon?.AssetPathName ?? '').split('.').pop() || null;
    wanted.push({
      spawnerId: sid, level: r.Level,
      location: { X: r.Location.X, Y: r.Location.Y, Z: r.Location.Z ?? 0 },
      ...(iconStem ? { icon: iconStem } : {}),
      ...(Object.keys(nameByLng).length ? { nameByLng } : {}),
    });
  }

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

  // Paldeck order metadata: ZukanIndex (asc), ZukanIndexSuffix as tiebreak.
  const monParam = readRows(raw, 'DataTable/Character/DT_PalMonsterParameter.json');
  const palMeta = {};
  for (const [id, r] of Object.entries(monParam)) {
    palMeta[id] = { zukanIndex: r.ZukanIndex ?? -1, zukanIndexSuffix: r.ZukanIndexSuffix ?? '' };
  }

  const namesByLang = Object.fromEntries(Object.entries(L10N_LANG_TAGS)
    .map(([folder, tag]) => [tag, readL10nPalNames(raw, folder, tag)]));
  namesByLang[JA_TAG] = readPalNames(path.join(raw, 'DataTable/Text/DT_PalNameText_Common.json'));

  const palIcons = new Set(
    fs.readdirSync(path.join(raw, 'Texture/PalIcon/Normal'))
      .filter((f) => f.endsWith('.png'))
      .map((f) => f.slice(0, -4)),
  );

  // Predators ("狂暴化的<Pal>"): NOT a data table — each is a
  // BP_PalSpawner_Sheets_*_PreBOSS_* actor placed in a world-partition cell.
  // Map each spawner class to its predator pal via the sheet blueprint, then
  // read the placed actors' locations from the MainGrid cells. Name = the
  // localized PREDATOR_NAME prefix + the pal's name; icon = the pal's portrait.
  const predatorPrefix = (() => {
    const read = (f) => {
      try {
        const r = JSON.parse(fs.readFileSync(f, 'utf8'))[0].Rows.PREDATOR_NAME;
        return r?.TextData?.LocalizedString || r?.TextData?.SourceString || null;
      } catch { return null; }
    };
    const m = { [JA_TAG]: read(path.join(raw, 'DataTable/Text/DT_NamePrefixText_Common.json')) };
    for (const [folder, tag] of Object.entries(L10N_LANG_TAGS)) {
      m[tag] = read(path.join(raw, '..', 'L10N', folder, 'Pal/DataTable/Text/DT_NamePrefixText_Common.json')) || m[JA_TAG];
    }
    return m;
  })();
  const sheetDir = path.join(raw, 'Blueprint/Spawner/SheetsVariant');
  const predatorSheet = {}; // spawner-class Type -> { pal, level }
  for (const f of fs.readdirSync(sheetDir)) {
    if (!/PreBOSS/.test(f) || !f.endsWith('.json')) continue;
    for (const e of JSON.parse(fs.readFileSync(path.join(sheetDir, f), 'utf8'))) {
      for (const g of e.Properties?.SpawnGroupList ?? []) {
        for (const pl of g.PalList ?? []) {
          if (/^PREDATOR_/.test(pl.PalId?.Key ?? '')) predatorSheet[e.Type] = { pal: pl.PalId.Key, level: pl.Level };
        }
      }
    }
  }
  // ja/zh join the prefix without a space ("狂暴化的精灵龙"); others use a space.
  const cjkTail = (s) => /[぀-ヿ㐀-鿿豈-﫿]/.test(s.slice(-1));
  const predatorName = (base) => {
    const out = {};
    for (const [tag, names] of Object.entries(namesByLang)) {
      const pn = names[base] ?? names[base.replace(/_(Ice|Fire|Dark|Ground|Electric|Grass|Water)$/, '')];
      if (!pn) continue;
      const pre = predatorPrefix[tag];
      out[tag] = pre ? `${pre}${cjkTail(pre) ? '' : ' '}${pn}` : pn;
    }
    return out;
  };
  const predators = [];
  {
    const cellsDir = path.join(raw, 'Maps/MainWorld_5/PL_MainWorld5/_Generated_');
    let files = [];
    try {
      files = execSync("grep -rlI \"PreBOSS\" --include='MainGrid*.json' .", { cwd: cellsDir, maxBuffer: 1 << 28 })
        .toString().split('\n').filter(Boolean);
    } catch (err) { if (err.status !== 1) throw err; }
    const seen = new Set();
    for (const rel of files) {
      const arr = JSON.parse(fs.readFileSync(path.join(cellsDir, rel), 'utf8'));
      for (const e of arr) {
        const info = predatorSheet[e.Type];
        if (!info) continue;
        const location = actorLocation(e, arr);
        if (!location) continue;
        const k = `${info.pal}|${Math.round(location.X / 100)}|${Math.round(location.Y / 100)}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const base = info.pal.replace(/^PREDATOR_/, '');
        const iconStem = `T_${base}_icon_normal`;
        const nameByLng = predatorName(base);
        predators.push({
          pal: info.pal, level: info.level, location,
          ...(palIcons.has(iconStem) ? { icon: iconStem } : {}),
          ...(Object.keys(nameByLng).length ? { nameByLng } : {}),
        });
      }
    }
  }

  const newTypeCandidates = countNewTypeCandidates(raw);

  return { bounds, pois, bosses, wanted, predators, palSpawns, palMeta, namesByLang, palIcons, newTypeCandidates };
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

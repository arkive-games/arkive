import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { makeTransform, makeInverseTransform } from './transform.mjs';
import { assignMap } from './bounds.mjs';
import { clusterPoints } from './cluster.mjs';
import { ORIENTATIONS } from './orientation.mjs';
import { readParsed } from './extract.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const SIZE = 8192;
const round2 = (v) => Math.round(v * 100) / 100;

function loadTypesSrc() {
  return YAML.parse(fs.readFileSync(path.join(here, '..', 'data_src', 'types.yaml'), 'utf8'));
}

const palName = (names, id) => names[id.replace(/^BOSS_/i, '')] ?? names[id] ?? id;
const palIcon = (palIcons, id) => {
  const stem = `T_${id.replace(/^BOSS_/i, '')}_icon_normal`;
  return palIcons.has(stem) ? stem : null;
};

export function buildDataset(parsed) {
  const src = loadTypesSrc();
  const { bounds, namesByLang, palIcons } = parsed;
  const languages = src.languages;
  const missingLanguages = languages.filter((lng) => !namesByLang?.[lng]);
  if (missingLanguages.length) {
    throw new Error(`Parsed pal names are missing languages: ${missingLanguages.join(', ')}`);
  }
  const mapIds = ['MainWorld', 'WorldTree'];
  const assignOrder = [
    { mapId: 'WorldTree', ...bounds.WorldTree },
    { mapId: 'MainWorld', ...bounds.MainWorld },
  ];
  const transforms = Object.fromEntries(mapIds.map((id) =>
    [id, makeTransform(bounds[id], ORIENTATIONS[id], SIZE, SIZE)]));
  const inverses = Object.fromEntries(mapIds.map((id) =>
    [id, makeInverseTransform(bounds[id], ORIENTATIONS[id], SIZE, SIZE)]));

  // maps.json — markers/regions now store RAW WORLD coords; publish the
  // world→pixel params (bounds + orientation) so the frontend derives pixels.
  const maps = src.maps.map((m) => ({
    id: m.id, name: m.id, type: 'world',
    tileWidth: 1024, tileHeight: 1024, tilesCountX: 8, tilesCountY: 8,
    isVisible: true,
    worldBounds: {
      min: { x: bounds[m.id].min.X, y: bounds[m.id].min.Y },
      max: { x: bounds[m.id].max.X, y: bounds[m.id].max.Y },
    },
    orientation: ORIENTATIONS[m.id],
  }));

  // Per-pal subtypes (points 9/10): one subtype per distinct wild-spawn pal,
  // ordered by Paldeck ZukanIndex; spawns cluster within a single pal id only.
  const palSpawnCfg = src.subtypes.find((s) => s.id === 'palSpawn');
  const radius = palSpawnCfg.clusterRadius;
  const baseId = (id) => id.replace(/^BOSS_/i, '');
  // Prefer a catalogued entry (zukanIndex > 0). Bosses ("BOSS_X") have their own
  // palMeta row with zukanIndex -1, so fall through to the base pal ("X") which
  // carries the real Paldeck number.
  const zForId = (id) => {
    const direct = parsed.palMeta?.[id];
    if (direct && direct.zukanIndex > 0) return direct;
    const base = parsed.palMeta?.[baseId(id)];
    if (base && base.zukanIndex > 0) return base;
    return direct ?? base ?? { zukanIndex: -1, zukanIndexSuffix: '' };
  };
  // Only catalogued pals (present in DT_PalMonsterParameter) count as pals;
  // this drops placeholder rows ("RowName") and human NPC spawners ("Male_*").
  const isRealPal = (id) => !!parsed.palMeta?.[id];
  const palIdSet = new Set();
  for (const s of parsed.palSpawns) for (const p of s.pals) if (isRealPal(p.id)) palIdSet.add(p.id);
  const palSubtypes = [...palIdSet].map((id) => {
    const z = zForId(id);
    return {
      id, category: 'pal',
      icon: palIcon(palIcons, id) ?? undefined,
      zukanIndex: typeof z.zukanIndex === 'number' ? z.zukanIndex : -1,
      zukanIndexSuffix: z.zukanIndexSuffix ?? '',
      names: Object.fromEntries(languages.map((lng) => [lng, palName(namesByLang[lng], id)])),
    };
  }).sort((a, b) => {
    const aMissing = a.zukanIndex < 0, bMissing = b.zukanIndex < 0;
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    if (a.zukanIndex !== b.zukanIndex) return a.zukanIndex - b.zukanIndex;
    if (a.zukanIndexSuffix !== b.zukanIndexSuffix) return a.zukanIndexSuffix < b.zukanIndexSuffix ? -1 : 1;
    return a.names['en-US'] < b.names['en-US'] ? -1 : a.names['en-US'] > b.names['en-US'] ? 1 : 0;
  });
  // Emitted subtype set: yaml subtypes minus the palSpawn template, plus per-pal subtypes.
  const subtypeDefs = [...src.subtypes.filter((s) => s.category !== 'pal'), ...palSubtypes];

  // types.json — contract TypesFile: categories nest their subtypes; `name`
  // is the machine key (locales carry display names, keyed by it). We use
  // id === name, matching the aion2 data repo's locale keying.
  const types = {
    categories: src.categories.map((c) => ({
      id: c.id, name: c.id,
      ...(c.pinVariant ? { pinVariant: c.pinVariant } : {}),
      subtypes: subtypeDefs.filter((s) => s.category === c.id).map((s) => ({
        id: s.id, name: s.id,
        ...(s.icon ? { icon: s.icon } : {}),
        ...(typeof s.iconScale === 'number' ? { iconScale: s.iconScale } : {}),
        ...(s.color ? { color: s.color } : {}),
        ...(typeof s.zukanIndex === 'number' && s.zukanIndex > 0
          ? { zukanIndex: s.zukanIndex, ...(s.zukanIndexSuffix ? { zukanIndexSuffix: s.zukanIndexSuffix } : {}) }
          : {}),
      })),
    })),
  };

  // Candidate markers per map, keyed by subtype, before id assignment.
  // Each candidate: { subtype, category, x, y, z, icon?, sortKey, nameByLng?, descByLng? }
  const candidates = Object.fromEntries(mapIds.map((id) => [id, []]));
  const subtypeCat = Object.fromEntries(subtypeDefs.map((s) => [s.id, s.category]));
  const push = (mapId, c) => candidates[mapId].push(c);
  // Pixel position (used for pal-spawn clustering, which runs in pixel space).
  const toPx = (mapId, loc) => {
    const { x, y } = transforms[mapId](loc);
    return { x: round2(x), y: round2(y), z: round2(loc.Z ?? 0) };
  };
  // Emitted position: RAW WORLD coords (x=world X, y=world Y, z=world Z).
  const toWorld = (loc) => ({ x: round2(loc.X), y: round2(loc.Y), z: round2(loc.Z ?? 0) });

  for (const p of parsed.pois) {
    const mapId = assignMap(p.location, assignOrder);
    if (!mapId) continue;
    push(mapId, {
      subtype: p.subtype, ...toWorld(p.location), sortKey: p.sourceName,
      ...(p.nameByLng ? { nameByLng: p.nameByLng } : {}),
    });
  }

  for (const b of parsed.bosses) {
    const mapId = assignMap(b.location, assignOrder);
    if (!mapId) continue;
    const nameByLng = Object.fromEntries(languages.map((lng) =>
      [lng, `${palName(namesByLang[lng], b.characterId)} Lv.${b.level}`]));
    const z = zForId(b.characterId);
    push(mapId, {
      subtype: 'alphaPal', ...toWorld(b.location),
      icon: palIcon(palIcons, b.characterId) ?? 'T_icon_compass_boss',
      sortKey: `${b.characterId}-${b.key}`,
      nameByLng,
      ...(z.zukanIndex > 0
        ? { zukanIndex: z.zukanIndex, ...(z.zukanIndexSuffix ? { zukanIndexSuffix: z.zukanIndexSuffix } : {}) }
        : {}),
    });
  }

  // Wanted criminals (human bosses): name from the raw human-name table with
  // the level appended (same "<name> Lv.X" form as alpha pals), portrait icon.
  for (const w of parsed.wanted ?? []) {
    const mapId = assignMap(w.location, assignOrder);
    if (!mapId) continue;
    const nameByLng = w.nameByLng
      ? Object.fromEntries(Object.entries(w.nameByLng).map(
          ([lng, n]) => [lng, w.level ? `${n} Lv.${w.level}` : n]))
      : null;
    push(mapId, {
      subtype: 'wanted', ...toWorld(w.location),
      ...(w.icon ? { icon: w.icon } : {}),
      sortKey: w.spawnerId,
      ...(nameByLng ? { nameByLng } : {}),
    });
  }

  // Pal spawns: split by pal id first, then cluster within each pal id only
  // (point 10 — never merge different pals into one marker). Each pal is its
  // own subtype (id === pal id); the marker's level range lives in the popup.
  const byMapPal = Object.fromEntries(mapIds.map((id) => [id, new Map()])); // mapId -> palId -> points[]
  for (const s of parsed.palSpawns) {
    const mapId = assignMap(s.location, assignOrder);
    if (!mapId) continue;
    const px = toPx(mapId, s.location);
    for (const p of s.pals) {
      if (!isRealPal(p.id)) continue;
      const m = byMapPal[mapId];
      if (!m.has(p.id)) m.set(p.id, []);
      m.get(p.id).push({ ...px, lvMin: p.lvMin, lvMax: p.lvMax });
    }
  }
  for (const mapId of mapIds) {
    for (const [palId, points] of byMapPal[mapId]) {
      for (const c of clusterPoints(points, radius)) {
        let lvMin = Infinity, lvMax = -Infinity;
        for (const it of c.items) { lvMin = Math.min(lvMin, it.lvMin); lvMax = Math.max(lvMax, it.lvMax); }
        // Cluster centroid is in pixel space → back to world for emission.
        // sortKey stays pixel-based so marker ids match the pre-migration order.
        const w = inverses[mapId](c.x, c.y);
        push(mapId, {
          subtype: palId, x: round2(w.X), y: round2(w.Y), z: c.z,
          icon: palIcon(palIcons, palId) ?? undefined,
          sortKey: `${c.x},${c.y}`,
          count: c.items.length,
          descByLng: Object.fromEntries(languages.map((lng) => [lng, `Lv.${lvMin}–${lvMax}`])),
        });
      }
    }
  }

  // Assign stable ids: per map+subtype, sort by sortKey then coords, index from 1
  const markers = {};
  const markerLoc = Object.fromEntries(languages.map((lng) =>
    [lng, Object.fromEntries(mapIds.map((id) => [id, {}]))])); // lng -> mapId -> markerId -> {name?, description?}
  for (const mapId of mapIds) {
    const bySubtype = new Map();
    for (const c of candidates[mapId]) {
      if (!bySubtype.has(c.subtype)) bySubtype.set(c.subtype, []);
      bySubtype.get(c.subtype).push(c);
    }
    markers[mapId] = [];
    for (const s of subtypeDefs) {
      const list = (bySubtype.get(s.id) ?? []).sort((a, b) =>
        a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.x - b.x || a.y - b.y);
      list.forEach((c, i) => {
        const id = `${mapId}-${s.id}-${i + 1}`;
        markers[mapId].push({
          id, subtype: s.id, category: subtypeCat[s.id],
          x: c.x, y: c.y, z: c.z,
          ...(c.icon ? { icon: c.icon } : {}),
          ...(c.zukanIndex ? { zukanIndex: c.zukanIndex, ...(c.zukanIndexSuffix ? { zukanIndexSuffix: c.zukanIndexSuffix } : {}) } : {}),
          ...(c.count && c.count > 1 ? { count: c.count } : {}),
          images: [], contributors: [], indexInSubtype: i + 1,
        });
        if (c.nameByLng || c.descByLng) {
          for (const lng of languages) {
            const name = c.nameByLng?.[lng];
            const description = c.descByLng?.[lng];
            if (name || description) {
              markerLoc[lng][mapId][id] = {
                ...(name ? { name } : {}),
                ...(description ? { description } : {}),
              };
            }
          }
        }
      });
    }
  }

  // Locales — taxonomy/map labels are hand-authored per language in types.yaml;
  // pal names come from the game's per-language L10N tables.
  const locales = {};
  for (const lng of languages) {
    locales[lng] = {
      maps: Object.fromEntries(src.maps.map((m) => [m.id, {
        name: m.names[lng], description: '', shortName: m.shortNames[lng],
      }])),
      types: {
        categories: Object.fromEntries(src.categories.map((c) => [c.id, { name: c.names[lng] }])),
        subtypes: Object.fromEntries(subtypeDefs.map((s) => [s.id, { name: s.names[lng], description: '' }])),
      },
      markers: markerLoc[lng],
      regions: Object.fromEntries(mapIds.map((id) => [id, {}])),
    };
  }

  const regions = Object.fromEntries(mapIds.map((id) => [id, []]));
  return { maps, types, markers, regions, locales };
}

export async function runEmit(parsedDir, dataOut) {
  const ds = buildDataset(readParsed(parsedDir));
  const w = (rel, obj) => {
    const f = path.join(dataOut, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, JSON.stringify(obj, null, 1));
  };
  // Contract file shapes: MapsFile/RawMarkersFile/RawRegionsFile wrap their
  // arrays in {maps}/{markers}/{regions} (packages/data-contract schemas).
  w('maps.json', { maps: ds.maps });
  w('types.json', ds.types);
  for (const [mapId, list] of Object.entries(ds.markers)) w(`markers/${mapId}.json`, { markers: list });
  for (const [mapId, list] of Object.entries(ds.regions)) w(`regions/${mapId}.json`, { regions: list });
  for (const [lng, l] of Object.entries(ds.locales)) {
    w(`locales/${lng}/maps.json`, l.maps);
    w(`locales/${lng}/types.json`, l.types);
    for (const mapId of Object.keys(ds.markers)) {
      w(`locales/${lng}/markers/${mapId}.json`, l.markers[mapId]);
      w(`locales/${lng}/regions/${mapId}.json`, l.regions[mapId]);
    }
  }
  for (const [mapId, list] of Object.entries(ds.markers)) console.log(`emit: ${mapId} ${list.length} markers`);
}

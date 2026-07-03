import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { makeTransform } from './transform.mjs';
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

  // maps.json
  const maps = src.maps.map((m) => ({
    id: m.id, name: m.id, type: 'world',
    tileWidth: 1024, tileHeight: 1024, tilesCountX: 8, tilesCountY: 8,
    isVisible: true,
  }));

  // types.json — contract TypesFile: categories nest their subtypes; `name`
  // is the machine key (locales carry display names, keyed by it). We use
  // id === name, matching the aion2 data repo's locale keying.
  const types = {
    categories: src.categories.map((c) => ({
      id: c.id, name: c.id,
      subtypes: src.subtypes.filter((s) => s.category === c.id).map((s) => ({
        id: s.id, name: s.id,
        ...(s.icon ? { icon: s.icon } : {}),
        ...(s.color ? { color: s.color } : {}),
      })),
    })),
  };

  // Candidate markers per map, keyed by subtype, before id assignment.
  // Each candidate: { subtype, category, x, y, z, icon?, sortKey, nameByLng?, descByLng? }
  const candidates = Object.fromEntries(mapIds.map((id) => [id, []]));
  const subtypeCat = Object.fromEntries(src.subtypes.map((s) => [s.id, s.category]));
  const push = (mapId, c) => candidates[mapId].push(c);
  const toPx = (mapId, loc) => {
    const { x, y } = transforms[mapId](loc);
    return { x: round2(x), y: round2(y), z: round2(loc.Z ?? 0) };
  };

  for (const p of parsed.pois) {
    const mapId = assignMap(p.location, assignOrder);
    if (!mapId) continue;
    push(mapId, { subtype: p.subtype, ...toPx(mapId, p.location), sortKey: p.sourceName });
  }

  for (const b of parsed.bosses) {
    const mapId = assignMap(b.location, assignOrder);
    if (!mapId) continue;
    const nameByLng = Object.fromEntries(languages.map((lng) =>
      [lng, `${palName(namesByLang[lng], b.characterId)} Lv.${b.level}`]));
    push(mapId, {
      subtype: 'fieldBoss', ...toPx(mapId, b.location),
      icon: palIcon(palIcons, b.characterId) ?? 'T_icon_compass_boss',
      sortKey: `${b.characterId}-${b.key}`,
      nameByLng,
    });
  }

  // Pal spawns: cluster per map at radius from types.yaml
  const radius = src.subtypes.find((s) => s.id === 'palSpawn').clusterRadius;
  const byMap = Object.fromEntries(mapIds.map((id) => [id, []]));
  for (const s of parsed.palSpawns) {
    const mapId = assignMap(s.location, assignOrder);
    if (!mapId) continue;
    byMap[mapId].push({ ...toPx(mapId, s.location), spawnerName: s.spawnerName, pals: s.pals });
  }
  for (const mapId of mapIds) {
    for (const c of clusterPoints(byMap[mapId], radius)) {
      // distinct pals across the cluster, keeping first-seen order, merged level ranges
      const seen = new Map();
      for (const item of c.items) {
        for (const p of item.pals) {
          const e = seen.get(p.id);
          if (e) { e.lvMin = Math.min(e.lvMin, p.lvMin); e.lvMax = Math.max(e.lvMax, p.lvMax); }
          else seen.set(p.id, { ...p });
        }
      }
      const pals = [...seen.values()];
      push(mapId, {
        subtype: 'palSpawn', x: c.x, y: c.y, z: c.z,
        icon: palIcon(palIcons, pals[0].id) ?? undefined,
        sortKey: `${c.x},${c.y}`,
        nameByLng: Object.fromEntries(languages.map((lng) =>
          [lng, pals.map((p) => palName(namesByLang[lng], p.id)).join(' / ')])),
        descByLng: Object.fromEntries(languages.map((lng) =>
          [lng, pals.map((p) => `${palName(namesByLang[lng], p.id)} Lv.${p.lvMin}–${p.lvMax}`).join('\n')])),
      });
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
    for (const s of src.subtypes) {
      const list = (bySubtype.get(s.id) ?? []).sort((a, b) =>
        a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.x - b.x || a.y - b.y);
      list.forEach((c, i) => {
        const id = `${mapId}-${s.id}-${i + 1}`;
        markers[mapId].push({
          id, subtype: s.id, category: subtypeCat[s.id],
          x: c.x, y: c.y, z: c.z,
          ...(c.icon ? { icon: c.icon } : {}),
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
        subtypes: Object.fromEntries(src.subtypes.map((s) => [s.id, { name: s.names[lng], description: '' }])),
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

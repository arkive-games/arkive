import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const MAP_IMAGES = { MainWorld: 'Texture/UI/Map/T_WorldMap.png', WorldTree: 'Texture/UI/Map/T_TreeMap.png' };
const TILE = 1024, COUNT = 8;
const pad2 = (n) => String(n).padStart(2, '0');

function collectIconNames(dataOut) {
  const icons = new Set();
  // Contract shapes: types.json nests subtypes under categories; markers files wrap in {markers}.
  const types = JSON.parse(fs.readFileSync(path.join(dataOut, 'types.json'), 'utf8'));
  for (const c of types.categories) for (const s of c.subtypes) if (s.icon) icons.add(s.icon);
  for (const f of fs.readdirSync(path.join(dataOut, 'markers'))) {
    const { markers } = JSON.parse(fs.readFileSync(path.join(dataOut, 'markers', f), 'utf8'));
    for (const m of markers) if (m.icon) icons.add(m.icon);
  }
  return icons;
}

function iconSourcePath(raw, name) {
  const compass = path.join(raw, 'Texture/UI/InGame', `${name}.png`);
  if (name.startsWith('T_icon_compass_') && fs.existsSync(compass)) return compass;
  const pal = path.join(raw, 'Texture/PalIcon/Normal', `${name}.png`);
  if (fs.existsSync(pal)) return pal;
  return null;
}

export async function runTiles(raw, dataOut, resOut) {
  for (const [mapId, imgRel] of Object.entries(MAP_IMAGES)) {
    const dir = path.join(resOut, 'tiles', mapId);
    fs.mkdirSync(dir, { recursive: true });
    const img = sharp(path.join(raw, imgRel), { limitInputPixels: false });
    for (let x = 0; x < COUNT; x++) {
      for (let y = 0; y < COUNT; y++) {
        await img.clone()
          .extract({ left: x * TILE, top: y * TILE, width: TILE, height: TILE })
          .webp({ quality: 90 })
          .toFile(path.join(dir, `${mapId}_${pad2(x)}_${pad2(y)}.webp`));
      }
    }
    console.log(`tiles: ${mapId} 64 tiles`);
  }

  const iconDir = path.join(resOut, 'icons');
  fs.mkdirSync(iconDir, { recursive: true });
  let ok = 0, missing = [];
  for (const name of collectIconNames(dataOut)) {
    const src = iconSourcePath(raw, name);
    if (!src) { missing.push(name); continue; }
    await sharp(src).webp({ quality: 90 }).toFile(path.join(iconDir, `${name}.webp`));
    ok++;
  }
  console.log(`icons: ${ok} converted`);
  if (missing.length) console.warn('icons missing sources:', missing);
}

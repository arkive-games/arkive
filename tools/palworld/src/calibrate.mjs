import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { makeTransform } from './transform.mjs';
import { assignMap } from './bounds.mjs';
import { readParsed } from './extract.mjs';

const MAP_IMAGES = { MainWorld: 'Texture/UI/Map/T_WorldMap.png', WorldTree: 'Texture/UI/Map/T_TreeMap.png' };
const SIZE = 8192, PREVIEW = 1024;

export async function runCalibrate(raw, parsedDir) {
  const { bounds, pois } = readParsed(parsedDir);
  const maps = [
    { mapId: 'WorldTree', ...bounds.WorldTree },
    { mapId: 'MainWorld', ...bounds.MainWorld },
  ];
  const outDir = path.join(parsedDir, '..', 'calibration');
  fs.mkdirSync(outDir, { recursive: true });
  const statues = pois.filter((p) => p.subtype === 'fastTravel');

  for (const [mapId, imgRel] of Object.entries(MAP_IMAGES)) {
    const base = await sharp(path.join(raw, imgRel)).resize(PREVIEW, PREVIEW).png().toBuffer();
    const pts = statues.filter((s) => assignMap(s.location, maps) === mapId);
    for (const pxAxis of ['X', 'Y']) {
      for (const flipX of [false, true]) {
        for (const flipY of [false, true]) {
          const t = makeTransform(bounds[mapId], { pxAxis, flipX, flipY }, SIZE, SIZE);
          const circles = pts.map((s) => {
            const { x, y } = t(s.location);
            return `<circle cx="${x / 8}" cy="${y / 8}" r="5" fill="red" stroke="white"/>`;
          }).join('');
          const svg = Buffer.from(`<svg width="${PREVIEW}" height="${PREVIEW}">${circles}</svg>`);
          const name = `${mapId}_px${pxAxis}_fx${flipX ? 1 : 0}_fy${flipY ? 1 : 0}.png`;
          await sharp(base).composite([{ input: svg }]).toFile(path.join(outDir, name));
        }
      }
    }
    console.log(`calibrate: ${mapId} — ${pts.length} statues, 8 renders`);
  }
  console.log('calibrate: wrote', outDir);
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeParsed } from './extract.mjs';

// Not exported: this module dispatches on import; stage modules receive paths as args.
const here = path.dirname(fileURLToPath(import.meta.url));
const RAW = process.env.PALWORLD_RAW
  ?? 'E:/SteamLibrary/steamapps/common/Palworld/Exports/Pal/Content/Pal';
const DATA_OUT = process.env.PALWORLD_DATA_OUT ?? 'E:/aion2-map/data-palworld';
const RES_OUT = process.env.PALWORLD_RES_OUT ?? 'E:/aion2-map/resource-palworld';
const PARSED_DIR = path.join(here, '..', 'parsed');

const stage = process.argv[2];
if (stage === 'extract') {
  writeParsed(RAW, PARSED_DIR);
  console.log('extract: wrote', PARSED_DIR);
} else if (stage === 'calibrate') {
  await (await import('./calibrate.mjs')).runCalibrate(RAW, PARSED_DIR);
} else if (stage === 'emit') {
  await (await import('./emit.mjs')).runEmit(PARSED_DIR, DATA_OUT);
} else if (stage === 'tiles') {
  await (await import('./tiles.mjs')).runTiles(RAW, DATA_OUT, RES_OUT);
} else {
  console.error('usage: node src/cli.mjs <extract|calibrate|emit|tiles>');
  process.exit(1);
}

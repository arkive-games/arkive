// SVGs used as images cannot fetch child images; embed the original artwork.
import { readFileSync, writeFileSync } from 'node:fs'

const asset = name => new URL('../src/assets/glimmith-' + name, import.meta.url)
const frame = `<path d="M40 2 78 40 40 78 2 40Z" fill="none" stroke="#25373a" stroke-width="4"/>
  <path d="M40 2 78 40 40 78 2 40Z" fill="none" stroke="#e3bb73" stroke-width="1.5"/>
  <path d="m3 40 6-3 3 3-3 3Zm74 0-6-3-3 3 3 3Z" fill="#6bbcb9" stroke="#263f42" stroke-width="1.5"/>`
for (const [name, ext, mime] of [['window', 'svg', 'svg+xml'], ['perfected', 'png', 'png']]) {
  const art = readFileSync(asset('marker-' + name + '.' + ext)).toString('base64')
  writeFileSync(asset('selected-' + name + '.svg'),
    `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">${frame}
  <image x="9" y="9" width="62" height="62" href="data:image/${mime};base64,${art}"/></svg>\n`)
}

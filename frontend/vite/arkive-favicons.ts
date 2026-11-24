import type { Plugin } from 'vite'

/** The first outline of the shared Arkive wordmark, centered on a 48-unit tile. */
const INITIAL = 'M-64.371-23.596C-66.69-23.596-68.878-22.662-70.533-20.964-72.175-19.28-73.079-17.068-73.079-14.735V-14.236H-64.343V-1.079C-64.343-.492-64.63-.115-65.195 .044-65.326 .081-65.456 .099-65.58 .099-65.968 .099-66.271-.088-66.505-.474L-79.805-22.947C-80.042-23.347-80.478-23.596-80.943-23.596H-88.7C-89.182-23.596-89.612-23.346-89.85-22.926-90.088-22.507-90.083-22.01-89.835-21.596L-74.375 4.302C-72.472 7.435-69.179 9.304-65.564 9.304-64.608 9.304-63.649 9.171-62.713 8.909-58.181 7.64-55.137 3.626-55.137-1.079V-22.273C-55.137-23.003-55.73-23.596-56.46-23.596Z'

function icon(background: string, ink: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
  <rect width="48" height="48" rx="9" fill="${background}"/>
  <path transform="matrix(1 0 0 -1 96.58 16.85)" fill="${ink}" d="${INITIAL}"/>
</svg>`
}

const icons = [
  { fileName: 'arkive-a-light.svg', source: icon('#fff', '#000'), media: '' },
  { fileName: 'arkive-a-dark.svg', source: icon('#000', '#fff'), media: '(prefers-color-scheme: dark)' },
]

export function arkiveFavicons(): Plugin {
  let base = '/'
  return {
    name: 'arkive-favicons',
    configResolved(config) { base = config.base },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const asset = icons.find(({ fileName }) => req.url?.split('?')[0] === `/${fileName}`)
        if (!asset) return next()
        res.setHeader('Content-Type', 'image/svg+xml')
        res.end(asset.source)
      })
    },
    generateBundle() {
      for (const { fileName, source } of icons) this.emitFile({ type: 'asset', fileName, source })
    },
    transformIndexHtml() {
      return icons.map(({ fileName, media }) => ({
        tag: 'link',
        attrs: { rel: 'icon', type: 'image/svg+xml', sizes: 'any', href: base + fileName, ...(media && { media }) },
      }))
    },
  }
}

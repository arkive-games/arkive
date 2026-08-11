import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { EngineMarker } from '@gamemap/map-engine'
import { renderMarkerPopup } from './popup'

function marker(overrides: Partial<EngineMarker>): EngineMarker {
  return {
    id: 'marker',
    subtype: 'boss-fixed',
    x: 0,
    y: 0,
    images: [],
    contributors: [],
    indexInSubtype: 0,
    localizedName: 'Marker',
    subtypeLabel: 'Marker subtype',
    ...overrides,
  }
}

const deps = {
  t: (key: string) => key,
  regionName: () => '',
  categoryName: () => '',
  onSelectMarker: () => undefined,
}

describe('renderMarkerPopup', () => {
  it('omits the large image for fixed and roaming bosses', () => {
    for (const movement of ['fixed', 'roaming'] as const) {
      const html = renderToStaticMarkup(
        <>{renderMarkerPopup(marker({ movement, images: ['/boss.webp'] }), deps)}</>,
      )
      expect(html).not.toContain('<img')
    }
  })

  it('keeps images available for non-boss marker details', () => {
    const html = renderToStaticMarkup(
      <>{renderMarkerPopup(marker({ images: ['/resource.webp'] }), deps)}</>,
    )
    expect(html).toContain('<img')
    expect(html).toContain('/resource.webp')
  })

  it('shows the official two-way connection action for paired Cave Passages', () => {
    const html = renderToStaticMarkup(
      <>{renderMarkerPopup(marker({
        subtype: 'navigation-cave-passage',
        pairedMarkerId: 'other-end',
        connection: 'bidirectional',
        connectionGroup: 1,
      }), deps)}</>,
    )

    expect(html).toContain('marker.bidirectional')
    expect(html).toContain('marker.connectionGroup')
    expect(html).toContain('marker.goToOtherEnd')
  })
})

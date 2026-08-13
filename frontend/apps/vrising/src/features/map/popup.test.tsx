import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { EngineMarker } from '@gamemap/map-engine-gl'
import { VrisingMarkerDetail } from './popup'

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
  language: 'en-US',
  regionName: () => '',
  categoryName: () => '',
  onClose: () => undefined,
  onSelectMarker: () => undefined,
}

describe('renderMarkerPopup', () => {
  it('omits the large image for fixed and roaming bosses', () => {
    for (const movement of ['fixed', 'roaming'] as const) {
      const html = renderToStaticMarkup(
        <VrisingMarkerDetail marker={marker({ movement, images: ['/boss.webp'] })} deps={deps} />,
      )
      expect(html).not.toContain('<img')
    }
  })

  it('keeps images available for non-boss marker details', () => {
    const html = renderToStaticMarkup(
      <VrisingMarkerDetail marker={marker({ images: ['/resource.webp'] })} deps={deps} />,
    )
    expect(html).toContain('<img')
    expect(html).toContain('/resource.webp')
  })

  it('shows the official two-way connection action for paired Cave Passages', () => {
    const html = renderToStaticMarkup(
      <VrisingMarkerDetail
        marker={marker({
          subtype: 'navigation-cave-passage',
          pairedMarkerId: 'other-end',
          connection: 'bidirectional',
          connectionGroup: 1,
        })}
        deps={deps}
      />,
    )

    expect(html).toContain('marker.bidirectional')
    expect(html).toContain('marker.connectionGroup')
    expect(html).toContain('marker.goToOtherEnd')
  })
})

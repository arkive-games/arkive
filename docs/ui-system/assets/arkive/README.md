# Arkive Wordmark Originals

User-supplied final artwork, archived for the team on 2026-11-13. These files are portable
reference assets for the team, not replacements for deployed assets. All six
copies match the originals by SHA-256; only their filenames were translated.
The source folder's unrelated application log is excluded.

| File | Contents |
| --- | --- |
| [wordmark-black.png](wordmark-black.png) | Solid black wordmark, 4168 x 1250. |
| [wordmark-white.png](wordmark-white.png) | Solid white wordmark, 4168 x 1251. |
| [wordmark-gradient-fill.png](wordmark-gradient-fill.png) | Dark-to-gold filled wordmark, 4168 x 1251. |
| [wordmark-orange-outline.png](wordmark-orange-outline.png) | Orange outline and offset depth with opaque white letter interiors, 4168 x 1251. |
| [wordmark-gradient-outline.png](wordmark-gradient-outline.png) | Gradient outline and offset depth with opaque white letter interiors, 4168 x 1251. |
| [arkive-master.psd](arkive-master.psd) | Original editable source; preserved without modification. |

## Handling

The homepage footer was copied from https://arkive.games/ on 2026-11-15:
`home-footer.zh-CN.json` contains the rendered localized HTML, source URL,
viewport and capture bounds; `home-footer-live.css` contains the corresponding
deployed CSS rules, retaining their media conditions and embedded wordmark mask.
These are reference copies, separate from the supplied originals. They are not
the original React source or the site's JavaScript event handlers.
The isolated [copy host](../../home-footer-copy.html) adjusts only captured
viewport coordinates for its own frame. It does not recreate dialogs or the
scroll-driven voyage. Refresh both copies from production rather than restyling
the component manually.

- Preserve the custom lettering and original colors; do not recreate the mark
  with a font or invent a symbol by extracting a letter.
- PNGs have transparent outer padding. Their visible content bounds differ;
  equal image widths do not produce equal visible wordmark sizes. Outline
  variants also have white interiors, so they are not transparent strokes.
- Keep originals intact. Any later optimized/cropped exports need distinct
  filenames and documented derivation.
- Variant roles, clear space, minimum visible size, and background contrast
  pairs still need visual review. Inclusion in this package does not approve
  a particular variant for a particular component.

See [Visual direction](../../visual-direction.md) for live homepage observations
and the boundary between reference artwork and proposed shared rules.

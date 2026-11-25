# Portal and game locale audit

Reviewed on 2026-11-25. This is a coverage inventory, not a claim that every translated string is correct. The portal and a game's own language preference are distinct: a supported site-specific override can legitimately take precedence over the portal language.

| Surface | Evidence | Result / remaining work |
| --- | --- | --- |
| Portal home, game directory, tools and public forum | Real switcher, plus the assembled translation resources | Fixed overflowing shortcut titles, browser title, About slogan, Japanese/Korean feature names and descriptions, two game descriptions, and catalog status actions. The three public subviews showed no Han characters in sampled English main content. This last check detects leftover Chinese, not wrong English. |
| Portal moderation and history | Resource registrations in the portal i18n module and the platform changelog resolver | The image moderation navigation and queue copy use the English bundle for Japanese and Korean; platform release entry bodies also use English when neither locale is supplied. Public dialog controls and editorial history records have different owners. Authenticated moderator screens were not exercised. |
| AION2 | Four supported languages, hand-authored YAML key comparison, map home in English | Map, Wiki and Search switched in the browser. Compared with Simplified Chinese, the common UI namespace lacks 94 keys in English, 116 in Traditional Chinese and 94 in Korean, including save, delete and submit. A missing key can fall back to Simplified Chinese when a screen requests it; these are not counts of visible defects. Map and wiki records loaded from the separate data repository were not counted. |
| Palworld | 17 assembled UI bundles and English breeding page | Standard breeding and parent controls switched in the browser. The zero-route summary is absent from the 14 languages outside English and the two Chinese variants. Some quest, blueprint and other feature bundles deliberately fill unsupported translations with English. Key presence alone does not prove a translation. |
| Slay the Spire 2 | The language list and UI resource table in the game i18n module | The selector offers 15 data languages but only three distinct UI dictionaries (English and the two Chinese variants). Navigation, loading text and card filters can therefore stay English in the other 12 languages. This is separate from the cards' game-sourced translations. |
| Lord of Mysteries | Three assembled UI bundles | No missing English keys relative to Simplified Chinese in the assembled UI dictionary. The four relic tier labels retain their source-language glyphs in English; decide whether to show translated names alongside these in-game grades. This check did not cover each item record. |
| Phantom Blade Zero and V Rising | Three assembled UI bundles per app | No missing English or Traditional Chinese keys relative to Simplified Chinese in these dictionaries; this does not certify every dynamic screen or data record. |
| Ragnarok Online 3 | Chinese catalog import and running game homepage | The homepage, encyclopedia and build navigation remain Simplified Chinese. This surface does not provide an English UI catalog. |
| Order of the Sinking Star, the Glimmith guide and Lost Ark | Host settings, switchers and string ownership | The first two explicitly configure Simplified Chinese; the Lost Ark tool also pins Chinese in controls and formatting. A portal language change cannot translate these destinations. |

## First implementation batch

The table above records the initial inventory. AION2 map search now describes the current map rather than the global wiki index. All four UI languages supply its prompt and category visibility actions. A completed search with no matches shows a localized message; other search hosts retain their existing behavior.

Palworld now requires a zero-route hint in each of its 17 breeding dictionaries and interpolates the active planner button label. The desktop pickers now announce their translated slot names as on mobile. English reports a single chain in the singular.

In a local browser with a Chinese language preference, choosing English on the portal carried through to AION2 without a game override. A search for Monolith on the Eltnen map returned a selectable marker; an unmatched query showed No results. The portal's breeding shortcut opened Palworld in English. Selecting Lamball for both parents returned one Lamball recipe; requiring Jetragon as the offspring produced no standard route. Switching only Palworld to Japanese translated the guidance, while the portal remained English on return. No carousel assets or settings changed in this batch.

## Verification and boundaries

- Reproduced English text outside four shortcut links at a desktop width of 1440 CSS pixels: The Artisan of Glimmith, Lord of Mysteries, Ragnarok Online 3 and Phantom Blade Zero.
- Switched among all five portal languages through the visible menu. Compared the rendered text rectangles with each link at widths of 320, 390, 760, 1024, 1440 and 1920 CSS pixels. No names escaped their links after the fix.
- All languages intentionally share the original carousel posters and framing, including their embedded lettering. Desktop and phone retain their respective artwork. Game icons, trademarks, user names, player posts, legal filing identifiers and a language menu's native language names are not UI translation misses.
- Resource comparison covers the assembled app-owned dictionaries for the portal, Palworld, Lord of Mysteries, Phantom Blade Zero, Slay the Spire 2 and V Rising, plus AION2's hand-authored common and wiki YAML. Equal English strings, search aliases and brand names were not treated as automatic defects.
- No production deployment, signed-in account flow, real moderation decision or exhaustive audit of external game datasets was performed.

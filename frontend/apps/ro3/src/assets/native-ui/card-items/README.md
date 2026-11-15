# Native card inventory icons

These 242 WebP files are the game's inventory sprites, not crops of the full card illustrations or the adventure portraits.

Source: RO3 client build 0.0.1.14; `item_<card id>` sprites from bundle `3f1a2f56ca10b8a/00107_b2d63625d4b27cf4.bundle`, resolved through the `Item_Card` SpriteAtlas in `f0/f0d5d0f83cca209a.bundle`. All 242 IDs in the current exported `cards.json` have a matching sprite.

Extraction uses `tools/apps/ro3/art.py` (`Category`, `export`), restricted to those two catalog entries and sprite pattern `^item_14[2-6]\d+$`. Native packed sprite dimensions range from 50 to 64 pixels on an axis. After the atlas sprite is restored, each image is centered on a transparent square canvas with side `max(width, height)` and saved as lossless WebP. The artwork is neither resized nor cropped to make it square.

These are tiny UI assets bundled with the frontend, like the adjacent native genre UI assets, so no resource-repository publication is required. `lib/buildCardArt.ts` resolves the matching ID and falls back to the original illustration only for future unknown IDs.

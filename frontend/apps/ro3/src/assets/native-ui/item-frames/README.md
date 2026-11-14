# Native item plates and corner glyphs

Source: RO3 client build 0.0.1.14, `Common_Item` sprites in `6a/6a5a0322a4207faf.bundle`, resolved through the shipped sprite atlases with `tools/apps/ro3/art.py`.

- `common_icon_item_01_ash` through `06_red`: square item quality plates; the corresponding `common_icon_equip_*` set is portrait-shaped and is deliberately not used for the square build slots.
- `common_equip_num_*` files are unused generic glyphs. They are not confirmed complete T-rank badges and are not rendered; the editor uses a plain Tn text label instead of presenting unrelated glyphs as a native badge.
- `part_*`: original `icon_equip_gridicon_{weapon,offhand,armor,cloak,shoes,accessory}_1` sprites, copied under explicit part names for card-binding badges.

All assets preserve their original pixels and transparent margins; lossless WebP encoding only. Rank values come from equipment iRank, quality from the item/card quality field, and part badges from card.part. Cards do not receive an invented T rank or star level.

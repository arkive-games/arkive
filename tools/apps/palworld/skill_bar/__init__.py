"""Recolor the game's grayscale faceted skill-bar strip per passive rarity.

The passive-skill title bars in Palworld are the single grayscale texture
``T_prt_pal_skill_base_02.png`` (a 264x32 strip of alternating apex-up / apex-down
triangles) *multiplied* by a per-rarity color. This subpackage reproduces that:

  * ``parse_colors`` samples the per-rarity tints (blue, gold) from a reference
    in-game screenshot and writes them to ``colors.json``.
  * ``generate`` reads ``colors.json`` and the grayscale strip (``strip.png``),
    multiplies the strip's luminance by each rarity's (optionally
    horizontal-gradient) tint, and writes lossless WebP figures into the palworld
    app's public images. The "normal" and "red" rarities use a flat background in
    the app, so no figure is generated for them.

Run (from ``tools/``):
    uv run python -m apps.palworld.skill_bar.parse_colors
    uv run python -m apps.palworld.skill_bar.generate
"""

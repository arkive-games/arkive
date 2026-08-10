# Shared fonts

The Meta application owns the canonical Arkive font assets published at:

`https://tc-imba.com/fonts/noto-sans/v1/index.css`

Run `pnpm fonts:sync` from `frontend/` after a fresh install to regenerate the
checked-in files from Meta's pinned Fontsource packages. Published version
directories are immutable. Increment `ASSET_VERSION` in the sync script and
update the canonical URL before changing either font package version.

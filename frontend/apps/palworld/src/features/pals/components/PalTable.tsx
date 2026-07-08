import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { elementIconUrl, itemIconUrl, palIconUrl, workIconUrl } from '../../../lib/assets'
import { formatPalId } from '../../../lib/palId'
import { WORK_TYPES, type PalEntry, type PalsBundle } from '../../../lib/pals'
import { filterStrings } from '../filterStrings'

function Glyph({ src, size = 18, title }: { src: string; size?: number; title?: string }) {
  const [ok, setOk] = useState(true)
  if (!ok) return null
  return (
    <img
      src={src}
      alt=""
      title={title}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setOk(false)}
      className="shrink-0 object-contain"
    />
  )
}

function PalRow({ pal, bundle }: { pal: PalEntry; bundle: PalsBundle }) {
  const fs = filterStrings(useTranslation().i18n.resolvedLanguage ?? 'en-US')
  const pid = formatPalId(pal.zukanIndex, pal.zukanIndexSuffix)
  const name = bundle.text[pal.id]?.name ?? pal.id
  const works = WORK_TYPES.filter((w) => pal.work[w] != null).sort(
    (a, b) => (pal.work[b] ?? 0) - (pal.work[a] ?? 0),
  )
  return (
    <tr className="border-t border-border/60 align-middle hover:bg-accent/40">
      <td className="px-2 py-1.5 text-center tabular-nums text-xs text-muted-foreground">
        {pid ? `${pid.text}${pid.accent ?? ''}` : '—'}
      </td>
      <td className="px-2 py-1.5">
        <Link to="/pals/$id" params={{ id: pal.id }} className="flex items-center gap-2 hover:text-primary">
          <img src={palIconUrl(pal.icon)} alt="" width={28} height={28} loading="lazy" className="shrink-0 object-contain" />
          <span className="truncate font-medium">{name}</span>
        </Link>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex gap-1">
          {pal.elements.map((e) => (
            <Glyph key={e} src={elementIconUrl(e)} size={18} title={bundle.enums.elements[e] ?? e} />
          ))}
        </div>
      </td>
      <td className="px-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          {works.map((w) => (
            <span
              key={w}
              title={`${bundle.enums.work[w] ?? w} Lv${pal.work[w]}`}
              className="inline-flex items-center gap-0.5 rounded bg-secondary/60 px-1 py-0.5 text-xs tabular-nums"
            >
              <Glyph src={workIconUrl(w)} size={14} />
              {pal.work[w]}
            </span>
          ))}
        </div>
      </td>
      <td className="px-2 py-1.5 text-center text-xs">{pal.nocturnal ? fs.yes : '—'}</td>
      <td className="px-2 py-1.5 text-xs">{fs.reactions[pal.reaction] ?? pal.reaction}</td>
      <td className="px-2 py-1.5 text-center tabular-nums text-xs text-muted-foreground">{pal.rarity}</td>
      <td className="px-2 py-1.5">
        <div className="flex flex-wrap gap-1">
          {pal.drops.map((d) =>
            bundle.itemIcon[d.item] ? (
              <Link key={d.item} to="/items/$id" params={{ id: d.item }}>
                <Glyph src={itemIconUrl(bundle.itemIcon[d.item])} size={20} title={`${bundle.items[d.item] ?? d.item} · ${d.rate}%`} />
              </Link>
            ) : (
              <Link
                key={d.item}
                to="/items/$id"
                params={{ id: d.item }}
                title={`${d.rate}%`}
                className="rounded bg-secondary/60 px-1 py-0.5 text-xs hover:text-primary"
              >
                {bundle.items[d.item] ?? d.item}
              </Link>
            ),
          )}
        </div>
      </td>
    </tr>
  )
}

export function PalTable({ pals, bundle }: { pals: PalEntry[]; bundle: PalsBundle }) {
  const fs = filterStrings(useTranslation().i18n.resolvedLanguage ?? 'en-US')
  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead className="bg-secondary/50 text-left text-xs font-semibold text-muted-foreground">
          <tr>
            <th className="px-2 py-2 text-center">{fs.col.no}</th>
            <th className="px-2 py-2">{fs.col.name}</th>
            <th className="px-2 py-2">{fs.col.elements}</th>
            <th className="px-2 py-2">{fs.col.work}</th>
            <th className="px-2 py-2 text-center">{fs.col.nocturnal}</th>
            <th className="px-2 py-2">{fs.col.reaction}</th>
            <th className="px-2 py-2 text-center">{fs.col.rarity}</th>
            <th className="px-2 py-2">{fs.col.drops}</th>
          </tr>
        </thead>
        <tbody>
          {pals.map((p) => (
            <PalRow key={`${p.id}`} pal={p} bundle={bundle} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

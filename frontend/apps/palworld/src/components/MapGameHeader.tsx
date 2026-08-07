import { Compass } from 'lucide-react'

export function MapGameHeader({ backgroundUrl, title }: {
  backgroundUrl?: string
  title: string
}) {
  return (
    <div className="palworld-game-header relative min-h-32 overflow-hidden border-b border-border">
      {backgroundUrl ? (
        <img
          src={backgroundUrl}
          alt=""
          aria-hidden
          className="absolute inset-0 size-full object-cover"
        />
      ) : null}
      <div className="palworld-game-header-shade absolute inset-0" aria-hidden />
      <div className="relative flex min-h-32 items-end justify-between gap-4 px-4 py-4">
        <div className="min-w-0">
          <img
            src={`${import.meta.env.BASE_URL}images/palworld-logo.webp`}
            alt="Palworld"
            className="h-auto w-48 max-w-full brightness-0 invert"
          />
          <p className="mt-2 truncate text-xs font-semibold tracking-[0.16em] text-white/80 uppercase">
            {title}
          </p>
        </div>
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/30 bg-black/15 text-[color:var(--pal-gold)] backdrop-blur-sm">
          <Compass className="size-5" strokeWidth={1.7} aria-hidden />
        </span>
      </div>
    </div>
  )
}

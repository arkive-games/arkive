import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IconChevronLeft, IconChevronRight, IconPlayerPause, IconPlayerPlay } from '@tabler/icons-react'
import { featureHref, localize, type GameFeature } from './featureCatalog'
import { siteHref, type SiteCard } from './sites'

export function HomeCarousel({ tools, sites, onOpen }: {
  tools: readonly GameFeature[]
  sites: readonly SiteCard[]
  onOpen: (feature: GameFeature, site: SiteCard) => void
}) {
  const { i18n } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const slides = tools.flatMap((feature) => {
    const site = sites.find((item) => item.id === feature.gameId)
    return site && siteHref(site) ? [{ feature, site }] : []
  })
  const [index, setIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [focused, setFocused] = useState(false)
  const [paused, setPaused] = useState(false)
  const [hidden, setHidden] = useState(false)
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const updateMotion = () => setReduced(media.matches)
    const updateVisibility = () => setHidden(document.hidden)
    updateMotion()
    updateVisibility()
    media.addEventListener('change', updateMotion)
    document.addEventListener('visibilitychange', updateVisibility)
    return () => {
      media.removeEventListener('change', updateMotion)
      document.removeEventListener('visibilitychange', updateVisibility)
    }
  }, [])
  useEffect(() => {
    if (slides.length < 2 || hovered || focused || paused || hidden || reduced) return
    const timer = window.setTimeout(() => setIndex((current) => (current + 1) % slides.length), 5000)
    return () => window.clearTimeout(timer)
  }, [index, slides.length, hovered, focused, paused, hidden, reduced])
  if (!slides.length) return null
  const activeIndex = index % slides.length
  const { feature, site } = slides[activeIndex]
  const copy = language === 'zh-CN'
    ? { previous: '上一项推荐', next: '下一项推荐', pause: '暂停轮播', play: '继续轮播', label: '精选工具', slide: '选择推荐' }
    : language === 'zh-TW'
      ? { previous: '上一項推薦', next: '下一項推薦', pause: '暫停輪播', play: '繼續輪播', label: '精選工具', slide: '選擇推薦' }
      : { previous: 'Previous recommendation', next: 'Next recommendation', pause: 'Pause slideshow', play: 'Resume slideshow', label: 'Featured tools', slide: 'Select recommendation' }
  const name = localize(feature.name, language)
  const open = () => onOpen(feature, site)
  return (
    <section className="home-carousel" aria-label={copy.label}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      onFocusCapture={() => setFocused(true)} onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false)
      }}>
      <div className="home-carousel-art">
        <a href={featureHref(feature, site)} onClick={open} aria-label={name}>
          <img src={site.bg} alt="" style={{ objectPosition: site.bgPosition }} />
        </a>
        {slides.length > 1 && <div className="home-carousel-controls">
          <div className="home-carousel-dots">{slides.map((slide, position) => (
            <button key={slide.feature.id} type="button" aria-label={`${copy.slide}: ${localize(slide.feature.name, language)}`}
              aria-current={position === activeIndex ? 'true' : undefined} onClick={() => setIndex(position)}><span /></button>
          ))}</div>
          <div className="home-carousel-arrows">
            <button type="button" aria-label={paused ? copy.play : copy.pause} aria-pressed={paused} onClick={() => setPaused(!paused)}>{paused ? <IconPlayerPlay /> : <IconPlayerPause />}</button>
            <button type="button" aria-label={copy.previous} onClick={() => setIndex((activeIndex + slides.length - 1) % slides.length)}><IconChevronLeft /></button>
            <button type="button" aria-label={copy.next} onClick={() => setIndex((activeIndex + 1) % slides.length)}><IconChevronRight /></button>
          </div>
        </div>}
      </div>
      <h3><a href={featureHref(feature, site)} onClick={open}>{name}</a></h3>
      {feature.description && <p>{localize(feature.description, language)}</p>}
    </section>
  )
}

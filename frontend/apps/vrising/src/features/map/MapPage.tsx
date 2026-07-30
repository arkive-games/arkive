import { useTranslation } from 'react-i18next'

/** Placeholder — replaced by the real map in Task 10. */
export default function MapPage() {
  const { t } = useTranslation()
  return (
    <div className="flex h-dvh items-center justify-center bg-background text-muted-foreground">
      {t('loading')}
    </div>
  )
}

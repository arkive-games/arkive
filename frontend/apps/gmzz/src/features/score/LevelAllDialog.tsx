import { useState } from 'react'
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@gamemap/ui'
import { useTranslation } from 'react-i18next'

import { DialogHead, RangeRow } from '@/features/equipment/EquipmentSection'

/**
 * One level for every owned puppet or connection, the way the equipment's
 * batch dialog sets every piece at once. The slider is a draft until applied;
 * the content remounts on each open, starting from `initial`.
 */
export default function LevelAllDialog({ title, hint, label, apply, min, max, initial, format, disabled, testId, onApply }: {
  title: string; hint: string; label: string; apply: string
  min: number; max: number; initial: number
  format: (value: number) => string
  disabled: boolean; testId: string
  onApply: (value: number) => void
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" disabled={disabled} className="gz-chip" data-testid={`${testId}-open`}>{title}</button>
      </DialogTrigger>
      <LevelAllContent title={title} hint={hint} label={label} apply={apply} min={min} max={max}
        initial={initial} format={format} testId={testId} onApply={onApply} />
    </Dialog>
  )
}

function LevelAllContent({ title, hint, label, apply, min, max, initial, format, testId, onApply }: {
  title: string; hint: string; label: string; apply: string
  min: number; max: number; initial: number
  format: (value: number) => string
  testId: string
  onApply: (value: number) => void
}) {
  const { t } = useTranslation()
  const [value, setValue] = useState(Math.min(max, Math.max(min, initial)))
  return (
    <DialogContent className="gz-dlg sm" size="sm" data-testid={`${testId}-dialog`}>
      <DialogHead title={title} />
      <p className="note">{hint}</p>
      <RangeRow label={label} value={value} min={min} max={max} output={format(value)} testId={testId} onChange={setValue} />
      <div className="gz-dlg-foot">
        <DialogClose asChild>
          <button type="button" className="gz-btn">{t('equip.cancel')}</button>
        </DialogClose>
        <DialogClose asChild>
          <button type="button" className="gz-btn pri" data-testid={`${testId}-apply`} onClick={() => onApply(value)}>{apply}</button>
        </DialogClose>
      </div>
    </DialogContent>
  )
}

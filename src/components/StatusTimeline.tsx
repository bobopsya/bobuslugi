import { useI18n } from '../lib/i18n'
import type { Application, ServiceRow } from '../lib/types'
import { cx } from './ui'

type Stage = 'submitted' | 'appointment' | 'review' | 'producing' | 'ready' | 'issued' | 'decision'

/** Этапы заявления и текущий этап. */
export function stages(app: Application, svc: ServiceRow | undefined): { list: Stage[]; current: number } {
  const ready = app.status === 'producing' && app.ready_at && new Date(app.ready_at) <= new Date()
  if (svc?.doc_type) {
    const list: Stage[] = svc.needs_exam
      ? ['submitted', 'appointment', 'review', 'producing', 'ready', 'issued']
      : ['submitted', 'review', 'producing', 'ready', 'issued']
    const at = (s: Stage) => list.indexOf(s)
    const current =
      app.status === 'issued' ? at('issued')
      : ready ? at('ready')
      : app.status === 'producing' ? at('producing')
      : app.status === 'appointment' ? at('appointment')
      : at('review')
    return { list, current }
  }
  const list: Stage[] = ['submitted', 'review', 'decision']
  return { list, current: app.status === 'approved' ? 2 : 1 }
}

export function isReady(app: Application) {
  return app.status === 'producing' && Boolean(app.ready_at) && new Date(app.ready_at!) <= new Date()
}

export function StatusTimeline({ app, svc }: { app: Application; svc: ServiceRow | undefined }) {
  const { t } = useI18n()
  if (app.status === 'rejected' || app.status === 'cancelled') return null
  const { list, current } = stages(app, svc)
  return (
    <ol className="flex flex-wrap items-center gap-y-3" data-testid="timeline">
      {list.map((s, i) => (
        <li key={s} className="flex items-center">
          <span
            className={cx(
              'grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black',
              i < current && 'bg-emerald-500 text-white',
              i === current && 'bg-brand-600 text-white ring-4 ring-brand-100',
              i > current && 'bg-slate-200 text-slate-500',
            )}
          >
            {i < current ? '✓' : i + 1}
          </span>
          <span className={cx('ml-2 whitespace-nowrap text-xs font-bold', i === current ? 'text-brand-700' : 'text-muted')}>{t(`docflow.stage.${s}`)}</span>
          {i < list.length - 1 && <span className="mx-3 h-0.5 w-6 bg-slate-200 sm:w-10" />}
        </li>
      ))}
    </ol>
  )
}

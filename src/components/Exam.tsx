import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { callRpc, errorText, useAction } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { supabase } from '../lib/supabase'
import type { ExamAttempt, ExamQuestion } from '../lib/types'
import { Alert, Button, cx, ErrorBox } from './ui'

type Started = { attempt_id: number; questions: ExamQuestion[] }
type Result = { score: number; total: number; passed: boolean; correct: boolean[] }

const VALID_DAYS = 30

/** Экзамен на знание лора и псянского языка. onPassed получает id сданной попытки. */
export function Exam({ onPassed }: { onPassed: (attemptId: number) => void }) {
  const { t, num, date } = useI18n()
  const { profile } = useAuth()
  const [exam, setExam] = useState<Started | null>(null)
  const [answers, setAnswers] = useState<number[]>([])
  const [result, setResult] = useState<Result | null>(null)

  // Последняя попытка: вдруг экзамен уже сдан или идёт пауза перед пересдачей
  const last = useQuery({
    queryKey: ['exam-last', profile?.id],
    enabled: Boolean(profile),
    queryFn: async () =>
      (
        await supabase
          .from('exam_attempts')
          .select('*')
          .eq('user_id', profile!.id)
          .not('finished_at', 'is', null)
          .order('finished_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ).data as ExamAttempt | null,
  })

  const start = useAction(
    () => callRpc<Started>('start_exam'),
    (r) => {
      setExam(r)
      setAnswers(new Array(r.questions.length).fill(0))
      setResult(null)
    },
  )
  const submit = useAction(
    () => callRpc<Result & { ok: true }>('submit_exam', { p_attempt: exam!.attempt_id, p_answers: answers }),
    (r) => {
      setResult(r)
      if (r.passed) onPassed(exam!.attempt_id)
    },
  )

  const validPass =
    last.data?.passed && last.data.finished_at && Date.now() - new Date(last.data.finished_at).getTime() < VALID_DAYS * 86400_000
  const cooldownUntil =
    last.data && last.data.passed === false && last.data.finished_at ? new Date(new Date(last.data.finished_at).getTime() + 3600_000) : null
  const inCooldown = cooldownUntil && cooldownUntil > new Date()

  if (!exam) {
    return (
      <div className="space-y-3">
        <p>{t('docflow.examIntro')}</p>
        {validPass && (
          <Alert tone="green">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>{t('docflow.examAlreadyPassed', { score: num(last.data!.score ?? 0) })}</span>
              <Button type="button" onClick={() => onPassed(last.data!.id)}>
                {t('docflow.useResult')}
              </Button>
            </div>
          </Alert>
        )}
        {inCooldown && <Alert tone="yellow">{t('docflow.examCooldown', { time: date(cooldownUntil!, true) })}</Alert>}
        <ErrorBox error={start.error} />
        <Button type="button" onClick={() => start.run()} loading={start.pending} disabled={Boolean(inCooldown)}>
          {t('docflow.startExam')}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {exam.questions.map((q, i) => (
        <fieldset key={q.id} className="rounded-xl bg-slate-50 p-4" data-testid="exam-question">
          <legend className="mb-2 font-bold">
            {i + 1}. {q.question}
          </legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {q.options.map((opt, j) => {
              const chosen = answers[i] === j + 1
              const verdict = result && chosen ? (result.correct[i] ? 'ring-emerald-500 bg-emerald-50' : 'ring-rose-500 bg-rose-50') : ''
              return (
                <label
                  key={j}
                  className={cx(
                    'flex cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 ring-1 ring-slate-200',
                    chosen && 'ring-2 ring-brand-500',
                    verdict,
                  )}
                >
                  <input
                    type="radio"
                    name={`q${q.id}`}
                    value={j + 1}
                    checked={chosen}
                    disabled={Boolean(result)}
                    onChange={() => setAnswers((a) => a.map((v, k) => (k === i ? j + 1 : v)))}
                  />
                  {opt}
                </label>
              )
            })}
          </div>
        </fieldset>
      ))}

      {result ? (
        <Alert tone={result.passed ? 'green' : 'red'}>
          <span data-testid="exam-result">
            {t(result.passed ? 'docflow.examPassed' : 'docflow.examFailed', { score: num(result.score), total: num(result.total) })}
          </span>
        </Alert>
      ) : (
        <>
          {submit.error ? <Alert tone="red">{errorText(submit.error, t)}</Alert> : null}
          <Button type="button" onClick={() => submit.run()} loading={submit.pending} disabled={answers.some((a) => a === 0)}>
            {t('docflow.finishExam')}
          </Button>
        </>
      )}
    </div>
  )
}

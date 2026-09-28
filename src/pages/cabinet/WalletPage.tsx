import { CabinetNav } from '../../components/CabinetNav'
import { Card, Empty, Loading, PageTitle } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { useI18n } from '../../lib/i18n'
import { useMyTransactions } from '../../lib/queries'
import { cx } from '../../components/ui'

export function WalletPage() {
  const { t, coins, date } = useI18n()
  const { profile } = useAuth()
  const { data, isLoading } = useMyTransactions()
  return (
    <>
      <PageTitle>{t('cabinet.wallet')}</PageTitle>
      <CabinetNav />
      <Card className="mb-6 bg-gradient-to-br from-brand-600 to-brand-900 text-white ring-0">
        <div className="text-sm uppercase tracking-wide text-white/70">{t('home.balance')}</div>
        <div className="mt-1 text-4xl font-black" data-testid="wallet-balance">
          {coins(profile?.balance ?? 0)}
        </div>
        <p className="mt-3 text-sm text-white/80">{t('cabinet.coinsInfo')}</p>
      </Card>
      {isLoading ? (
        <Loading />
      ) : data?.length ? (
        <div className="divide-y divide-slate-100 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200/70">
          {data.map((tx) => (
            <div key={tx.id} className="flex items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="font-bold">{t(`txType.${tx.type}`)}</div>
                <div className="truncate text-sm text-muted">
                  {date(tx.created_at, true)}
                  {tx.comment && ` · ${tx.type === 'fee' || tx.type === 'refund' ? t(`services.${tx.comment}.title`) : tx.comment}`}
                </div>
              </div>
              <div className="text-right">
                <div className={cx('font-black', tx.delta > 0 ? 'text-emerald-600' : 'text-accent-500')}>
                  {tx.delta > 0 ? '+' : ''}
                  {coins(tx.delta)}
                </div>
                <div className="text-xs text-muted">
                  {t('cabinet.balanceAfter')}: {coins(tx.balance_after)}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Empty>{t('cabinet.noTx')}</Empty>
      )}
    </>
  )
}

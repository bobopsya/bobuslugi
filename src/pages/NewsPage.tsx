import { Link, useNavigate, useParams } from 'react-router-dom'
import { NewsCard } from '../components/NewsCard'
import { Badge, Button, Card, Empty, ErrorBox, Loading, PageTitle } from '../components/ui'
import { callRpc, useAction } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useI18n } from '../lib/i18n'
import { useCountryName, useNews, useNewsItem, useProfileMap } from '../lib/queries'
import { NotFoundPage } from './MiscPages'

export function NewsPage() {
  const { t } = useI18n()
  const { data, isLoading } = useNews(100)
  return (
    <>
      <PageTitle>{t('news.title')}</PageTitle>
      {isLoading ? (
        <Loading />
      ) : data?.length ? (
        <div className="grid gap-3 md:grid-cols-2">
          {data.map((n) => (
            <NewsCard key={n.id} item={n} />
          ))}
        </div>
      ) : (
        <Empty>{t('news.empty')}</Empty>
      )}
    </>
  )
}

export function NewsItemPage() {
  const { id } = useParams()
  const { t, date, lang } = useI18n()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const { data: item, isLoading } = useNewsItem(Number(id))
  const countryName = useCountryName()
  const profileOf = useProfileMap()
  const del = useAction(() => callRpc('delete_news', { p_id: Number(id) }), () => navigate('/news'))

  if (isLoading) return <Loading />
  if (!item) return <NotFoundPage />
  const author = profileOf(item.author_id)
  const canDelete = profile && (profile.role === 'superadmin' || profile.id === item.author_id)

  return (
    <div className="mx-auto max-w-2xl">
      <Link to="/news" className="text-sm font-bold text-brand-700 hover:underline">
        ← {t('news.title')}
      </Link>
      <Card className="mt-3">
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge tone={item.kind === 'decree' ? 'red' : 'blue'}>{t(`newsKind.${item.kind}`)}</Badge>
          <span>{item.country_code ? countryName(item.country_code, lang === 'psy') : t('news.planetWide')}</span>
          <span>·</span>
          <span>{date(item.created_at, true)}</span>
        </div>
        <h1 className="text-2xl font-black sm:text-3xl">{item.title}</h1>
        <div className="mt-4 whitespace-pre-wrap leading-relaxed">{item.body}</div>
        {author && (
          <div className="mt-6 text-sm text-muted">
            {t('news.by')}: <span className="font-bold text-ink">{author.display_name}</span> · {t(`roles.${author.role}`)}
          </div>
        )}
        {canDelete && (
          <div className="mt-4">
            <ErrorBox error={del.error} />
            <Button variant="ghost" onClick={() => confirm(t('common.confirm')) && del.run()} loading={del.pending}>
              {t('common.delete')}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}

// Шаблоны официальных бумаг Бобуслуг в PDF.
import type { Content, TDocumentDefinitions } from 'pdfmake/interfaces'
import { orderedEntries } from '../services'
import { fileAsDataUrl } from '../storage'
import { mrz, seriesAndNumber } from '../translit'
import type { Application, Candidate, Country, DocumentRow, Election, Fine, Lawsuit, News, Profile, Transaction } from '../types'
import { downloadPdf, header, kv, seal, signatureBlock, styles, verifyFooter } from './core'

export type PdfCtx = {
  t: (k: string, p?: Record<string, string | number>) => string
  date: (d: string | Date | null | undefined, withTime?: boolean) => string
  coins: (n: number) => string
  num: (n: number) => string
  countryName: (code: string | null | undefined) => string
  profileOf: (id: string | null | undefined) => Profile | undefined
}

const PAGE: Partial<TDocumentDefinitions> = {
  pageSize: 'A4',
  pageMargins: [48, 48, 48, 48],
  defaultStyle: { font: 'Roboto', fontSize: 10, color: '#0f172a' },
  styles,
}

function fullName(d: Record<string, string | undefined> | null | undefined, fallback = '') {
  return [d?.last_name, d?.first_name, d?.patronymic].filter(Boolean).join(' ') || fallback
}

function agency(ctx: PdfCtx, country: string | null) {
  return country ? `ПсяМВД · ${ctx.countryName(country)}` : 'Администрация Асея'
}

function slug(s: string) {
  return s.replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_-]/gu, '')
}

// ---------------------------------------------------------------------
// Документы
// ---------------------------------------------------------------------

export async function documentPdf(ctx: PdfCtx, doc: DocumentRow, holder: Profile | undefined) {
  const d = doc.data ?? {}
  const [photo, holderSig, officialSig] = await Promise.all([
    fileAsDataUrl('photos', doc.photo_path),
    fileAsDataUrl('signatures', doc.holder_signature_path),
    fileAsDataUrl('signatures', ctx.profileOf(doc.issued_by)?.signature_path),
  ])
  const country = ctx.countryName(doc.country_code)
  const title = ctx.t(`docs.${doc.type}`)
  const { series, num } = seriesAndNumber(doc.number)
  const name = fullName(d, holder?.display_name)
  const isPassport = doc.type === 'passport' || doc.type === 'intl_passport'

  const photoCell: Content = photo
    ? { image: photo, width: 105, height: 140 }
    : { text: 'ФОТО', alignment: 'center', margin: [0, 60, 0, 60], color: '#94a3b8' }

  const personal = kv([
    [ctx.t('fields.last_name'), d.last_name ?? name],
    [ctx.t('fields.first_name'), d.first_name],
    [ctx.t('fields.patronymic'), d.patronymic],
    [ctx.t('fields.sex'), d.sex ? ctx.t(`docflow.sexShort.${d.sex}`) : undefined],
    [ctx.t('fields.birth_date'), d.birth_date ? ctx.date(d.birth_date) : undefined],
    [ctx.t('fields.birth_place'), d.birth_place],
    ...(d.category ? [[ctx.t('fields.category'), d.category] as [string, string]] : []),
    ...(d.purpose ? [[ctx.t('fields.purpose'), d.purpose] as [string, string]] : []),
    ...(d.city ? [[ctx.t('fields.city'), d.city] as [string, string]] : []),
    ...(['name', 'org_type', 'activity', 'kind', 'address', 'prop_type', 'area', 'brand', 'model', 'color'] as const)
      .filter((k) => d[k])
      .map((k) => [ctx.t(`fields.${k === 'kind' ? 'license_kind' : k}`), d[k]] as [string, string]),
  ])

  const [m1, m2] = mrz(doc)
  const content: Content[] = [
    header(country, doc.issuer ?? agency(ctx, doc.country_code)),
    { text: title.toUpperCase(), style: 'title' },
    { text: `${ctx.t('cabinet.docNumber')}: ${series} ${num}`, style: 'subtitle', color: '#be123c', bold: true },
    {
      table: {
        widths: ['*'],
        body: [
          [
            {
              fillColor: '#fff1f2',
              margin: [12, 12, 12, 12],
              stack: [
                kv([
                  [ctx.t('docflow.issuedBy'), doc.issuer ?? country],
                  [ctx.t('docflow.issueDate'), ctx.date(doc.issued_at)],
                  [ctx.t('docflow.divisionCode'), doc.division_code],
                  [ctx.t('cabinet.validUntil'), doc.valid_until ? ctx.date(doc.valid_until) : ctx.t('cabinet.forever')],
                ]),
                {
                  margin: [0, 8, 0, 0],
                  columns: [
                    { text: ctx.t('docflow.officialSignature'), style: 'label', width: 150 },
                    officialSig ? { image: officialSig, fit: [140, 40] } : { text: '' },
                    { image: seal(country), width: 70, opacity: 0.8 },
                  ],
                },
              ],
            },
          ],
          [
            {
              fillColor: '#fff1f2',
              margin: [12, 12, 12, 12],
              stack: [
                {
                  columns: [
                    { width: 115, stack: [photoCell, { text: ctx.t('docflow.holderSignature'), style: 'label', margin: [0, 6, 0, 2] }, holderSig ? { image: holderSig, fit: [105, 36] } : { text: '' }] },
                    { width: '*', stack: [personal] },
                  ],
                  columnGap: 14,
                },
                ...(isPassport
                  ? [{ margin: [0, 12, 0, 0], stack: [{ text: m1, style: 'mrz' }, { text: m2, style: 'mrz' }] } as Content]
                  : []),
              ],
            },
          ],
        ],
      },
      layout: { hLineColor: () => '#fda4af', vLineColor: () => '#fda4af' },
    },
    doc.revoked_at
      ? { text: `${ctx.t('cabinet.revoked').toUpperCase()}: ${doc.revoke_reason ?? ''}`, color: '#be123c', bold: true, margin: [0, 12, 0, 0] }
      : { text: '' },
    await verifyFooter(doc.number),
  ]
  await downloadPdf({ ...PAGE, info: { title: `${title} ${doc.number}` }, content }, `${slug(title)}_${slug(doc.number)}.pdf`)
}

// ---------------------------------------------------------------------
// Заявление и решение
// ---------------------------------------------------------------------

export async function applicationPdf(ctx: PdfCtx, app: Application) {
  const applicant = ctx.profileOf(app.user_id)
  const [photo, sig] = await Promise.all([fileAsDataUrl('photos', app.photo_path), fileAsDataUrl('signatures', app.signature_path)])
  const d = app.data ?? {}
  const service = ctx.t(`services.${app.service_code}.title`)
  const rows: [string, string | undefined][] = orderedEntries(app.service_code, d)
    .filter(([k]) => k !== 'oath')
    .map(([k, v]) => [ctx.t(`fields.${k}`) === `fields.${k}` ? k : ctx.t(`fields.${k}`), k === 'birth_date' ? ctx.date(v) : k === 'sex' ? ctx.t(`docflow.sex.${v}`) : v])
  if (d.oath === 'true') rows.push([ctx.t('docflow.step.oath'), ctx.t('docflow.oathAccept')])

  const content: Content[] = [
    header(ctx.countryName(app.target_country), agency(ctx, app.target_country)),
    { text: `ЗАЯВЛЕНИЕ № ${app.id}`, style: 'title' },
    { text: service, style: 'subtitle' },
    {
      columns: [
        { width: '*', stack: [kv([
          [ctx.t('gov.applicant'), applicant ? `${applicant.display_name} (@${applicant.login})` : '—'],
          [ctx.t('fields.target'), ctx.countryName(app.target_country)],
          [ctx.t('cabinet.submittedAt'), ctx.date(app.created_at, true)],
          [ctx.t('common.status'), ctx.t(`appStatus.${app.status}`)],
          [ctx.t('cabinet.fee'), app.fee > 0 ? ctx.coins(app.fee) : ctx.t('catalog.free')],
          ...rows,
        ])] },
        ...(photo ? [{ width: 110, image: photo, fit: [105, 140] } as Content] : []),
      ],
      columnGap: 16,
    },
    signatureBlock({
      role: ctx.t('docflow.applicantSignature'),
      name: fullName(d, applicant?.display_name),
      signature: sig,
      date: ctx.date(app.created_at),
    }),
  ]
  await downloadPdf({ ...PAGE, info: { title: `Заявление ${app.id}` }, content }, `Заявление_${app.id}.pdf`)
}

export async function decisionPdf(ctx: PdfCtx, app: Application) {
  const reviewer = ctx.profileOf(app.reviewer_id)
  const applicant = ctx.profileOf(app.user_id)
  const sig = await fileAsDataUrl('signatures', app.decision_signature_path)
  const service = ctx.t(`services.${app.service_code}.title`)
  const approved = app.status !== 'rejected'
  const country = ctx.countryName(app.target_country)
  const content: Content[] = [
    header(country, agency(ctx, app.target_country)),
    { text: `РЕШЕНИЕ № ${app.id}`, style: 'title' },
    { text: `по заявлению «${service}»`, style: 'subtitle' },
    {
      text: [
        'Рассмотрев заявление гражданина ',
        { text: fullName(app.data, applicant?.display_name), bold: true },
        `, поданное ${ctx.date(app.created_at)}, ${country} постановляет: `,
        { text: approved ? 'ЗАЯВЛЕНИЕ ОДОБРИТЬ.' : 'В УДОВЛЕТВОРЕНИИ ЗАЯВЛЕНИЯ ОТКАЗАТЬ.', bold: true, color: approved ? '#047857' : '#be123c' },
      ],
      lineHeight: 1.4,
    },
    app.reviewer_comment ? { margin: [0, 12, 0, 0], stack: [{ text: ctx.t('cabinet.reviewerComment'), style: 'label' }, { text: app.reviewer_comment }] } : { text: '' },
    signatureBlock({
      role: reviewer ? ctx.t(`roles.${reviewer.role}`) : ctx.t('roles.official'),
      name: reviewer?.display_name ?? '—',
      signature: sig,
      sealImage: seal(country),
      date: ctx.date(app.reviewed_at),
    }),
  ]
  await downloadPdf({ ...PAGE, info: { title: `Решение ${app.id}` }, content }, `Решение_${app.id}.pdf`)
}

// ---------------------------------------------------------------------
// Деньги
// ---------------------------------------------------------------------

export async function finePdf(ctx: PdfCtx, fine: Fine) {
  const user = ctx.profileOf(fine.user_id)
  const issuer = ctx.profileOf(fine.issued_by)
  const sig = await fileAsDataUrl('signatures', issuer?.signature_path)
  const country = fine.country_code ? ctx.countryName(fine.country_code) : 'Асей'
  const content: Content[] = [
    header(country, agency(ctx, fine.country_code)),
    { text: `ПОСТАНОВЛЕНИЕ № ${fine.id}`, style: 'title' },
    { text: fine.kind === 'tax' ? 'о начислении налога' : 'о наложении штрафа', style: 'subtitle' },
    kv([
      [ctx.t('common.user'), user ? `${user.display_name} (@${user.login})` : '—'],
      [ctx.t('common.status'), ctx.t(`fineKind.${fine.kind}`)],
      [ctx.t('common.reason'), fine.reason],
      [ctx.t('common.amount'), ctx.coins(fine.amount)],
      [ctx.t('common.date'), ctx.date(fine.created_at, true)],
      [ctx.t('common.status'), ctx.t(`fineStatus.${fine.status}`)],
      ...(fine.paid_at ? [[ctx.t('cabinet.paid'), ctx.date(fine.paid_at, true)] as [string, string]] : []),
    ]),
    signatureBlock({
      role: issuer ? ctx.t(`roles.${issuer.role}`) : 'Автоматическая система контроля',
      name: issuer?.display_name ?? 'Бобуслуги',
      signature: sig,
      sealImage: seal(country),
      date: ctx.date(fine.created_at),
    }),
  ]
  await downloadPdf({ ...PAGE, info: { title: `Постановление ${fine.id}` }, content }, `Постановление_${fine.id}.pdf`)
}

export async function receiptPdf(ctx: PdfCtx, tx: Transaction) {
  const user = ctx.profileOf(tx.user_id)
  const content: Content[] = [
    header('Бобобанк', 'Казначейство Бобосоюза'),
    { text: `КВИТАНЦИЯ № ${tx.id}`, style: 'title' },
    { text: ctx.t(`txType.${tx.type}`), style: 'subtitle' },
    kv([
      [ctx.t('common.user'), user ? `${user.display_name} (@${user.login})` : '—'],
      [ctx.t('common.amount'), ctx.coins(Math.abs(tx.delta))],
      [ctx.t('common.comment'), tx.type === 'fee' || tx.type === 'refund' ? ctx.t(`services.${tx.comment}.title`) : tx.comment],
      [ctx.t('common.date'), ctx.date(tx.created_at, true)],
      [ctx.t('cabinet.balanceAfter'), ctx.coins(tx.balance_after)],
    ]),
    signatureBlock({ role: 'Бобобанк', name: 'Операция проведена', signature: null, sealImage: seal('Бобобанк', 'Казначейство'), date: ctx.date(tx.created_at) }),
  ]
  await downloadPdf({ ...PAGE, info: { title: `Квитанция ${tx.id}` }, content }, `Квитанция_${tx.id}.pdf`)
}

export async function statementPdf(ctx: PdfCtx, profile: Profile, txs: Transaction[]) {
  const content: Content[] = [
    header('Бобобанк', 'Казначейство Бобосоюза'),
    { text: 'ВЫПИСКА ПО СЧЁТУ', style: 'title' },
    { text: `${profile.display_name} (@${profile.login}) · ${ctx.t('home.balance')}: ${ctx.coins(profile.balance)}`, style: 'subtitle' },
    {
      table: {
        headerRows: 1,
        widths: [90, '*', 80, 80],
        body: [
          [ctx.t('common.date'), ctx.t('common.comment'), ctx.t('common.amount'), ctx.t('cabinet.balanceAfter')].map((h) => ({ text: h, style: 'label' })),
          ...txs.map((tx) => [
            ctx.date(tx.created_at, true),
            `${ctx.t(`txType.${tx.type}`)}${tx.comment ? ` · ${tx.type === 'fee' || tx.type === 'refund' ? ctx.t(`services.${tx.comment}.title`) : tx.comment}` : ''}`,
            { text: `${tx.delta > 0 ? '+' : ''}${ctx.coins(tx.delta)}`, color: tx.delta > 0 ? '#047857' : '#be123c' },
            ctx.coins(tx.balance_after),
          ]),
        ],
      },
      layout: 'lightHorizontalLines',
    },
    signatureBlock({ role: 'Бобобанк', name: 'Выписка сформирована автоматически', signature: null, sealImage: seal('Бобобанк', 'Казначейство'), date: ctx.date(new Date()) }),
  ]
  await downloadPdf({ ...PAGE, info: { title: 'Выписка' }, content }, `Выписка_${profile.login}.pdf`)
}

// ---------------------------------------------------------------------
// Указы, выборы, справки
// ---------------------------------------------------------------------

export async function decreePdf(ctx: PdfCtx, item: News) {
  const author = ctx.profileOf(item.author_id)
  const sig = await fileAsDataUrl('signatures', author?.signature_path)
  const country = item.country_code ? ctx.countryName(item.country_code) : 'Асей'
  const kind = item.kind === 'decree' ? 'УКАЗ' : 'СООБЩЕНИЕ'
  const content: Content[] = [
    header(country, item.kind === 'decree' ? `Президент · ${country}` : 'Пресс-служба'),
    { text: `${kind} № ${item.id}`, style: 'title' },
    { text: item.title, style: 'subtitle', bold: true, color: '#0f172a' },
    { text: item.body, lineHeight: 1.4 },
    signatureBlock({
      role: author ? ctx.t(`roles.${author.role}`) : '—',
      name: author?.display_name ?? '—',
      signature: sig,
      sealImage: seal(country, item.kind === 'decree' ? 'Администрация президента' : 'Пресс-служба'),
      date: ctx.date(item.created_at),
    }),
  ]
  await downloadPdf({ ...PAGE, info: { title: `${kind} ${item.id}` }, content }, `${kind === 'УКАЗ' ? 'Указ' : 'Новость'}_${item.id}.pdf`)
}

export async function electionProtocolPdf(
  ctx: PdfCtx,
  election: Election,
  candidates: Candidate[],
  results: { candidate_id: number; votes: number }[],
  turnout: number,
) {
  const author = ctx.profileOf(election.created_by)
  const sig = await fileAsDataUrl('signatures', author?.signature_path)
  const country = ctx.countryName(election.country_code)
  const votesOf = (id: number) => Number(results.find((r) => r.candidate_id === id)?.votes ?? 0)
  const sorted = [...candidates].sort((a, b) => votesOf(b.id) - votesOf(a.id))
  const content: Content[] = [
    header(country, 'Избирательная комиссия'),
    { text: 'ПРОТОКОЛ', style: 'title' },
    { text: `об итогах голосования «${election.title}»`, style: 'subtitle' },
    kv([
      [ctx.t('common.date'), ctx.date(election.closed_at ?? election.created_at)],
      [ctx.t('elections.turnout', { count: '' }).replace(/:?\s*$/, ''), ctx.num(turnout)],
    ]),
    {
      margin: [0, 12, 0, 0],
      table: {
        headerRows: 1,
        widths: ['*', 80],
        body: [
          [{ text: 'Кандидат', style: 'label' }, { text: 'Голосов', style: 'label' }],
          ...sorted.map((c, i) => [{ text: c.name, bold: i === 0 }, ctx.num(votesOf(c.id))]),
        ],
      },
      layout: 'lightHorizontalLines',
    },
    sorted[0] ? { margin: [0, 12, 0, 0], text: [`${ctx.t('elections.winner')}: `, { text: sorted[0].name, bold: true }] } : { text: '' },
    signatureBlock({
      role: 'Председатель комиссии',
      name: author?.display_name ?? '—',
      signature: sig,
      sealImage: seal(country, 'Избирком'),
      date: ctx.date(election.closed_at),
    }),
  ]
  await downloadPdf({ ...PAGE, info: { title: `Протокол ${election.id}` }, content }, `Протокол_выборов_${election.id}.pdf`)
}

export async function certificatePdf(
  ctx: PdfCtx,
  kind: 'citizenship' | 'no_debt',
  profile: Profile,
  passport: DocumentRow | undefined,
  unpaidTotal: number,
) {
  const country = profile.country_code ? ctx.countryName(profile.country_code) : 'Асей'
  const name = fullName(passport?.data, profile.display_name)
  const body: Content =
    kind === 'citizenship'
      ? profile.country_code
        ? { text: [`Настоящая справка выдана `, { text: name, bold: true }, ` в том, что он(а) является гражданином(кой) государства `, { text: country, bold: true }, passport ? `. Бобопаспорт № ${passport.number}, выдан ${ctx.date(passport.issued_at)}.` : '.'], lineHeight: 1.5 }
        : { text: [`Настоящая справка выдана `, { text: name, bold: true }, ` в том, что он(а) не имеет гражданства ни одной из стран Асея.`], lineHeight: 1.5 }
      : unpaidTotal > 0
        ? { text: [`Настоящая справка выдана `, { text: name, bold: true }, ` в том, что за ним(ней) числится задолженность по штрафам и налогам в размере `, { text: ctx.coins(unpaidTotal), bold: true, color: '#be123c' }, '.'], lineHeight: 1.5 }
        : { text: [`Настоящая справка выдана `, { text: name, bold: true }, ` в том, что задолженности по штрафам и налогам не имеется.`], lineHeight: 1.5 }
  const content: Content[] = [
    header(country, agency(ctx, profile.country_code)),
    { text: 'СПРАВКА', style: 'title' },
    { text: kind === 'citizenship' ? 'о гражданстве' : 'об отсутствии (наличии) задолженности', style: 'subtitle' },
    body,
    { text: 'Справка дана для предъявления по месту требования.', margin: [0, 12, 0, 0], style: 'small' },
    signatureBlock({ role: 'Бобуслуги', name: 'Сформировано автоматически', signature: null, sealImage: seal(country), date: ctx.date(new Date()) }),
    await verifyFooter(passport?.number ?? null),
  ]
  await downloadPdf(
    { ...PAGE, info: { title: 'Справка' }, content },
    `Справка_${kind === 'citizenship' ? 'о_гражданстве' : 'о_задолженности'}_${profile.login}.pdf`,
  )
}

// ---------------------------------------------------------------------
// Казна и суд
// ---------------------------------------------------------------------

export async function payrollPdf(ctx: PdfCtx, country: Country, staff: Profile[]) {
  const total = staff.reduce((sum, p) => sum + p.salary, 0)
  const content: Content[] = [
    header(country.name, 'Казначейство'),
    { text: 'ПЛАТЁЖНАЯ ВЕДОМОСТЬ', style: 'title' },
    { text: `на выплату заработной платы госслужащим · ${ctx.date(new Date())}`, style: 'subtitle' },
    {
      table: {
        headerRows: 1,
        widths: [20, '*', 110, 90],
        body: [
          ['№', 'Госслужащий', 'Должность', 'Сумма'].map((h) => ({ text: h, style: 'label' })),
          ...staff.map((p, i) => [String(i + 1), p.display_name, ctx.t(`roles.${p.role}`), ctx.coins(p.salary)]),
          [{ text: 'Итого', colSpan: 3, bold: true }, '', '', { text: ctx.coins(total), bold: true }],
        ],
      },
      layout: 'lightHorizontalLines',
    },
    signatureBlock({
      role: 'Президент',
      name: staff.find((p) => p.role === 'president')?.display_name ?? '—',
      signature: await fileAsDataUrl('signatures', staff.find((p) => p.role === 'president')?.signature_path),
      sealImage: seal(country.name, 'Казначейство'),
      date: ctx.date(new Date()),
    }),
  ]
  await downloadPdf({ ...PAGE, info: { title: 'Ведомость' }, content }, `Vedomost_${country.code}.pdf`)
}

export async function lawsuitPdf(ctx: PdfCtx, suit: Lawsuit) {
  const plaintiff = ctx.profileOf(suit.plaintiff_id)
  const defendant = ctx.profileOf(suit.defendant_id)
  const content: Content[] = [
    header(ctx.countryName(suit.country_code), 'Суд'),
    { text: 'ИСКОВОЕ ЗАЯВЛЕНИЕ', style: 'title' },
    { text: `Дело № ${suit.id}`, style: 'subtitle' },
    kv([
      ['Истец', plaintiff ? `${plaintiff.display_name} (@${plaintiff.login})` : '—'],
      ['Ответчик', defendant ? `${defendant.display_name} (@${defendant.login})` : '—'],
      ['Цена иска', ctx.coins(suit.amount)],
      [ctx.t('cabinet.submittedAt'), ctx.date(suit.created_at, true)],
    ]),
    { margin: [0, 14, 0, 4], text: 'Суть требований', style: 'label' },
    { text: suit.claim, lineHeight: 1.4 },
    ...(suit.defense ? [{ margin: [0, 14, 0, 4], text: 'Возражения ответчика', style: 'label' } as Content, { text: suit.defense, lineHeight: 1.4 } as Content] : []),
    signatureBlock({ role: 'Истец', name: plaintiff?.display_name ?? '—', signature: null, date: ctx.date(suit.created_at) }),
  ]
  await downloadPdf({ ...PAGE, info: { title: `Иск ${suit.id}` }, content }, `Isk_${suit.id}.pdf`)
}

export async function courtDecisionPdf(ctx: PdfCtx, suit: Lawsuit) {
  const plaintiff = ctx.profileOf(suit.plaintiff_id)
  const defendant = ctx.profileOf(suit.defendant_id)
  const judge = ctx.profileOf(suit.judge_id)
  const sig = await fileAsDataUrl('signatures', suit.judge_signature_path)
  const country = ctx.countryName(suit.country_code)
  const satisfied = (suit.awarded ?? 0) > 0
  const content: Content[] = [
    header(country, 'Суд'),
    { text: `РЕШЕНИЕ СУДА № ${suit.id}`, style: 'title' },
    { text: `Именем ${country}`, style: 'subtitle' },
    {
      text: [
        'Рассмотрев иск ',
        { text: plaintiff?.display_name ?? '—', bold: true },
        ' к ',
        { text: defendant?.display_name ?? '—', bold: true },
        ` на сумму ${ctx.coins(suit.amount)}, суд постановил: `,
        satisfied
          ? { text: `ИСК УДОВЛЕТВОРИТЬ, взыскать ${ctx.coins(suit.awarded ?? 0)}.`, bold: true, color: '#047857' }
          : { text: 'В УДОВЛЕТВОРЕНИИ ИСКА ОТКАЗАТЬ.', bold: true, color: '#be123c' },
      ],
      lineHeight: 1.4,
    },
    { margin: [0, 14, 0, 4], text: 'Мотивировка', style: 'label' },
    { text: suit.verdict ?? '', lineHeight: 1.4 },
    signatureBlock({
      role: 'Судья',
      name: judge?.display_name ?? '—',
      signature: sig,
      sealImage: seal(country, 'Суд'),
      date: ctx.date(suit.decided_at),
    }),
  ]
  await downloadPdf({ ...PAGE, info: { title: `Решение суда ${suit.id}` }, content }, `Reshenie_suda_${suit.id}.pdf`)
}

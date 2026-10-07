import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { brandCode, codeOf, defaultCfg, handle, learnPackSize, makeBarcode, parseSum, postCaption, refreshPosts, splitPhones, tgAuth, verifyInitData, soldCaption, tashkentStamp } from './index'
import * as site from '../../../src/lib/codes'

// ---------- Soxta Supabase (PostgREST) va Telegram ----------

type Row = Record<string, any>
let tables: Record<string, Row[]>
let counters: Record<string, number>
let sent: { method: string; body: any }[]
let msgId = 100

const ENV: Record<string, string> = {
  SUPABASE_URL: 'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'svc', BOT_TOKEN: 'T',
  ADMIN_IDS: '7', CHANNEL_ID: '-100', SOLD_CHANNEL_ID: '-200', WEBHOOK_SECRET: 's3',
}

function match(row: Row, key: string, cond: string): boolean {
  const [op, ...rest] = cond.split('.')
  const v = decodeURIComponent(rest.join('.'))
  const field = key.includes('->>') ? row[key.split('->>')[0]]?.[key.split('->>')[1]] : row[key]
  if (op === 'eq') return String(field) === v
  if (op === 'is' && v === 'null') return field == null
  if (op === 'in') return v.slice(1, -1).split(',').map((x) => x.replace(/"/g, '')).includes(String(field))
  if (op === 'ilike') {
    const re = new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$', 'i')
    return re.test(String(field))
  }
  if (op === 'cs') {
    const want = JSON.parse(v)
    return want.lines.every((w: Row) => field.lines.some((l: Row) => l.productId === w.productId))
  }
  throw new Error('op ' + op)
}

let users: Row[]

/** Soxta Supabase Auth (admin API). */
function fakeAuth(path: string, method: string, body: any): Response {
  const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status })
  if (path === 'admin/users' && method === 'GET') return json({ users })
  if (path === 'admin/users' && method === 'POST') {
    if (users.some((u) => u.email === body.email)) return json({ msg: 'A user with this email address has already been registered' }, 422)
    const u = { id: crypto.randomUUID(), email: body.email, password: body.password, created_at: new Date().toISOString(), last_sign_in_at: null }
    users.push(u)
    return json(u)
  }
  if (path === 'admin/generate_link') {
    const u = users.find((x) => x.email === body.email)
    return u ? json({ id: u.id, hashed_token: 'th_' + u.id }) : json({ msg: 'User not found' }, 404)
  }
  const id = path.split('/')[2]
  const u = users.find((x) => x.id === id)
  if (!u) return json({ msg: 'User not found' }, 404)
  if (method === 'GET') return json(u)
  if (method === 'PUT') { Object.assign(u, body); return json(u) }
  if (method === 'DELETE') {
    users = users.filter((x) => x !== u)
    tables.staff = (tables.staff ?? []).filter((r) => r.user_id !== id)
    return json({})
  }
  throw new Error('auth ' + method + ' ' + path)
}

async function fakeFetch(input: any, init: any = {}) {
  const url = new URL(String(input))
  const body = init.body ? JSON.parse(init.body) : undefined
  if (url.pathname.startsWith('/auth/v1/')) return fakeAuth(url.pathname.slice(9), init.method ?? 'GET', body)
  if (url.host === 'api.telegram.org') {
    const method = url.pathname.split('/').pop()!
    sent.push({ method, body })
    const result = method === 'sendPhoto' ? { message_id: ++msgId, photo: [{ file_id: body.photo + '_ch' }] }
      : method === 'copyMessage' ? { message_id: ++msgId }
      : method === 'getMe' ? { username: 'test_bot' } : true
    return new Response(JSON.stringify({ ok: true, result }))
  }
  const path = url.pathname.replace('/rest/v1/', '')
  if (path === 'rpc/take_seq') {
    counters[body.p_name] = (counters[body.p_name] ?? 0) + body.p_count
    return new Response(JSON.stringify(counters[body.p_name]))
  }
  const t = (tables[path] ??= [])
  const filters = [...url.searchParams].filter(([k]) => !['select', 'order', 'limit', 'on_conflict'].includes(k))
  const sel = () => t.filter((r) => filters.every(([k, c]) => match(r, k, c)))
  const prefer = (init.headers?.Prefer ?? '') as string
  const method = init.method ?? 'GET'
  if (method === 'GET') return new Response(JSON.stringify(sel()))
  if (method === 'DELETE') { const keep = t.filter((r) => !sel().includes(r)); tables[path] = keep; return new Response('') }
  if (method === 'PATCH') { const rows = sel(); rows.forEach((r) => Object.assign(r, body)); return new Response(prefer.includes('representation') ? JSON.stringify(rows) : '') }
  // POST
  const pk = path === 'bot_sessions' ? 'chat_id' : path === 'staff' ? 'user_id' : 'id'
  const list = Array.isArray(body) ? body : [body]
  const out: Row[] = []
  for (const r of list) {
    if (path === 'bot_photos' || path === 'channel_posts') r.id = (t.length + 1) + Math.random()
    const ex = t.find((x) => x[pk] === r[pk])
    if (ex) {
      if (prefer.includes('ignore-duplicates')) continue
      if (prefer.includes('merge-duplicates')) { Object.assign(ex, r); out.push(ex); continue }
      return new Response('dup', { status: 409 })
    }
    t.push({ archived_at: null, ...r }); out.push(r)
  }
  return new Response(prefer.includes('representation') ? JSON.stringify(out) : '')
}

const tgReq = (update: object) => new Request('https://x.supabase.co/functions/v1/bot', {
  method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 's3' }, body: JSON.stringify(update),
})
const photo = (fid: string, group = 'g1') => tgReq({ message: { chat: { id: 7 }, from: { id: 7 }, photo: [{ file_id: fid }], media_group_id: group } })
const text = (t: string, from = 7) => tgReq({ message: { message_id: 55, chat: { id: from }, from: { id: from }, text: t } })
const press = (data: string) => tgReq({ callback_query: { id: 'q', from: { id: 7 }, data, message: { chat: { id: 7 }, message_id: 1 } } })
const lastMarkup = () => [...sent].reverse().find((x) => x.method === 'sendMessage')?.body.reply_markup
const lastText = () => [...sent].reverse().find((x) => x.method === 'sendMessage')?.body.text as string

beforeEach(() => {
  tables = { brands: [{ id: 'velton', data: 'Velton' }], settings: [{ id: 'main', data: { shopPhone: '+998 90 000 00 00' } }], products: [], sales: [], staff: [] }
  counters = { product: 40, 'brand:velton': 20, batch: 3 }
  sent = []
  users = []
  vi.stubGlobal('fetch', fakeFetch)
  vi.stubGlobal('Deno', { env: { get: (k: string) => ENV[k] } })
})
afterEach(() => vi.unstubAllGlobals())

describe('yordamchilar', () => {
  it('kod va shtrix-kod saytdagi bilan bir xil', () => {
    expect(brandCode(21)).toBe('A21')
    expect(brandCode(201)).toBe('B1')
    for (const n of [1, 12, 999, 123456]) expect(makeBarcode(n)).toBe(site.makeBarcode(n))
    for (const n of [1, 200, 201, 5201]) expect(brandCode(n)).toBe(site.brandCode(n))
    expect(codeOf("qo'shma A21")).toBe('A21')
  })
  it('narxni turli yozilishda tushunadi', () => {
    expect(parseSum('220 000')).toBe(220000)
    expect(parseSum('220.000')).toBe(220000)
    expect(parseSum('220k')).toBe(220000)
    expect(parseSum('220 ming')).toBe(220000)
    expect(parseSum('abc')).toBeNull()
  })
  it('post matnida kelish narxi yo\'q', () => {
    const c = postCaption({ brand: 'Velton', model: "qo'shma", size: '39-43', color: 'qora', packSize: 5, cost: 200000, price: 220000 }, 'A21', { shopPhone: '+998' })
    expect(c).toContain('220 000')
    expect(c).not.toContain('200 000')
    expect(c).toContain('A21')
  })
  it('Toshkent vaqti va kun nomi', () => {
    expect(tashkentStamp('2026-10-05T09:30:00.000Z')).toBe('Dushanba, 05.10.2026 14:30')
  })
  it('sotilgan yozuvida sana, narx, chek', () => {
    const t = soldCaption('👟 <b>Velton</b>\n📞 tel', { at: '2026-10-05T09:30:00.000Z', price: 220000, pairs: 5, saleNumber: 12, customer: 'Ali' }, 1)
    expect(t).toContain('SOTILDI')
    expect(t).toContain('1 100 000')
    expect(t).toContain('Chek №12')
    expect(t).not.toContain('📞')
  })
})

describe('sozlamalar', () => {
  it("pachka soni: qo'lda 4 marta kiritilgani tugmaga chiqadi, tugmalar 3 ta qoladi", () => {
    let c = defaultCfg
    for (let i = 0; i < 3; i++) c = learnPackSize(c, 5)
    for (let i = 0; i < 3; i++) c = learnPackSize(c, 4)
    expect(c.packSizes).toEqual([5, 6, 3])
    c = learnPackSize(c, 4)
    expect(c.packSizes).toHaveLength(3)
    expect(c.packSizes).toContain(4)
    expect(c.packSizes).toContain(5)
  })
  it('narx yashirilsa postda narx yo\'q', () => {
    const c = postCaption({ brand: 'B', model: 'm', size: '', color: '', packSize: 5, cost: 1, price: 220000 }, 'A1', {}, 1, 1, false)
    expect(c).not.toContain('220 000')
  })
  it("/start — menyu; Yuk qo'shish; sozlamalardan razmer, rang, telefon, narx", async () => {
    await handle(text('/start'))
    expect(lastMarkup().keyboard[0][0].text).toBe("📦 Yuk qo'shish")
    expect(tables.bot_sessions ?? []).toHaveLength(0) // /start kirim boshlamaydi

    await handle(text('⚙️ Sozlamalar'))
    expect(lastText()).toContain('44-45-46')
    expect(lastText()).toContain('zamish')
    await handle(press('set:sizes'))
    await handle(text('39-43, 40-44, 44-45-46'))
    await handle(press('set:colors'))
    await handle(text('qora, karesh, zamish'))
    await handle(press('set:phone'))
    await handle(text('+998 90 111 22 33'))
    await handle(press('set:price'))
    expect(lastText()).toContain("ko'rsatilmaydi")
    const cfg = tables.settings.find((r) => r.id === 'bot')!.data
    expect(cfg.sizes).toEqual(['39-43', '40-44', '44-45-46'])
    expect(cfg.colors).toEqual(['qora', 'karesh', 'zamish'])
    expect(cfg.phone).toBe('+998 90 111 22 33')
    expect(cfg.showPrice).toBe(false)

    // Kirim: sozlamadagi tugmalar va qo'lda kiritish
    await handle(text("📦 Yuk qo'shish"))
    await handle(photo('p1'))
    await handle(photo('p2'))
    await handle(press('photos_done'))
    await handle(press('brand:Velton'))
    await handle(text('klassik'))
    expect(lastMarkup().inline_keyboard.flat().map((x: any) => x.text)).toEqual(['39-43', '40-44', '44-45-46', "✍️ Qo'lda kiritish", '❌ Bekor qilish'])
    await handle(press('manual:size'))
    expect(lastText()).toContain('Razmerni yozing')
    await handle(text('38-42'))
    expect(lastMarkup().inline_keyboard[0].map((x: any) => x.text)).toEqual(['qora', 'karesh', 'zamish'])
    await handle(press('color:karesh'))
    await handle(press('packSize:6'))
    await handle(text('150000'))
    await handle(text('170000'))
    await handle(press('ok'))
    const post = sent.find((x) => x.method === 'sendPhoto')!.body.caption
    expect(post).toContain('38-42')
    expect(post).toContain('karesh')
    expect(post).toContain('+998 90 111 22 33')
    expect(post).not.toContain('170 000')
    expect(tables.products).toHaveLength(2)
  })
})

describe('bir nechta telefon va postlarni yangilash', () => {
  it("telefonlar alohida qatorda; sozlama o'zgarsa eski postlar yangilanadi", async () => {
    expect(splitPhones('+998 90 1, +998 91 2;\n+998 93 3')).toEqual(['+998 90 1', '+998 91 2', '+998 93 3'])
    tables.settings[0].data.shopPhone = '+998 90 000 00 00, +998 91 000 00 00'
    await handle(text("📦 Yuk qo'shish"))
    await handle(photo('p1'))
    await handle(photo('p2'))
    await handle(press('photos_done'))
    await handle(press('brand:Velton'))
    await handle(text('klassik'))
    await handle(press('size:39-43'))
    await handle(press('color:qora'))
    await handle(press('packSize:6'))
    await handle(text('150000'))
    await handle(text('170000'))
    await handle(press('ok'))
    const first = sent.find((x) => x.method === 'sendPhoto')!.body.caption as string
    expect(first).toContain('📞 +998 90 000 00 00\n📞 +998 91 000 00 00')

    expect(await refreshPosts(90, 0)).toEqual({ edited: 0, same: 2, left: 0 })
    await handle(press('set:phone'))
    await handle(text('+998 99 777 77 77, +998 88 666 66 66'))
    await handle(press('set:price'))
    sent = []
    expect(await refreshPosts(1, 0)).toEqual({ edited: 1, same: 0, left: 1 })
    expect(await refreshPosts(90, 0)).toEqual({ edited: 1, same: 1, left: 0 })
    const edits = sent.filter((x) => x.method === 'editMessageCaption')
    expect(edits).toHaveLength(2)
    expect(edits[0].body.caption).toContain('📞 +998 99 777 77 77\n📞 +998 88 666 66 66')
    expect(edits[0].body.caption).not.toContain('170 000')
    expect(edits[0].body.caption).toContain('klassik')
    expect(edits[0].body.caption).toMatch(/Kod: <b>A\d+<\/b>/)
  })
})

describe('bot oqimi', () => {
  it('rasmlar → savollar → tasdiq → saytga va kanalga; sotilganda arxivga', async () => {
    // Albom: 3 ta rasm bir vaqtda
    await Promise.all([handle(photo('f1')), handle(photo('f2')), handle(photo('f3'))])
    expect(sent.filter((x) => x.method === 'sendMessage')).toHaveLength(1) // faqat bitta javob
    await handle(press('photos_done'))
    expect(lastText()).toContain('Brend')
    await handle(press('brand:Velton'))
    await handle(text("qo'shma"))
    await handle(press('size:39-43'))
    await handle(press('color:qora'))
    await handle(press('packSize:5'))
    await handle(text('200 000'))
    await handle(text('220000'))
    expect(lastText()).toContain('3 pachka')
    await handle(press('ok'))
    await handle(press('ok')) // ikkinchi bosish — e'tiborsiz

    expect(tables.products).toHaveLength(3)
    expect(tables.products.map((p) => p.name)).toEqual(["qo'shma A21", "qo'shma A22", "qo'shma A23"])
    expect(tables.products[0].barcode).toBe(makeBarcode(41))
    expect(tables.batches).toHaveLength(1)
    expect(tables.batches[0].data.number).toBe(4)
    const posts = sent.filter((x) => x.method === 'sendPhoto')
    expect(posts).toHaveLength(3)
    expect(posts[0].body.chat_id).toBe(-100)
    expect(posts[0].body.caption).not.toContain('200 000')
    expect(tables.channel_posts).toHaveLength(3)
    expect(lastText()).toContain('Kirim №4')
    expect(tables.bot_sessions).toHaveLength(0)

    // Saytda bittasi sotildi
    const sold = tables.products[1]
    sold.stock = 0
    tables.sales.push({ id: 's1', data: { createdAt: '2026-10-05T09:30:00.000Z', number: 12, customerName: 'Ali', lines: [{ productId: sold.id, price: 220000, pairs: 5, total: 1100000 }] } })
    tables.staff.push({ user_id: 'u1' })
    vi.stubGlobal('fetch', async (input: any, init: any) => {
      if (String(input).includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }))
      return fakeFetch(input, init)
    })
    sent = []
    const res = await handle(new Request('https://x.supabase.co/functions/v1/bot', { method: 'POST', headers: { Authorization: 'Bearer jwt' }, body: '{}' }))
    expect(await res.json()).toEqual({ archived: 1, updated: 0 })
    const copy = sent.find((x) => x.method === 'copyMessage')!
    expect(copy.body.chat_id).toBe(-200)
    expect(copy.body.caption).toContain('Dushanba, 05.10.2026 14:30')
    expect(copy.body.caption).toContain('Chek №12')
    expect(sent.some((x) => x.method === 'deleteMessage')).toBe(true)
    expect(tables.channel_posts.filter((p) => p.archived_at)).toHaveLength(1)
  })

  it('bitta rasm — nechta pachka so\'raydi, post qoldiqni yangilaydi', async () => {
    await handle(photo('one', 'g2'))
    await handle(press('photos_done'))
    expect(lastText()).toContain('nechta pachka')
    await handle(press('packs:3'))
    await handle(press('brand_new'))
    await handle(text('Ezel'))
    await handle(text('klassik'))
    await handle(text('40-44'))
    await handle(press('color:'))
    await handle(text('5'))
    await handle(text('90000'))
    await handle(text('110 ming'))
    await handle(press('ok'))
    expect(tables.products).toHaveLength(3)
    expect(tables.products.map((p) => p.name)).toEqual(['klassik A1', 'klassik A2', 'klassik A3'])
    expect(tables.channel_posts).toHaveLength(1)
    expect(tables.channel_posts[0].caption).toContain('Mavjud: 3 pachka')
    expect(tables.brands.some((x) => x.data === 'Ezel')).toBe(true)

    tables.products[0].stock = 0
    tables.staff.push({ user_id: 'u1' })
    vi.stubGlobal('fetch', async (input: any, init: any) => String(input).includes('/auth/v1/user') ? new Response(JSON.stringify({ id: 'u1' })) : fakeFetch(input, init))
    sent = []
    const r = await handle(new Request('https://x.supabase.co/functions/v1/bot', { method: 'POST', headers: { Authorization: 'Bearer jwt' }, body: '{}' }))
    expect(await r.json()).toEqual({ archived: 0, updated: 1 })
    expect(sent.find((x) => x.method === 'editMessageCaption')!.body.caption).toContain('Mavjud: 2 pachka')
  })

  it('begona foydalanuvchi ishlata olmaydi, noto\'g\'ri kalit rad etiladi', async () => {
    await handle(tgReq({ message: { chat: { id: 99 }, from: { id: 99 }, text: '/start' } }))
    expect(lastText()).toContain('<code>99</code>')
    const bad = await handle(new Request('https://x/functions/v1/bot', { method: 'POST', headers: { 'X-Telegram-Bot-Api-Secret-Token': 'xx' }, body: '{}' }))
    expect(bad.status).toBe(403)
    const site = await handle(new Request('https://x/functions/v1/bot', { method: 'POST', body: '{}' }))
    expect(site.status).toBe(403)
  })
})

// ---------- Loginlar va Boss panel ----------

import { createHmac } from 'node:crypto'

/** Telegram mini app imzosi (Telegram o'zi shunday imzolaydi). */
function signInit(user: object, token = ENV.BOT_TOKEN, authDate = Math.floor(Date.now() / 1000)) {
  const p = new URLSearchParams({ auth_date: String(authDate), query_id: 'Q1', user: JSON.stringify(user) })
  const check = [...p].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = createHmac('sha256', 'WebAppData').update(token).digest()
  p.set('hash', createHmac('sha256', secret).update(check).digest('hex'))
  return p.toString()
}

describe('loginlar (asosiy admin)', () => {
  it("yaratish → parol almashtirish → o'chirish", async () => {
    await handle(text('👥 Loginlar'))
    expect(lastText()).toContain("Hali login yo'q")
    await handle(press('lg:new'))
    await handle(text('Ali'))
    expect(lastText()).toContain('<code>ali</code> uchun parol')
    await handle(text('sir12345'))
    expect(sent.some((x) => x.method === 'deleteMessage' && x.body.message_id === 55)).toBe(true) // parol xabari o'chdi
    expect(lastText()).toContain('Login yaratildi')
    expect(lastText()).toContain('https://richmen.netlify.app')
    expect(users).toHaveLength(1)
    expect(users[0].email).toBe('ali@richmen.netlify.app')
    expect(users[0].password).toBe('sir12345')
    expect(tables.staff.map((r) => r.user_id)).toEqual([users[0].id])

    // takror nom
    await handle(press('lg:new'))
    await handle(text('ali'))
    expect(lastText()).toContain('allaqachon bor')
    await handle(press('cancel'))

    const id = users[0].id
    await handle(press(`lg:pw:${id}`))
    await handle(press('lg:gen'))
    expect(lastText()).toContain('Parol almashtirildi')
    expect(users[0].password).toMatch(/^[a-z2-9]{8}$/)

    await handle(press(`lg:del:${id}`))
    expect(users).toHaveLength(1)
    await handle(press(`lg:delok:${id}`))
    expect(users).toHaveLength(0)
    expect(tables.staff).toHaveLength(0)
  })

  it("boshqa admin loginlarni boshqara olmaydi; begona foydalanuvchini o'chirib bo'lmaydi", async () => {
    ENV.ADMIN_IDS = '7,8'
    try {
      await handle(text('👥 Loginlar', 8))
      expect(lastText()).toContain('faqat asosiy admin')
      // Egasining haqiqiy emaili — bizning login emas.
      users.push({ id: '11111111-1111-1111-1111-111111111111', email: 'egasi@gmail.com', created_at: '' })
      await handle(press('lg:delok:11111111-1111-1111-1111-111111111111'))
      expect(users).toHaveLength(1)
    } finally {
      ENV.ADMIN_IDS = '7'
    }
  })

  it('menyuda Boss panel (mini app), egasida Loginlar', async () => {
    await handle(text('/start'))
    const rows = lastMarkup().keyboard
    expect(rows[1][0].web_app.url).toBe('https://richmen.netlify.app/?boss')
    expect(rows[1][1].text).toBe('👥 Loginlar')
  })
})

describe('Boss panelga Telegram orqali kirish', () => {
  it('imzo tekshiriladi', async () => {
    expect(await verifyInitData(signInit({ id: 7 }))).toBe(7)
    expect(await verifyInitData(signInit({ id: 7 }, 'boshqa-token'))).toBeNull()
    expect(await verifyInitData(signInit({ id: 7 }).replace('Q1', 'Q2'))).toBeNull()
    expect(await verifyInitData(signInit({ id: 7 }, ENV.BOT_TOKEN, 1000))).toBeNull() // eskirgan
  })
  it('admin — parolsiz kiradi (bitta hisob), boshqalar — login/parol', async () => {
    const r1 = await tgAuth(signInit({ id: 7, first_name: 'Boss' }))
    expect(r1.token_hash).toBeTruthy()
    const r2 = await tgAuth(signInit({ id: 7 }))
    expect(r2.token_hash).toBe(r1.token_hash)
    expect(users.map((u) => u.email)).toEqual(['tg-7@richmen.netlify.app'])
    expect(tables.staff).toHaveLength(1)
    expect(await tgAuth(signInit({ id: 99 }))).toEqual({ login: true })
    expect((await tgAuth('hash=abc')).error).toBeTruthy()

    // Saytdan chaqiruv (HTTP)
    const res = await handle(new Request('https://x.supabase.co/functions/v1/bot', {
      method: 'POST', body: JSON.stringify({ action: 'tg-auth', initData: signInit({ id: 99 }) }),
    }))
    expect(await res.json()).toEqual({ login: true })
  })
  it("Telegram orqali kirganlar Loginlar ro'yxatida ko'rinmaydi", async () => {
    await tgAuth(signInit({ id: 7 }))
    await handle(text('👥 Loginlar'))
    expect(lastText()).toContain("Hali login yo'q")
  })
})

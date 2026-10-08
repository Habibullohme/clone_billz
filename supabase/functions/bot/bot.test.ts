import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { brandCode, codeOf, defaultCfg, handle, learnPackSize, makeBarcode, parseSum, postCaption, refreshPosts, splitPhones, attachPhoto, tgAuth, verifyInitData, soldCaption, tashkentStamp } from './index'
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
  if (op === 'ov') {
    const want = v.slice(1, -1).split(',').map((x) => x.replace(/"/g, ''))
    return (field as string[]).some((x) => want.includes(x))
  }
  if (op === 'cs') {
    const want = JSON.parse(v)
    return want.lines.every((w: Row) => field.lines.some((l: Row) => l.productId === w.productId))
  }
  throw new Error('op ' + op)
}

let users: Row[]
/** Saytdan chaqiruvda JWT egasi (soxta). */
let jwtUser: string | null = null

/** Soxta Supabase Auth (admin API). */
function fakeAuth(path: string, method: string, body: any): Response {
  const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status })
  if (path.startsWith('admin/users?') && method === 'GET') return json({ users })
  if (path.startsWith('token?grant_type=password') || path === 'token') {
    const u = users.find((x) => x.email === body.email && x.password === body.password)
    return u ? json({ access_token: 'at_' + u.id, user: u }) : json({ error_description: 'Invalid login credentials' }, 400)
  }
  if (path.startsWith('logout')) return json({})
  if (path === 'user') {
    const u = users.find((x) => x.id === jwtUser)
    return u ? json(u) : json({ msg: 'no' }, 401)
  }
  if (path === 'admin/users' && method === 'POST') {
    if (users.some((u) => u.email === body.email)) return json({ msg: 'A user with this email address has already been registered' }, 422)
    const u = { id: crypto.randomUUID(), email: body.email, password: body.password, app_metadata: body.app_metadata ?? {}, created_at: new Date().toISOString(), last_sign_in_at: null }
    users.push(u)
    return json(u)
  }
  if (path === 'admin/generate_link') {
    const u = users.find((x) => x.email === body.email)
    return u ? json({ id: u.id, hashed_token: 'th_' + u.id }) : json({ msg: 'User not found' }, 404)
  }
  const id = path.split('/')[2]?.split('?')[0]
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
  // Fayl bilan so'rov (multipart): maydonlar, fayl o'rniga — hajmi.
  const body = init.body instanceof FormData
    ? Object.fromEntries([...init.body].map(([k, v]) => [k, typeof v === 'string' ? v : { size: (v as Blob).size }]))
    : init.body ? JSON.parse(init.body) : undefined
  if (url.pathname.startsWith('/auth/v1/')) return fakeAuth(url.pathname.slice(9) + url.search, init.method ?? 'GET', body)
  if (url.host === 'api.telegram.org') {
    const method = url.pathname.split('/').pop()!
    sent.push({ method, body })
    const result = method === 'sendPhoto' ? { message_id: ++msgId, photo: [{ file_id: (typeof body.photo === 'string' ? body.photo : 'up') + '_ch' }] }
      : method === 'editMessageMedia' ? { message_id: Number(body.message_id), photo: [{ file_id: 'new_ch' }] }
      : method === 'sendMessage' ? { message_id: ++msgId }
      : method === 'copyMessage' ? { message_id: ++msgId }
      : method === 'getMe' ? { id: 999, username: 'test_bot' }
      : method === 'getChat' ? (String(body.chat_id).startsWith('@') || Number(body.chat_id) < 0 ? { id: body.chat_id === '@yangi_kanal' ? -1005 : Number(body.chat_id), title: 'Yangi kanal', type: 'channel' } : { id: body.chat_id, type: 'private' })
      : method === 'getChatMember' ? { status: 'administrator', can_post_messages: true, can_edit_messages: true, can_delete_messages: true }
      : true
    return new Response(JSON.stringify({ ok: true, result }))
  }
  const path = url.pathname.replace('/rest/v1/', '')
  if (path === 'rpc/take_seq') {
    counters[body.p_name] = (counters[body.p_name] ?? 0) + body.p_count
    return new Response(JSON.stringify(counters[body.p_name]))
  }
  if (path === 'counters') tables.counters = Object.entries(counters).map(([name, value]) => ({ name, value }))
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
/** Oxirgi ko'rsatilgan bot xabari (yangi yoki tahrirlangan). */
const shown = () => [...sent].reverse().find((x) => x.method === 'sendMessage' || x.method === 'editMessageText')
const lastMarkup = () => shown()?.body.reply_markup
const lastText = () => shown()?.body.text as string
/** Pastki (reply) klaviatura — oxirgi yuborilgan xabardagi. */
const deletedMsg = (chat: number, mid: number) => sent.some((x) => x.method === 'deleteMessage' && x.body.chat_id === chat && x.body.message_id === mid)
const keyTexts = () => lastKeyboard().flat().map((x: any) => x.text) as string[]
const lastKeyboard = () => [...sent].reverse().find((x) => x.method === 'sendMessage' && x.body.reply_markup?.keyboard)?.body.reply_markup.keyboard

beforeEach(() => {
  tables = { brands: [{ id: 'velton', data: 'Velton' }], settings: [{ id: 'main', data: { shopPhone: '+998 90 000 00 00' } }], products: [], sales: [], staff: [] }
  counters = { product: 40, 'brand:velton': 20, batch: 3 }
  sent = []
  users = []
  jwtUser = null
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
  it("/start — asosiy menyu; sozlamalar pastki tugmalarda, Orqaga; kirim", async () => {
    await handle(text('/start'))
    expect(lastText()).toContain('Asosiy menyu')
    expect(lastKeyboard()[0].map((x: any) => x.text)).toEqual(["📦 Yuk qo'shish", '⚙️ Sozlamalar'])
    expect(tables.bot_sessions[0].data.step).toBe('home') // /start kirim boshlamaydi
    expect(deletedMsg(7, 55)).toBe(true) // bosilgan tugma (yozuv) o'chadi

    await handle(text('⚙️ Sozlamalar'))
    expect(lastText()).toContain('44-45-46')
    expect(lastText()).toContain('zamish')
    // sarlavha — alohida, ma'lumotlar — iqtibos ichida, izoh — iqtibosdan tashqarida
    expect(lastText()).toMatch(/^⚙️ <b>Bot sozlamalari<\/b>\n<blockquote>📏 Razmerlar:[\s\S]*<\/blockquote>\n<i>/)
    expect(keyTexts()).toContain('⬅️ Orqaga')
    await handle(text('📏 Razmerlar'))
    expect(lastText()).toContain('Razmerlarni vergul')
    expect(keyTexts()).toEqual(['⬅️ Orqaga'])
    await handle(text('39-43, 40-44, 44-45-46'))
    expect(lastText()).toContain('✅ Saqlandi')
    await handle(text('🎨 Ranglar'))
    await handle(text('qora, karesh, zamish'))
    await handle(text('📞 Telefon'))
    await handle(text('+998 90 111 22 33'))
    await handle(text('🙈 Narxni yashirish'))
    expect(lastText()).toContain('yashirilgan')
    expect(keyTexts()).toContain("💰 Narxni ko'rsatish")
    // Orqaga: kiritishdan → sozlamalar → asosiy menyu
    await handle(text('📍 Manzil'))
    await handle(text('⬅️ Orqaga'))
    expect(lastText()).toContain('Bot sozlamalari')
    await handle(text('⬅️ Orqaga'))
    expect(lastText()).toContain('Asosiy menyu')
    const cfg = tables.settings.find((r) => r.id === 'bot')!.data
    expect(cfg.sizes).toEqual(['39-43', '40-44', '44-45-46'])
    expect(cfg.colors).toEqual(['qora', 'karesh', 'zamish'])
    expect(cfg.phone).toBe('+998 90 111 22 33')
    expect(cfg.showPrice).toBe(false)
    // Chatda faqat bitta ekran: oldingi ekranlar o'chiriladi.
    const screens = sent.filter((x) => x.method === 'sendMessage' && x.body.chat_id === 7).length
    const dels = sent.filter((x) => x.method === 'deleteMessage' && x.body.chat_id === 7 && x.body.message_id !== 55).length
    expect(screens - dels).toBe(1)

    // Kirim: sozlamadagi tugmalar va qo'lda kiritish
    await handle(text("📦 Yuk qo'shish"))
    await handle(photo('p1'))
    await handle(photo('p2'))
    await handle(text('✅ Rasmlar tayyor'))
    await handle(press('brand:Velton'))
    await handle(text('klassik'))
    expect(lastMarkup().inline_keyboard.flat().map((x: any) => x.text)).toEqual(['39-43', '40-44', '44-45-46'])
    expect(keyTexts()).toEqual(["✍️ Qo'lda kiritish", '❌ Bekor qilish'])
    expect(lastText()).toContain('Model: <b>klassik</b>') // javoblar kartochkada yig'iladi
    await handle(text("✍️ Qo'lda kiritish"))
    expect(lastText()).toContain('Javobni yozib yuboring')
    await handle(text('38-42'))
    expect(lastMarkup().inline_keyboard[0].map((x: any) => x.text)).toEqual(['qora', 'karesh', 'zamish'])
    await handle(press('color:karesh'))
    await handle(press('packSize:6'))
    await handle(text('150000'))
    await handle(text('170000'))
    expect(keyTexts()).toEqual(['✅ Tasdiqlash', '❌ Bekor qilish'])
    // Kodlar tasdiqdan oldin ko'rinadi (hisoblagich 20 da — keyingilari A21, A22).
    expect(lastText()).toContain('Etiketka kodlari: <b>A21–A22</b>')
    expect(lastText()).toContain('📷1: A21')
    expect(counters['brand:velton']).toBe(20)
    await handle(text('✅ Tasdiqlash'))
    expect(tables.products.map((p: any) => p.name)).toEqual(['klassik A21', 'klassik A22'])
    expect(lastText()).toContain('kodlar: <b>A21–A22</b>')
    const post = sent.find((x) => x.method === 'sendPhoto')!.body.caption
    expect(post).toContain('38-42')
    expect(post).toContain('karesh')
    expect(post).toContain('+998 90 111 22 33')
    expect(post).not.toContain('170 000')
    expect(tables.products).toHaveLength(2)
    expect(lastText()).toContain('Kirim №')
    expect(lastKeyboard()[0].map((x: any) => x.text)).toEqual(["📦 Yuk qo'shish", '⚙️ Sozlamalar'])
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
    await handle(text('⚙️ Sozlamalar'))
    await handle(text('📞 Telefon'))
    await handle(text('+998 99 777 77 77, +998 88 666 66 66'))
    await handle(text('🙈 Narxni yashirish'))
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
    expect(tables.bot_sessions[0].data.step).toBe('home')

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
    expect(lastText()).toContain('login va parol')
    expect(lastKeyboard()[0][0].text).toBe('🔐 Kirish')
    await handle(text("📦 Yuk qo'shish", 99))
    expect(tables.bot_sessions.find((r) => r.chat_id === 99)?.data.step).toBe('auth_idle') // kirim boshlanmadi
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
  it("yaratish (tur bilan) → turini almashtirish → parol → o'chirish — hammasi pastki tugmalar bilan", async () => {
    await handle(text('👥 Loginlar'))
    expect(lastText()).toContain("Hali login yo'q")
    expect(keyTexts()).toEqual(['➕ Yangi login', '⬅️ Orqaga'])
    await handle(text('➕ Yangi login'))
    expect(lastKeyboard()[0].map((x: any) => x.text)).toEqual(['🛠 Admin', '📊 Kuzatuvchi'])
    await handle(text('ali'))
    expect(lastText()).toContain('Hisob turini tanlang') // avval tur
    await handle(text('📊 Kuzatuvchi'))
    await handle(text('Ali'))
    expect(lastText()).toContain('Login:  <code>ali</code>')
    expect(keyTexts()).toEqual(['🎲 Parol yaratish', '⬅️ Orqaga'])
    await handle(text('abc12'))
    expect(lastText()).toContain('kamida 8')
    await handle(text('ali12345'))
    expect(lastText()).toContain('loginni')
    await handle(text('salom2026'))
    expect(deletedMsg(7, 55)).toBe(true) // parol xabari o'chdi
    const card = sent.find((x) => x.method === 'sendMessage' && x.body.text.includes("Kirish ma'lumoti"))!.body.text
    expect(card).toContain('salom2026')
    expect(card).toContain('Kuzatuvchi')
    expect(lastText()).toContain('<b>ali</b> yaratildi')
    expect(users).toHaveLength(1)
    expect(users[0].email).toBe('ali@richmen.netlify.app')
    expect(users[0].app_metadata.role).toBe('stats')
    expect(tables.staff.map((r) => r.user_id)).toEqual([users[0].id])
    expect(keyTexts()).toEqual(['👤 ali', '➕ Yangi login', '⬅️ Orqaga'])

    // takror nom; Orqaga
    await handle(text('➕ Yangi login'))
    await handle(text('🛠 Admin'))
    await handle(text('ali'))
    expect(lastText()).toContain('allaqachon bor')
    await handle(text('⬅️ Orqaga'))
    expect(lastText()).toContain('Hisob turini tanlang')
    await handle(text('⬅️ Orqaga'))
    expect(lastText()).toContain('Loginlar')

    // login kartasi
    await handle(text('👤 ali'))
    expect(lastText()).toContain('👤 <b>ali</b>')
    expect(lastText()).toContain('PIN:  hali yaratilmagan')
    expect(keyTexts()).toContain('🔢 PIN reset')
    expect(keyTexts()).toContain('📱 Qurilmalar')
    // turini almashtirish — tasdiq bilan
    await handle(text('🔁 Turini almashtirish'))
    expect(lastText()).toContain('Yangi:  🛠 Admin')
    expect(users[0].app_metadata.role).toBe('stats')
    await handle(text('⬅️ Orqaga'))
    expect(users[0].app_metadata.role).toBe('stats')
    await handle(text('🔁 Turini almashtirish'))
    await handle(text('✅ Ha, 🛠 Admin qilish'))
    expect(users[0].app_metadata.role).toBe('admin')
    expect(keyTexts()).not.toContain('🔢 PIN reset')

    // parol almashtirish — hisob qayta yaratiladi (eski kirishlar bekor), turi saqlanadi
    const oldId = users[0].id
    await handle(text('🔑 Parolni almashtirish'))
    await handle(text('🎲 Parol yaratish'))
    expect(lastText()).toContain('Parol almashtirildi')
    expect(users).toHaveLength(1)
    expect(users[0].id).not.toBe(oldId)
    expect(users[0].app_metadata.role).toBe('admin')
    expect(users[0].password).toMatch(/^[a-zA-Z2-9]{10}$/)
    expect(tables.staff.map((r) => r.user_id)).toEqual([users[0].id])

    await handle(text("🗑 O'chirish"))
    expect(users).toHaveLength(1)
    await handle(text("✅ Ha, o'chirish"))
    expect(users).toHaveLength(0)
    expect(tables.staff).toHaveLength(0)
    expect(lastText()).toContain("o'chirildi")
  })

  it("boshqa admin hisoblarni boshqara olmaydi; email va bot admin hisoblari ham ro'yxatda", async () => {
    ENV.ADMIN_IDS = '7,8'
    try {
      await handle(text('👥 Loginlar', 8))
      expect(lastText()).toContain('faqat asosiy admin')
      users.push({ id: '11111111-1111-1111-1111-111111111111', email: 'egasi@gmail.com', password: 'eski1234', created_at: '', app_metadata: {} })
      users.push({ id: '33333333-3333-3333-3333-333333333333', email: 'tg-8@richmen.netlify.app', created_at: '', app_metadata: {} })
      tables.staff.push({ user_id: '11111111-1111-1111-1111-111111111111' })
      await handle(text('👥 Loginlar'))
      expect(lastText()).toContain('egasi@gmail.com')
      expect(lastText()).toContain('Bot adminlari')
      expect(keyTexts()).toEqual(['📧 egasi@gmail.com', '🤖 8', '➕ Yangi login', '⬅️ Orqaga'])
      // email hisob: o'chirish yo'q, parol va qurilmalar bor
      await handle(text('📧 egasi@gmail.com'))
      expect(lastText()).toContain("Email hisob — to'liq kirish")
      expect(keyTexts()).toEqual(['🔑 Parolni almashtirish', '📱 Qurilmalar', '⬅️ Orqaga'])
      await handle(text("🗑 O'chirish"))
      expect(users).toHaveLength(2)
      // email hisob paroli — o'sha hisob qoladi, qurilmalar chiqariladi
      tables.devices = [{ id: 'd1', user_id: '11111111-1111-1111-1111-111111111111', name: 'Windows · Chrome', last_seen: '2026-10-08T05:00:00Z', created_at: '', revoked: false }]
      await handle(text('🔑 Parolni almashtirish'))
      await handle(text('Yashil2026'))
      expect(users[0].id).toBe('11111111-1111-1111-1111-111111111111')
      expect(users[0].password).toBe('Yashil2026')
      expect(tables.devices[0].revoked).toBe(true)
      // bot admini: faqat qurilmalar
      await handle(text('⬅️ Orqaga'))
      await handle(text('🤖 8'))
      expect(keyTexts()).toEqual(['📱 Qurilmalar', '⬅️ Orqaga'])
    } finally {
      ENV.ADMIN_IDS = '7'
    }
  })

  it("qurilmalar: ro'yxat, bittasini chiqarish (tasdiq bilan), Telegramdan uzish", async () => {
    users.push({ id: '44444444-4444-4444-4444-444444444444', email: 'kassir@richmen.netlify.app', password: 'kassa2026', created_at: '', app_metadata: { role: 'admin', login: 'kassir', tg: 77 } })
    tables.staff.push({ user_id: '44444444-4444-4444-4444-444444444444' })
    tables.devices = [
      { id: 'd1', user_id: '44444444-4444-4444-4444-444444444444', name: 'Windows · Chrome', last_seen: '2026-10-08T05:00:00Z', created_at: '', revoked: false },
      { id: 'd2', user_id: '44444444-4444-4444-4444-444444444444', name: 'Telegram · Android', last_seen: '2026-10-08T04:00:00Z', created_at: '', revoked: false },
    ]
    await handle(text('👥 Loginlar'))
    await handle(text('👤 kassir'))
    expect(lastText()).toContain('Qurilmalar:  2 ta')
    await handle(text('📱 Qurilmalar'))
    expect(lastText()).toContain('1. 💻 <b>Windows · Chrome</b>')
    expect(lastText()).toContain('2. 📱 <b>Telegram · Android</b>')
    expect(lastText()).toContain('Telegram bot</b> — ulangan')
    expect(keyTexts()).toEqual(['🚪 Telegramdan uzish', '🚪 1', '🚪 2', '🚪 Hammasidan chiqarish', '⬅️ Orqaga'])
    await handle(text('🚪 1'))
    expect(lastText()).toContain('«Windows · Chrome» dan chiqarilsinmi')
    expect(tables.devices[0].revoked).toBe(false)
    await handle(text('✅ Ha, chiqarish'))
    expect(tables.devices[0].revoked).toBe(true)
    expect(lastText()).toContain('✅ Chiqarildi')
    // Telegram ichidagi qurilma — Telegram bog'lanishi ham uziladi
    await handle(text('🚪 1'))
    await handle(text('✅ Ha, chiqarish'))
    expect(tables.devices[1].revoked).toBe(true)
    expect(users.find((u) => u.id.startsWith('4444'))!.app_metadata.tg).toBeNull()
    expect(sent.some((x) => x.method === 'sendMessage' && x.body.chat_id === 77 && x.body.text.includes('chiqarildingiz'))).toBe(true)
  })

  it('menyuda Panel (mini app), egasida Loginlar', async () => {
    await handle(text('/start'))
    const rows = lastKeyboard()
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
    expect(await tgAuth(signInit({ id: 99 }))).toEqual({ unbound: true })
    expect((await tgAuth('hash=abc')).error).toBeTruthy()

    // Saytdan chaqiruv (HTTP)
    const res = await handle(new Request('https://x.supabase.co/functions/v1/bot', {
      method: 'POST', body: JSON.stringify({ action: 'tg-auth', initData: signInit({ id: 99 }) }),
    }))
    expect(await res.json()).toEqual({ unbound: true })
  })
  it("Telegram orqali kirganlar Loginlar ro'yxatida ko'rinmaydi", async () => {
    await tgAuth(signInit({ id: 7 }))
    await handle(text('👥 Loginlar'))
    expect(lastText()).toContain("Hali login yo'q")
  })
})

describe('botga login/parol bilan kirish', () => {
  let mid = 70
  const guest = (t: string, id = 50) => tgReq({ message: { message_id: ++mid, chat: { id, type: 'private' }, from: { id, first_name: 'Vali' }, text: t } })
  const myText = (id = 50) => [...sent].reverse().find((x) => (x.method === 'sendMessage' || x.method === 'editMessageText') && x.body.chat_id === id)!
  /** /start → 🔐 Kirish (pastki tugma). */
  const begin = async (id = 50) => {
    await handle(guest('/start', id))
    expect(myText(id).body.text).toContain('Assalomu alaykum, Vali')
    expect(lastKeyboard()[0][0].text).toBe('🔐 Kirish')
    expect(deletedMsg(id, mid)).toBe(true) // /start ham o'chadi
    await handle(guest('🔐 Kirish', id))
    expect(deletedMsg(id, mid)).toBe(true)
  }
  beforeEach(() => {
    users.push({ id: '22222222-2222-2222-2222-222222222222', email: 'vali@richmen.netlify.app', password: 'kassa2026', app_metadata: { role: 'admin', login: 'vali' }, created_at: '' })
    tables.staff = [{ user_id: '22222222-2222-2222-2222-222222222222' }]
  })

  it("pastki tugma bosilsa tepadagi xabar o'zgaradi: login → parol → xush kelibsiz; yozilganlar o'chadi; chiqish", async () => {
    await begin()
    let last = myText()
    expect(last.body.text).toContain('Loginingizni yozing')
    expect(keyTexts()).toEqual(['⬅️ Orqaga'])
    const card = last.method === 'sendMessage' ? msgId : last.body.message_id

    await handle(guest('Vali'))
    expect(deletedMsg(50, mid)).toBe(true)
    last = myText()
    expect(last.method).toBe('editMessageText') // o'sha xabar o'zgardi
    expect(last.body.message_id).toBe(card)
    expect(last.body.text).toContain('Parolni yozing')

    // Orqaga — loginga qaytadi
    await handle(guest('⬅️ Orqaga'))
    expect(myText().body.text).toContain('Loginingizni yozing')
    await handle(guest('vali'))

    await handle(guest('kassa2026'))
    expect(deletedMsg(50, mid)).toBe(true)
    expect(deletedMsg(50, card)).toBe(true) // kirish xabari o'rniga kutib olish
    expect(myText().body.text).toContain('Xush kelibsiz, Vali')
    expect(lastKeyboard()[0][0].web_app.url).toBe('https://richmen.netlify.app/?boss')
    expect(lastKeyboard()[0][0].text).toBe('🛠 Admin panel')
    expect(users[0].app_metadata.tg).toBe(50)
    expect(sent.find((x) => x.method === 'setChatMenuButton' && x.body.chat_id === 50)!.body.menu_button.type).toBe('web_app')
    const note = sent.find((x) => x.method === 'sendMessage' && x.body.chat_id === 7 && x.body.text.includes('Botga kirish'))!.body.text
    expect(note).toContain('👤 Login:  <code>vali</code>')
    expect(note).toContain('🆔 <code>50</code>')

    expect(await tgAuth(signInit({ id: 50 }))).toEqual({ token_hash: 'th_22222222-2222-2222-2222-222222222222', role: 'admin' })

    // admin funksiyalari (bot ichidagi) yopiq
    await handle(guest("📦 Yuk qo'shish"))
    expect(tables.bot_sessions?.some((r) => r.chat_id === 50 && r.data.step === 'photos')).toBeFalsy()

    await handle(guest('🚪 Chiqish'))
    expect(users[0].app_metadata.tg).toBeNull()
    expect(myText().body.text).toContain('Chiqdingiz')
    expect(lastKeyboard()[0][0].text).toBe('🔐 Kirish')
    expect(await tgAuth(signInit({ id: 50 }))).toEqual({ unbound: true })
  })

  it("mavjud bo'lmagan login — o'sha xabarda aytiladi va qayta so'raladi", async () => {
    await begin()
    await handle(guest('yoqlogin'))
    const t = myText().body.text
    expect(t).toContain('«yoqlogin»</b> degan login topilmadi')
    expect(t).toContain('Qolgan urinish: <b>2</b>')
    await handle(guest('vali'))
    expect(myText().body.text).toContain('Parolni yozing')
  })

  it("3 marta noto'g'ri — 15 daqiqa to'xtatiladi, egasiga ogohlantirish, /start ochmaydi", async () => {
    await begin()
    await handle(guest('vali'))
    await handle(guest('notogri1'))
    expect(myText().body.text).toContain("Parol noto'g'ri")
    await handle(guest('notogri2'))
    await handle(guest('notogri3'))
    expect(myText().body.text).toContain('15 daqiqa')
    expect(sent.some((x) => x.body?.chat_id === 7 && x.body.text?.includes('Shubhali urinish'))).toBe(true)
    await handle(guest('/start'))
    expect(myText().body.text).toContain("Juda ko'p")
    await handle(guest('🔐 Kirish'))
    expect(myText().body.text).toContain("Juda ko'p")
    expect(users[0].app_metadata.tg).toBeUndefined()
  })

  it('bitta login — bitta Telegram: boshqasidan kirilsa, eskisi chiqariladi', async () => {
    for (const id of [50, 51]) {
      await begin(id)
      await handle(guest('vali', id))
      await handle(guest('kassa2026', id))
    }
    expect(users[0].app_metadata.tg).toBe(51)
    expect(sent.some((x) => x.method === 'sendMessage' && x.body.chat_id === 50 && x.body.text.includes('boshqa Telegramdan'))).toBe(true)
    expect(await tgAuth(signInit({ id: 50 }))).toEqual({ unbound: true })
  })

  it("hisob turi yo'q — bot orqali kirib bo'lmaydi; eski 'seller' nomi admin deb tushuniladi", async () => {
    users[0].app_metadata = {}
    await begin()
    await handle(guest('vali'))
    await handle(guest('kassa2026'))
    expect(myText().body.text).toContain('turi tanlanmagan')
    expect(users[0].app_metadata.tg).toBeUndefined()

    users[0].app_metadata = { role: 'seller' }
    await begin()
    await handle(guest('vali'))
    await handle(guest('kassa2026'))
    expect(myText().body.text).toContain('Xush kelibsiz')
    expect(lastKeyboard()[0][0].text).toBe('🛠 Admin panel')
  })

  it("kuzatuvchi PIN: botda o'zgartiradi, sayt bot orqali tekshiradi, egasi reset qiladi", async () => {
    users[0].app_metadata = { role: 'stats', login: 'vali' }
    await begin()
    await handle(guest('vali'))
    await handle(guest('kassa2026'))
    expect(lastKeyboard()[0][0].text).toBe('📊 Kuzatuvchi panel')
    expect(lastKeyboard()[1].map((x: any) => x.text)).toEqual(["🔢 PIN kodni o'zgartirish", '🚪 Chiqish'])

    // Sayt (mini app): hali PIN yo'q → yaratadi
    jwtUser = users[0].id
    const call = async (op: string, pin?: string) => (await handle(new Request('https://x/functions/v1/bot', {
      method: 'POST', headers: { Authorization: 'Bearer jwt' }, body: JSON.stringify({ action: 'pin', op, pin }),
    }))).json()
    expect(await call('status')).toEqual({ hasPin: false })
    expect((await call('set', '12a')).error).toBeTruthy()
    expect(await call('set', '1234')).toEqual({ ok: true })
    expect(users[0].app_metadata.pin).toBeTruthy()
    expect(users[0].app_metadata.pin).not.toContain('1234') // PIN o'zi saqlanmaydi
    expect((await call('set', '9999')).error).toContain('allaqachon')
    expect(await call('check', '1234')).toEqual({ ok: true })
    expect((await call('check', '0000')).error).toContain('Qolgan urinish: 4')

    // Botda /changepass
    await handle(guest('/changepass'))
    expect(myText().body.text).toContain('Hozirgi PIN')
    await handle(guest('1111'))
    expect(myText().body.text).toContain("PIN noto'g'ri")
    await handle(guest('1234'))
    expect(myText().body.text).toContain('Yangi PIN')
    await handle(guest('5678'))
    expect(myText().body.text).toContain('takrorlang')
    await handle(guest('5679'))
    expect(myText().body.text).toContain('Bir xil emas')
    await handle(guest('5678'))
    await handle(guest('5678'))
    expect(myText().body.text).toContain("PIN kod o'zgartirildi")
    expect(await call('check', '5678')).toEqual({ ok: true })

    // Egasi reset qiladi → keyingi kirishda yangisini yaratadi
    await handle(text('👥 Loginlar'))
    await handle(text('👤 vali'))
    expect(lastText()).toContain("PIN:  o'rnatilgan")
    await handle(text('🔢 PIN reset'))
    expect(await call('status')).toEqual({ hasPin: false })

    // Admin hisobga shaxsiy PIN kerak emas
    users[0].app_metadata.role = 'admin'
    expect(await call('status')).toEqual({ skip: true })
    expect((await call('set', '1234')).error).toBeTruthy()
  })
})

describe('rasmlar tugmalari va tasdiq', () => {
  it("pastdagi tugmalar; tasdiqda 1 pachka foydasi", async () => {
    await handle(text("📦 Yuk qo'shish"))
    expect(lastKeyboard().map((r: any) => r[0].text)).toEqual(['✅ Rasmlar tayyor', '❌ Bekor qilish'])
    await handle(photo('a1'))
    await handle(photo('a2'))
    await handle(text('✅ Rasmlar tayyor'))
    expect(sent.some((x) => x.body?.text?.includes('2 ta rasm'))).toBe(true)
    await handle(press('brand:Velton'))
    await handle(text('klassik'))
    await handle(press('size:39-43'))
    await handle(press('color:qora'))
    await handle(press('packSize:6'))
    await handle(text('150000'))
    await handle(text('170000'))
    expect(lastText()).toContain('120 000</b> (1 pachka)')
    await handle(text('❌ Bekor qilish'))
    expect(tables.bot_sessions.find((r) => r.chat_id === 7)!.data.step).toBe('home')
    expect(lastText()).toContain('Kirim bekor qilindi')
    expect(tables.bot_photos).toHaveLength(0)
  })
})

describe('kanallarni botdan ulash', () => {
  it('forward qilingan xabar yoki @nom bilan; bot admin ekani tekshiriladi; kirim shu kanalga chiqadi', async () => {
    await handle(text('⚙️ Sozlamalar'))
    await handle(text('📣 Kanallar'))
    expect(lastText()).toContain('Asosiy kanal')
    await handle(text('📣 Asosiy kanal'))
    expect(lastText()).toContain('forward')
    // kanaldan forward qilingan (rasmli) xabar — kirim boshlanmaydi
    await handle(tgReq({ message: { message_id: 60, chat: { id: 7 }, from: { id: 7 }, photo: [{ file_id: 'x' }], forward_origin: { type: 'channel', chat: { id: -1009, title: 'Richmen' } } } }))
    expect(lastText()).toContain('Ulandi')
    expect(tables.settings.find((r) => r.id === 'bot')!.data.channelId).toBe(-1009)
    expect(tables.bot_photos ?? []).toHaveLength(0)
    await handle(text('✅ Sotilganlar kanali'))
    await handle(text('salom'))
    expect(lastText()).toContain('forward qiling yoki @kanal_nomi')
    await handle(text('@yangi_kanal'))
    expect(tables.settings.find((r) => r.id === 'bot')!.data.soldChannelId).toBe(-1005)

    // kirim yangi kanalga
    await handle(text('/start'))
    await handle(text("📦 Yuk qo'shish"))
    await handle(photo('k1'))
    await handle(photo('k2'))
    await handle(text('✅ Rasmlar tayyor'))
    await handle(press('brand:Velton'))
    await handle(text('klassik'))
    await handle(press('size:39-43'))
    await handle(press('color:qora'))
    await handle(press('packSize:6'))
    await handle(text('150000'))
    await handle(text('170000'))
    await handle(text('✅ Tasdiqlash'))
    expect(sent.find((x) => x.method === 'sendPhoto')!.body.chat_id).toBe(-1009)
  })
  it("bot admin bo'lmasa — ulanmaydi", async () => {
    vi.stubGlobal('fetch', async (input: any, init: any) => {
      if (String(input).includes('/getChatMember')) return new Response(JSON.stringify({ ok: true, result: { status: 'left' } }))
      return fakeFetch(input, init)
    })
    await handle(text('⚙️ Sozlamalar'))
    await handle(text('📣 Kanallar'))
    await handle(text('📣 Asosiy kanal'))
    await handle(text('@yangi_kanal'))
    expect(lastText()).toContain('admin emas')
    expect(tables.settings.find((r) => r.id === 'bot')?.data.channelId).toBeUndefined()
  })
})

describe("qo'ldagi tovarga rasm (sayt / mini app)", () => {
  const prod = (id: string, name: string, stock = 5) => ({ id, brand: 'Little', name, size: '36-40', color: 'qora', pack_size: 5, sale_price: 105000, cost_price: 90000, stock, batch_id: 'b1' })
  it('yangi post: bir nechta pachka bitta postda; keyin rasm almashtiriladi', async () => {
    tables.products = [prod('p1', 'Little 01 A1'), prod('p2', 'Little 01 A2'), prod('p3', 'Little 01 A3', 0)]
    const jpeg = new Uint8Array(5000)
    expect(await attachPhoto(['p1', 'p2', 'p3'], jpeg)).toEqual({ ok: true, replaced: false })
    const post = sent.find((x) => x.method === 'sendPhoto')!.body
    expect(post.chat_id).toBe('-100')
    expect(post.photo).toEqual({ size: 5000 })
    expect(post.caption).toContain('Kod: <b>A1–A3</b>')
    expect(post.caption).toContain('Mavjud: 2 pachka')
    expect(post.caption).toContain('Little 01')
    expect(tables.channel_posts).toHaveLength(1)
    expect(tables.channel_posts[0].product_ids).toEqual(['p1', 'p2', 'p3'])
    expect(tables.channel_posts[0].left_packs).toBe(2)

    // kanalda bor — rasm almashtiriladi, yangi post chiqmaydi
    sent = []
    expect(await attachPhoto(['p1'], jpeg)).toEqual({ ok: true, replaced: true })
    expect(sent.map((x) => x.method)).toEqual(['editMessageMedia'])
    expect(JSON.parse(sent[0].body.media).caption).toContain('A1–A3')
    expect(tables.channel_posts).toHaveLength(1)
    expect(tables.channel_posts[0].file_id).toBe('new_ch')
  })
  it("kuzatuvchi rasm qo'sha olmaydi; kichik fayl rad etiladi", async () => {
    tables.products = [prod('p1', 'Little 01 A1')]
    expect(await attachPhoto(['p1'], new Uint8Array(10))).toEqual({ error: "Rasm noto'g'ri yoki juda katta" })
    users.push({ id: '55555555-5555-5555-5555-555555555555', email: 'kuz@richmen.netlify.app', created_at: '', app_metadata: { role: 'stats' } })
    tables.staff.push({ user_id: '55555555-5555-5555-5555-555555555555' })
    jwtUser = '55555555-5555-5555-5555-555555555555'
    const res = await handle(new Request('https://x/functions/v1/bot', {
      method: 'POST', headers: { Authorization: 'Bearer jwt' }, body: JSON.stringify({ action: 'photo', productIds: ['p1'], image: 'AAAA' }),
    }))
    expect(res.status).toBe(403)
    expect(sent.some((x) => x.method === 'sendPhoto')).toBe(false)
  })
})

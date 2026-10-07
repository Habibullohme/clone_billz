/**
 * Do'kon Telegram boti — Supabase Edge Function (24 soat ishlaydi, kompyuter kerak emas).
 *
 * 1) Yuk kiritish: rasmlar → savol-javob (brend, model, razmer, rang, juft, narxlar) → tasdiq →
 *    tovarlar saytning bazasiga yoziladi (har pachka — alohida tovar, kod A1…, shtrix-kod) va
 *    har rasm asosiy kanalga post bo'lib chiqadi.
 * 2) Sotilganda: sayt "sync" deb chaqiradi → hammasi sotilgan postlar "Sotilganlar" kanaliga
 *    (sana, kun, narx bilan) ko'chiriladi va asosiy kanaldan o'chiriladi.
 *
 * Maxfiy sozlamalar (Supabase → Edge Functions → Secrets):
 *   BOT_TOKEN, ADMIN_IDS (vergul bilan), CHANNEL_ID, SOLD_CHANNEL_ID, WEBHOOK_SECRET
 * SUPABASE_URL va SUPABASE_SERVICE_ROLE_KEY — Supabase o'zi beradi.
 *
 * Bitta fayl — Supabase saytidagi muharrirga to'g'ridan-to'g'ri qo'yish uchun.
 */

// ---------- Sozlamalar ----------

const env = (k: string) => (globalThis as { Deno?: { env: { get(k: string): string | undefined } } }).Deno?.env.get(k) ?? ''

// ---------- Sof yordamchilar (testlanadi) ----------

export function ean13(base12: string): string {
  const sum = base12.split('').reduce((s, d, i) => s + Number(d) * (i % 2 ? 3 : 1), 0)
  return base12 + ((10 - (sum % 10)) % 10)
}
export const makeBarcode = (seq: number) => ean13('21' + String(seq).padStart(10, '0'))

const CODES_PER_LETTER = 200
function letter(i: number): string {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}
/** 1 → A1, 200 → A200, 201 → B1 (saytdagi bilan bir xil). */
export function brandCode(n: number): string {
  const i = n - 1
  return `${letter(Math.floor(i / CODES_PER_LETTER))}${(i % CODES_PER_LETTER) + 1}`
}
export const codeOf = (name: string) => name.trim().match(/\s([A-Z]{1,2}\d{1,3})$/)?.[1] ?? null

export const formatSum = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')

/** "220 000", "220000", "220.000", "220k", "220 ming" → 220000. */
export function parseSum(text: string): number | null {
  const t = text.trim().toLowerCase().replace(/so'?m|сум|sum/g, '').trim()
  const m = t.match(/^(\d[\d\s.,]*)\s*(k|ming|минг|тыс)?$/)
  if (!m) return null
  let v = Number(m[1].replace(/[\s.,]/g, ''))
  if (m[2]) v *= 1000
  return Number.isFinite(v) && v > 0 ? v : null
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export interface Draft {
  brand: string
  model: string
  size: string
  color: string
  packSize: number
  cost: number
  price: number
}

export interface Shop { shopName?: string; shopPhone?: string; shopAddress?: string }

/** "+998 90 111 11 11, +998 91 222 22 22" → har biri alohida (vergul, nuqtali vergul yoki yangi qator bilan). */
export const splitPhones = (s?: string | null) => (s ?? '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)

/** Kanal posti matni. Kelish narxi hech qachon yozilmaydi. */
export function postCaption(d: Draft, code: string, shop: Shop, packs = 1, left = packs, showPrice = true): string {
  const lines: (string | null)[] = [
    `👟 <b>${esc(d.brand)} ${esc(d.model)}</b>`,
    '',
    d.size ? `📏 Razmer: ${esc(d.size)}` : null,
    d.color ? `🎨 Rang: ${esc(d.color)}` : null,
    `📦 Pachkada: ${d.packSize} juft`,
    showPrice ? `💰 Narxi: <b>${formatSum(d.price)} so'm</b> (1 juft)` : null,
    packs > 1 ? `🔢 Mavjud: ${left} pachka` : null,
    `🔖 Kod: <b>${code}</b>`,
    shop.shopPhone || shop.shopAddress ? '' : null,
    ...splitPhones(shop.shopPhone).map((t) => `📞 ${esc(t)}`),
    shop.shopAddress ? `📍 ${esc(shop.shopAddress)}` : null,
  ]
  return lines.filter((x) => x !== null).join('\n').trim()
}

const WEEKDAYS = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba']

/** Toshkent vaqti bo'yicha: "Dushanba, 06.10.2026 14:30". */
export function tashkentStamp(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 5 * 3600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${WEEKDAYS[d.getUTCDay()]}, ${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`
}

export interface SoldInfo { at: string; price: number; pairs: number; saleNumber?: number; customer?: string }

/** "Sotilganlar" kanalidagi yozuv. */
export function soldCaption(original: string, info: SoldInfo | null, packs: number): string {
  const head = info
    ? [
      `✅ <b>SOTILDI</b> · ${tashkentStamp(info.at)}`,
      `💵 ${formatSum(info.price)} × ${info.pairs} juft = <b>${formatSum(info.price * info.pairs)}</b>${packs > 1 ? ` (${packs} pachka)` : ''}`,
      [info.saleNumber && `🧾 Chek №${info.saleNumber}`, info.customer && `👤 ${esc(info.customer)}`].filter(Boolean).join(' · '),
    ]
    : [`✅ <b>SOTILDI</b> · ${tashkentStamp(new Date().toISOString())}`]
  // Asl postdan telefon/manzil qatorlari kerak emas.
  const body = original.split('\n').filter((l) => !l.startsWith('📞') && !l.startsWith('📍') && !l.startsWith('🔢')).join('\n').trim()
  return [...head.filter(Boolean), '', body].join('\n').slice(0, 1024)
}

// ---------- Supabase (PostgREST, maxfiy kalit bilan) ----------

const SB = () => env('SUPABASE_URL')
const KEY = () => env('SUPABASE_SERVICE_ROLE_KEY')

async function db<T = unknown>(path: string, init: RequestInit = {}, prefer?: string): Promise<T> {
  const res = await fetch(`${SB()}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY(), Authorization: `Bearer ${KEY()}`, 'Content-Type': 'application/json',
      ...(prefer && { Prefer: prefer }),
      ...(init.headers as Record<string, string>),
    },
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`DB ${path}: ${res.status} ${text}`)
  return (text ? JSON.parse(text) : null) as T
}

const takeSeq = async (name: string, count = 1) =>
  Number(await db<number>('rpc/take_seq', { method: 'POST', body: JSON.stringify({ p_name: name, p_count: count }) }))

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

// ---------- Telegram ----------

async function tg<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env('BOT_TOKEN')}/${method}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  const j = await res.json()
  if (!j.ok) throw new Error(`TG ${method}: ${j.description}`)
  return j.result as T
}

type Btn = { text: string; callback_data: string }
const kb = (rows: Btn[][]) => ({ reply_markup: { inline_keyboard: rows } })
const b = (text: string, data: string): Btn => ({ text, callback_data: data })
const say = (chat: number, text: string, extra: Record<string, unknown> = {}) =>
  tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', ...extra })

// ---------- Bot sozlamalari (settings jadvalida, id = 'bot') ----------

export interface BotCfg {
  sizes: string[]
  colors: string[]
  packSizes: number[]
  showPrice: boolean
  /** null — saytdagi telefon/manzil; '' — ko'rsatilmaydi. */
  phone: string | null
  address: string | null
  /** Pachka sonlari necha marta tanlangani (ko'p ishlatilgani tugmaga chiqadi). */
  packUsage: Record<string, number>
}

export const defaultCfg: BotCfg = {
  sizes: ['39-43', '40-44', '41-45', '44-45-46'],
  colors: ['qora', 'oq', 'jigarrang', 'kulrang', "ko'k", 'zamish'],
  packSizes: [5, 6, 3],
  showPrice: true,
  phone: null,
  address: null,
  packUsage: {},
}

async function getCfg(): Promise<BotCfg> {
  const row = (await db<{ data: Partial<BotCfg> }[]>('settings?id=eq.bot&select=data'))[0]?.data
  return { ...defaultCfg, ...row }
}
const saveCfg = (cfg: BotCfg) =>
  db('settings', { method: 'POST', body: JSON.stringify({ id: 'bot', data: cfg }) }, 'resolution=merge-duplicates')

/**
 * Pachka sonini eslab qoladi: qo'lda 4 marta kiritilgan son tugmalarga chiqadi,
 * tugmalar doim 3 ta — eng kam ishlatilgani chiqib ketadi.
 */
export function learnPackSize(cfg: BotCfg, n: number): BotCfg {
  const usage: Record<string, number> = { ...cfg.packUsage, [n]: (cfg.packUsage[n] ?? 0) + 1 }
  let packSizes = cfg.packSizes
  if (!packSizes.includes(n) && usage[n] >= 4) {
    // Yangisi kiradi, qolganlaridan eng kam ishlatilgani chiqadi (teng bo'lsa — oxirgisi).
    const keep = [...packSizes].sort((a, b) => (usage[b] ?? 0) - (usage[a] ?? 0)).slice(0, 2)
    packSizes = packSizes.filter((x) => keep.includes(x)).concat(n)
  }
  return { ...cfg, packUsage: usage, packSizes }
}

/** "39-43, 40-44  44-45-46" → ro'yxat. */
export const parseList = (t: string) => t.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean).slice(0, 12)

/** Sayt manzili (mini app va loginlar shu domenda). Supabase Secrets → SITE_URL bilan o'zgartiriladi. */
export const siteUrl = () => (env('SITE_URL') || 'https://richmen.netlify.app').replace(/\/+$/, '')
/** Loginlar sayt domenidagi email bo'lib saqlanadi: "ali" → ali@richmen.netlify.app (xat yuborilmaydi). */
export const loginDomain = () => new URL(siteUrl()).hostname
/** Mini app manzili (Admin va Kuzatuvchi paneli bitta — hisob turiga qarab ochiladi). */
export const panelUrl = () => `${siteUrl()}/?boss`

/** Pastdagi menyu. Asosiy admin (ADMIN_IDS dagi birinchi) — loginlarni ham boshqaradi. */
const menu = (owner: boolean) => ({
  reply_markup: {
    keyboard: [
      [{ text: "📦 Yuk qo'shish" }, { text: '⚙️ Sozlamalar' }],
      [{ text: '📊 Panel', web_app: { url: panelUrl() } }, ...(owner ? [{ text: '👥 Loginlar' }] : [])],
    ],
    resize_keyboard: true, is_persistent: true,
  },
})

async function showSettings(chat: number) {
  const c = await getCfg()
  const shop = (await db<{ data: Shop }[]>('settings?id=eq.main&select=data'))[0]?.data ?? {}
  const show = (v: string | null, site?: string) => (v === null ? `${esc(site || '—')} <i>(saytdan)</i>` : v === '' ? "<i>ko'rsatilmaydi</i>" : esc(v))
  return say(chat, [
    '⚙️ <b>Bot sozlamalari</b>',
    '',
    `📏 Razmerlar: ${esc(c.sizes.join(', '))}`,
    `🎨 Ranglar: ${esc(c.colors.join(', '))}`,
    `📦 Pachkada juft: ${c.packSizes.join(', ')}`,
    `💰 Kanalda narx: ${c.showPrice ? "ko'rsatiladi" : "ko'rsatilmaydi"}`,
    `📞 Telefon: ${show(c.phone, shop.shopPhone)}`,
    `📍 Manzil: ${show(c.address, shop.shopAddress)}`,
  ].join('\n'), kb([
    [b('📏 Razmerlar', 'set:sizes'), b('🎨 Ranglar', 'set:colors'), b('📦 Pachka', 'set:packs')],
    [b(c.showPrice ? '💰 Narxni yashirish' : "💰 Narxni ko'rsatish", 'set:price')],
    [b('📞 Telefon', 'set:phone'), b('📍 Manzil', 'set:address')],
    [b('🔄 Kanaldagi postlarni yangilash', 'set:refresh')],
  ]))
}

const SET_PROMPTS: Record<string, string> = {
  sizes: "📏 Razmerlarni vergul bilan yozing.\nMasalan: <code>39-43, 40-44, 41-45, 44-45-46</code>",
  colors: "🎨 Ranglarni vergul bilan yozing.\nMasalan: <code>qora, oq, jigarrang, zamish</code>",
  packs: '📦 Pachkadagi juft sonlarini vergul bilan yozing (3 tagacha).\nMasalan: <code>5, 6, 3</code>',
  phone: "📞 Kanalga yoziladigan telefon(lar)ni yozing. Bir nechta bo'lsa — vergul bilan.\nMasalan: <code>+998 90 111 11 11, +998 91 222 22 22</code>\n<code>-</code> — ko'rsatmaslik, <code>sayt</code> — saytdagini olish.",
  address: "📍 Kanalga yoziladigan manzilni yozing.\n<code>-</code> — ko'rsatmaslik, <code>sayt</code> — saytdagini olish.",
}

/** Sozlamaga javob matnini saqlaydi. Noto'g'ri bo'lsa — false. */
async function applySetting(key: string, text: string): Promise<boolean> {
  const c = await getCfg()
  const t = text.trim()
  if (key === 'sizes' || key === 'colors') {
    const list = parseList(t)
    if (!list.length) return false
    await saveCfg({ ...c, [key]: list })
  } else if (key === 'packs') {
    const list = parseList(t).map((x) => parseInt(x)).filter((n) => n > 0 && n < 100).slice(0, 3)
    if (!list.length) return false
    await saveCfg({ ...c, packSizes: list })
  } else if (key === 'phone' || key === 'address') {
    await saveCfg({ ...c, [key]: t.toLowerCase() === 'sayt' ? null : t === '-' ? '' : t })
  } else return false
  return true
}

// ---------- Suhbat holati ----------

type Step = 'photos' | 'packs' | 'brand' | 'brand_new' | 'model' | 'size' | 'color' | 'packSize' | 'cost' | 'price' | 'confirm' | 'saving' | 'setting'
  | 'login_name' | 'login_pass' | 'auth_idle' | 'auth_login' | 'auth_pass'
interface Session extends Partial<Draft> {
  step: Step; packsPerPhoto?: number; photoCount?: number; setting?: string
  /** Login yaratish / parol almashtirish / botga kirish: login nomi, turi va (almashtirishda) foydalanuvchi id. */
  login?: string; userId?: string; role?: Role
  /** Tahrirlanib boradigan bitta xabar (kirish oynasi yoki kirim kartochkasi). */
  cardId?: number
  /** Noto'g'ri parollar hisobi (botga kirishda). */
  guard?: { fails?: number; locks?: number; lockUntil?: number }
}

const getSession = async (chat: number) =>
  (await db<{ data: Session }[]>(`bot_sessions?chat_id=eq.${chat}&select=data`))[0]?.data ?? null
const setSession = (chat: number, data: Session) =>
  db('bot_sessions', { method: 'POST', body: JSON.stringify({ chat_id: chat, data, updated_at: new Date().toISOString() }) }, 'resolution=merge-duplicates')
async function endSession(chat: number) {
  await db(`bot_sessions?chat_id=eq.${chat}`, { method: 'DELETE' })
  await db(`bot_photos?chat_id=eq.${chat}`, { method: 'DELETE' })
}

async function brandList(): Promise<string[]> {
  const rows = await db<{ data: string }[]>('brands?select=data')
  return [...new Set(rows.map((r) => String(r.data).trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b))
}

const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n))

/** Shu brendda oxirgi ishlatilgan narxlar (tez tanlash tugmalari uchun). */
async function recentPrices(brand: string, field: 'cost_price' | 'sale_price', cost?: number): Promise<number[]> {
  const rows = await db<{ cost_price: number; sale_price: number }[]>(
    `products?select=cost_price,sale_price&brand=ilike.${encodeURIComponent(brand.replace(/[*,()]/g, ''))}&order=created_at.desc&limit=200`,
  ).catch(() => [])
  const pick = (cost ? rows.filter((r) => Number(r.cost_price) === cost) : []).concat(rows)
  return [...new Set(pick.map((r) => Number(r[field])).filter((n) => n > 0))].slice(0, 4)
}

/** Savol kartochkasi: tepasida yig'ilgan javoblar, pastida joriy savol va variantlar. */
async function card(s: Session, note?: string): Promise<{ text: string; rows: Btn[][] }> {
  const done = [
    s.brand && s.step !== 'brand' && s.step !== 'brand_new' && `🏷 Brend: <b>${esc(s.brand)}</b>`,
    s.model && !['brand', 'brand_new', 'model'].includes(s.step) && `👟 Model: <b>${esc(s.model)}</b>`,
    s.size !== undefined && ['color', 'packSize', 'cost', 'price'].includes(s.step) && `📏 Razmer: <b>${esc(s.size || '—')}</b>`,
    s.color !== undefined && ['packSize', 'cost', 'price'].includes(s.step) && `🎨 Rang: <b>${esc(s.color || '—')}</b>`,
    s.packSize && ['cost', 'price'].includes(s.step) && `📦 Pachkada: <b>${s.packSize} juft</b>`,
    s.cost && s.step === 'price' && `💵 Kelish: <b>${formatSum(s.cost)}</b>`,
  ].filter(Boolean) as string[]
  const total = (s.photoCount ?? 0) * (s.packsPerPhoto ?? 1)
  const head = `📦 <b>Yangi kirim</b> · ${s.photoCount} ta rasm${total !== s.photoCount ? ` → ${total} pachka` : ''}`
  let q = ''
  let rows: Btn[][] = []
  switch (s.step) {
    case 'packs':
      q = '📦 Bitta rasm. Bu rasmdagi model <b>nechta pachka</b>?'
      rows = [['1', '2', '3', '5', '10'].map((n) => b(n, `packs:${n}`))]
      break
    case 'brand':
      q = '🏷 <b>Brend</b>ni tanlang:'
      rows = [...chunk((await brandList()).map((x) => b(x, `brand:${x.slice(0, 50)}`)), 3), [b('➕ Yangi brend', 'brand_new')]]
      break
    case 'brand_new':
      q = '✍️ <b>Yangi brend</b> nomini yozing:'
      break
    case 'model':
      q = "✍️ <b>Model nomi</b>ni yozing (masalan: qo'shma):"
      break
    case 'size':
      q = "📏 <b>Razmer</b> — tanlang yoki yozing:"
      rows = chunk((await getCfg()).sizes.map((x) => b(x, `size:${x.slice(0, 40)}`)), 3)
      break
    case 'color':
      q = '🎨 <b>Rang</b> — tanlang yoki yozing:'
      rows = [...chunk((await getCfg()).colors.map((x) => b(x, `color:${x.slice(0, 40)}`)), 3), [b('— Yozmaslik', 'color:')]]
      break
    case 'packSize':
      q = '👟 <b>Pachkada necha juft?</b>'
      rows = [(await getCfg()).packSizes.map((x) => b(String(x), `packSize:${x}`))]
      break
    case 'cost': {
      q = "💵 <b>Kelish narxi</b> (1 juft) — tanlang yoki yozing, masalan 200000.\n<i>Kanalga chiqmaydi.</i>"
      const p = await recentPrices(s.brand ?? '', 'cost_price')
      if (p.length) rows = chunk(p.map((n) => b(formatSum(n), `cost:${n}`)), 2)
      break
    }
    case 'price': {
      q = '💰 <b>Sotuv narxi</b> (1 juft) — tanlang yoki yozing:'
      const p = await recentPrices(s.brand ?? '', 'sale_price', s.cost)
      if (p.length) rows = chunk(p.map((n) => b(formatSum(n), `price:${n}`)), 2)
      break
    }
  }
  return { text: [head, ...(done.length ? ['', ...done] : []), '', ...(note ? [`<i>${note}</i>`] : []), q].join('\n'), rows }
}

/** Kirim savollari bitta xabarda — u har javobdan keyin tahrirlanadi (chat to'lib ketmaydi). */
async function ask(chat: number, s: Session, note?: string) {
  if (s.step === 'confirm') return confirmCard(chat, s, note)
  const { text, rows } = await card(s, note)
  const id = await edit(chat, s.cardId, text, rows.length ? kb(rows) : {})
  if (id !== s.cardId) await setSession(chat, { ...s, cardId: id })
}

/** Yakuniy tekshiruv: kartochka o'rniga — "✅ Tasdiqlash" pastki tugmasi bilan xabar. */
async function confirmCard(chat: number, s: Session, note?: string) {
  const total = (s.photoCount ?? 0) * (s.packsPerPhoto ?? 1)
  const pairs = total * s.packSize!
  await drop(chat, s.cardId)
  const m = await say(chat, [
    '📋 <b>Tekshiring</b>',
    '',
    `👟 ${esc(s.brand!)} ${esc(s.model!)}`,
    `📏 ${esc(s.size || '—')} · 🎨 ${esc(s.color || '—')} · ${s.packSize} juftlik`,
    `📷 ${s.photoCount} ta rasm → <b>${total} pachka</b> (${pairs} juft)`,
    `💵 Kelish: ${formatSum(s.cost!)} · 💰 Sotuv: <b>${formatSum(s.price!)}</b> (1 juft)`,
    `📈 Foyda: <b>${formatSum((s.price! - s.cost!) * s.packSize!)}</b> (1 pachka)`,
    ...(note ? ['', `⚠️ ${note}`] : []),
    '',
    'Tasdiqlasangiz — saytga tushadi va kanalga chiqadi.',
  ].join('\n'), CONFIRM_KB) as { message_id?: number }
  await setSession(chat, { ...s, cardId: m?.message_id })
}

/** Rasmlar tayyor: nechta rasm kelganini aytadi va savollarni boshlaydi. */
async function photosDone(chat: number, s: Session) {
  if (s.step !== 'photos') return
  const n = (await db<{ id: number }[]>(`bot_photos?chat_id=eq.${chat}&select=id`)).length
  if (!n) return say(chat, "Hali rasm yo'q. Rasmlarni yuboring.", PHOTO_KB)
  const ns: Session = { ...s, photoCount: n, step: n === 1 ? 'packs' : 'brand', packsPerPhoto: 1, cardId: undefined }
  await setSession(chat, ns)
  await say(chat, `📷 <b>${n} ta rasm</b> qabul qilindi. Savollarga javob bering 👇`, QA_KB)
  return ask(chat, ns)
}

/** Keyingi qadam. */
function next(s: Session): Step {
  const order: Step[] = ['brand', 'model', 'size', 'color', 'packSize', 'cost', 'price', 'confirm']
  const i = order.indexOf(s.step === 'brand_new' ? 'brand' : s.step)
  return order[i + 1] ?? 'confirm'
}

// ---------- Kirim: bazaga yozish va kanalga joylash ----------

async function commit(chat: number, s: Session): Promise<string> {
  const photos = await db<{ file_id: string }[]>(`bot_photos?chat_id=eq.${chat}&select=file_id&order=id`)
  const per = s.packsPerPhoto ?? 1
  const total = photos.length * per
  if (!photos.length) throw new Error("Rasmlar topilmadi")
  const d: Draft = { brand: s.brand!.trim(), model: s.model!.trim(), size: s.size ?? '', color: s.color ?? '', packSize: s.packSize!, cost: s.cost!, price: s.price! }
  const bk = d.brand.toLowerCase()

  // Band kodlar va nomlar (saytdagi qoida: kod brend ichida, nom umuman takrorlanmaydi).
  const like = (v: string) => encodeURIComponent(v.replace(/[%_*]/g, ''))
  const same = [
    ...await db<{ name: string; brand: string }[]>(`products?select=name,brand&brand=ilike.${like(d.brand)}`),
    ...await db<{ name: string; brand: string }[]>(`products?select=name,brand&name=ilike.${like(d.model)}%20*`),
  ]
  const takenCodes = new Set(same.filter((p) => p.brand.toLowerCase() === bk).map((p) => codeOf(p.name)).filter(Boolean))
  const takenNames = new Set(same.map((p) => p.name.toLowerCase()))

  let seq = (await takeSeq('product', total)) - total
  let last = await takeSeq('brand:' + bk, total)
  const pool = Array.from({ length: total }, (_, i) => last - total + 1 + i)
  const nextCode = async () => {
    for (;;) {
      const n = pool.shift() ?? (last = await takeSeq('brand:' + bk, 1))
      const code = brandCode(n)
      if (!takenCodes.has(code) && !takenNames.has(`${d.model} ${code}`.toLowerCase())) {
        takenCodes.add(code)
        return code
      }
    }
  }

  const number = await takeSeq('batch')
  const batchId = uid()
  const now = new Date().toISOString()
  const products: Record<string, unknown>[] = []
  const groups: { fileId: string; ids: string[]; codes: string[] }[] = []
  for (const ph of photos) {
    const g = { fileId: ph.file_id, ids: [] as string[], codes: [] as string[] }
    for (let k = 0; k < per; k++) {
      const code = await nextCode()
      const id = uid()
      products.push({
        id, brand: d.brand, name: `${d.model} ${code}`, size: d.size, color: d.color, barcode: makeBarcode(++seq),
        pack_size: d.packSize, cost_price: d.cost, sale_price: d.price, stock: d.packSize, created_at: now, batch_id: batchId,
      })
      g.ids.push(id)
      g.codes.push(code)
    }
    groups.push(g)
  }
  await db('products', { method: 'POST', body: JSON.stringify(products) })
  const batch = {
    id: batchId, number, createdAt: now, source: 'bot',
    productIds: products.map((p) => p.id), packs: Object.fromEntries(products.map((p) => [p.id, 1])),
    costTotal: total * d.packSize * d.cost, saleTotal: total * d.packSize * d.price,
  }
  await db('batches', { method: 'POST', body: JSON.stringify({ id: batchId, created_at: now, data: batch }) })
  await db('brands', { method: 'POST', body: JSON.stringify({ id: bk, data: d.brand }) }, 'resolution=ignore-duplicates')

  // Kanalga: har rasm — alohida post.
  const { shop, cfg } = await currentShop()
  const channel = Number(env('CHANNEL_ID'))
  let posted = 0
  for (const g of groups) {
    const code = g.codes.length > 1 ? `${g.codes[0]}–${g.codes[g.codes.length - 1]}` : g.codes[0]
    const caption = postCaption(d, code, shop, g.ids.length, g.ids.length, cfg.showPrice)
    try {
      const m = await tg<{ message_id: number; photo: { file_id: string }[] }>('sendPhoto', { chat_id: channel, photo: g.fileId, caption, parse_mode: 'HTML' })
      await db('channel_posts', { method: 'POST', body: JSON.stringify({
        product_ids: g.ids, chat_id: channel, message_id: m.message_id, file_id: m.photo.at(-1)?.file_id ?? g.fileId,
        caption, batch_id: batchId, packs: g.ids.length, left_packs: g.ids.length,
      }) })
      posted++
    } catch (e) {
      console.error(e)
    }
    await new Promise((r) => setTimeout(r, 350)) // Telegram cheklovi: kanalga sekundiga ~3 ta.
  }
  await endSession(chat)
  const first = products[0].name as string, lastName = products[products.length - 1].name as string
  return [
    `✅ <b>Kirim №${number}</b> saqlandi`,
    `👟 ${esc(d.brand)} · ${total} pachka · kodlar: ${esc(codeOf(first) ?? '')}–${esc(codeOf(lastName) ?? '')}`,
    `📣 Kanalga: ${posted}/${groups.length} ta post`,
    '',
    "🏷 Etiketkalarni saytdan chiqaring: Etiketkalar → Kirim №" + number,
  ].join('\n')
}

// ---------- Sotilganlarni kanaldan olish ----------

interface Post { id: number; product_ids: string[]; chat_id: number; message_id: number; caption: string; packs: number; left_packs: number }

/** Ochiq postlarni tekshiradi: hammasi sotilgani — "Sotilganlar"ga, qisman — "qoldi: N". */
export async function syncSold(): Promise<{ archived: number; updated: number }> {
  const posts = await db<Post[]>('channel_posts?archived_at=is.null&select=id,product_ids,chat_id,message_id,caption,packs,left_packs&limit=500')
  if (!posts.length) return { archived: 0, updated: 0 }
  const ids = [...new Set(posts.flatMap((p) => p.product_ids))]
  const stock = new Map<string, number>()
  for (const part of chunk(ids, 150)) {
    const rows = await db<{ id: string; stock: number }[]>(`products?select=id,stock&id=in.(${part.map((x) => `"${x}"`).join(',')})`)
    rows.forEach((r) => stock.set(r.id, r.stock))
  }
  const sold = Number(env('SOLD_CHANNEL_ID'))
  let archived = 0, updated = 0
  for (const p of posts) {
    const present = p.product_ids.filter((id) => stock.has(id))
    const left = present.filter((id) => stock.get(id)! > 0).length
    if (present.length === 0) {
      // Tovar saytdan o'chirilgan — post ham olinadi (arxivga emas).
      await tg('deleteMessage', { chat_id: p.chat_id, message_id: p.message_id }).catch(() => {})
      await db(`channel_posts?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ archived_at: new Date().toISOString(), left_packs: 0 }) })
      continue
    }
    if (left > 0) {
      if (left !== p.left_packs && p.packs > 1) {
        const caption = p.caption.replace(/🔢 Mavjud: \d+ pachka/, `🔢 Mavjud: ${left} pachka`)
        await tg('editMessageCaption', { chat_id: p.chat_id, message_id: p.message_id, caption, parse_mode: 'HTML' }).catch(() => {})
        await db(`channel_posts?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ left_packs: left }) })
        updated++
      }
      continue
    }
    // Hammasi sotildi: oxirgi sotuv ma'lumoti bilan "Sotilganlar"ga.
    const info = await lastSale(present)
    let soldId: number | null = null
    if (sold) {
      const m = await tg<{ message_id: number }>('copyMessage', {
        chat_id: sold, from_chat_id: p.chat_id, message_id: p.message_id,
        caption: soldCaption(p.caption, info, p.packs), parse_mode: 'HTML',
      }).catch((e) => (console.error(e), null))
      soldId = m?.message_id ?? null
    }
    await tg('deleteMessage', { chat_id: p.chat_id, message_id: p.message_id }).catch(async () => {
      // O'chira olmasa — hech bo'lmasa "SOTILDI" deb belgilaydi.
      await tg('editMessageCaption', { chat_id: p.chat_id, message_id: p.message_id, caption: '❌ <b>SOTILGAN</b>\n\n' + p.caption, parse_mode: 'HTML' }).catch(() => {})
    })
    await db(`channel_posts?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ archived_at: new Date().toISOString(), left_packs: 0, sold_message_id: soldId }) })
    archived++
  }
  return { archived, updated }
}

/** Hozirgi telefon/manzil (bot sozlamasi, bo'lmasa saytdagi). */
async function currentShop(): Promise<{ shop: Shop; cfg: BotCfg }> {
  const site = (await db<{ data: Shop }[]>('settings?id=eq.main&select=data'))[0]?.data ?? {}
  const cfg = await getCfg()
  return { shop: { shopPhone: cfg.phone ?? site.shopPhone, shopAddress: cfg.address ?? site.shopAddress }, cfg }
}

/**
 * Kanaldagi ochiq postlar matnini hozirgi sozlamaga moslash (telefon, manzil, narx, tovar nomi/narxi).
 * Telegram cheklovi sababli sekin (sekundiga ~1 ta) va bir martada ko'pi bilan `limit` ta.
 */
export async function refreshPosts(limit = 90, pause = 1100): Promise<{ edited: number; same: number; left: number }> {
  const posts = await db<Post[]>('channel_posts?archived_at=is.null&select=id,product_ids,chat_id,message_id,caption,packs,left_packs&order=id&limit=1000')
  const { shop, cfg } = await currentShop()
  const ids = [...new Set(posts.map((p) => p.product_ids[0]))]
  const rows = new Map<string, { id: string; brand: string; name: string; size: string; color: string; pack_size: number; sale_price: number }>()
  for (const part of chunk(ids, 150)) {
    const r = await db<{ id: string; brand: string; name: string; size: string; color: string; pack_size: number; sale_price: number }[]>(
      `products?select=id,brand,name,size,color,pack_size,sale_price&id=in.(${part.map((x) => `"${x}"`).join(',')})`,
    )
    r.forEach((x) => rows.set(x.id, x))
  }
  let edited = 0, same = 0, left = 0
  for (const p of posts) {
    const pr = rows.get(p.product_ids[0])
    if (!pr) continue
    const code = p.caption.match(/🔖 Kod: <b>(.*?)<\/b>/)?.[1] ?? codeOf(pr.name) ?? ''
    const own = codeOf(pr.name)
    const model = own ? pr.name.slice(0, -own.length).trim() : pr.name
    const d: Draft = { brand: pr.brand, model, size: pr.size, color: pr.color, packSize: pr.pack_size, cost: 0, price: Number(pr.sale_price) }
    const caption = postCaption(d, code, shop, p.packs, p.left_packs, cfg.showPrice)
    if (caption === p.caption) {
      same++
      continue
    }
    if (edited >= limit) {
      left++
      continue
    }
    const edit = () => tg('editMessageCaption', { chat_id: p.chat_id, message_id: p.message_id, caption, parse_mode: 'HTML' })
    try {
      await edit().catch(async (e: Error) => {
        // "Too Many Requests: retry after N" — kutib, bir marta qayta urinadi.
        const wait = Number(e.message.match(/retry after (\d+)/)?.[1])
        if (!wait) throw e
        await new Promise((r) => setTimeout(r, (wait + 1) * 1000))
        await edit()
      })
    } catch (e) {
      // Post kanalda yo'q yoki matn bir xil — bazadagini baribir yangilaymiz.
      if (!/not modified|not found/i.test(String(e))) {
        console.error(e)
        left++
        continue
      }
    }
    await db(`channel_posts?id=eq.${p.id}`, { method: 'PATCH', body: JSON.stringify({ caption }) })
    edited++
    if (pause) await new Promise((r) => setTimeout(r, pause))
  }
  return { edited, same, left }
}

async function lastSale(productIds: string[]): Promise<SoldInfo | null> {
  for (const id of productIds) {
    const filter = encodeURIComponent(JSON.stringify({ lines: [{ productId: id }] }))
    const rows = await db<{ data: { createdAt: string; number: number; customerName?: string; lines: { productId: string; price: number; total: number; pairs: number }[] } }[]>(
      `sales?select=data&data=cs.${filter}&order=created_at.desc&limit=1`,
    )
    const s = rows[0]?.data
    if (!s) continue
    const ls = s.lines.filter((l) => productIds.includes(l.productId))
    const pairs = ls.reduce((x, l) => x + l.pairs, 0)
    const total = ls.reduce((x, l) => x + (l.total ?? l.price * l.pairs), 0)
    return { at: s.createdAt, price: pairs ? Math.round(total / pairs) : ls[0]?.price ?? 0, pairs, saleNumber: s.number, customer: s.customerName || undefined }
  }
  return null
}

// ---------- Loginlar (Supabase Auth, maxfiy kalit bilan) ----------

async function auth<T = unknown>(path: string, init: RequestInit = {}, bearer = KEY()): Promise<T> {
  const res = await fetch(`${SB()}/auth/v1/${path}`, {
    ...init,
    headers: { apikey: KEY(), Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(body?.msg ?? body?.message ?? body?.error_description ?? `auth ${res.status}`)
  return body as T
}

/**
 * Hisob turi: admin — to'liq sayt (kassa, tovarlar, kirim…) telefonda, mini app ichida;
 * stats — kuzatuvchi: faqat statistika (sotuv, foyda, ombor, nasiya).
 */
export type Role = 'admin' | 'stats'
export const ROLE_NAME: Record<Role, string> = { admin: '🛠 Admin', stats: '📊 Kuzatuvchi' }
/** Eski nomlar: boss → kuzatuvchi, seller → admin. */
export const normRole = (r: unknown): Role | null =>
  r === 'admin' || r === 'seller' ? 'admin' : r === 'stats' || r === 'boss' ? 'stats' : null
const PANEL_NAME: Record<Role, string> = { admin: '🛠 Admin panel', stats: '📊 Kuzatuvchi panel' }

/**
 * Hisob ma'lumoti app_metadata da — uni faqat maxfiy kalit o'zgartira oladi
 * (foydalanuvchi o'zi turini o'zgartira olmaydi).
 */
interface AppMeta { role?: Role; login?: string; tg?: number | null }
interface AuthUser { id: string; email?: string; last_sign_in_at?: string | null; created_at: string; app_metadata?: AppMeta }
type Login = AuthUser & { login: string; role: Role | null; tg: number | null }

export const LOGIN_RE = /^[a-z0-9][a-z0-9_.]{2,19}$/
const loginEmail = (login: string) => `${login}@${loginDomain()}`
/** Bizning loginimizmi (Telegram orqali kirgan adminlar "tg-…" — ular ro'yxatda ko'rinmaydi). */
function asLogin(u: AuthUser): Login | null {
  const [name, domain] = (u.email ?? '').split('@')
  if (domain !== loginDomain() || !LOGIN_RE.test(name)) return null
  return { ...u, login: name, role: normRole(u.app_metadata?.role), tg: Number(u.app_metadata?.tg) || null }
}

export function genPassword(n = 10): string {
  const abc = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
  const bytes = crypto.getRandomValues(new Uint8Array(n))
  const p = [...bytes].map((x) => abc[x % abc.length]).join('')
  return /\d/.test(p) && /[a-z]/i.test(p) ? p : genPassword(n)
}

/** Parol talabi: kamida 8 belgi, harf va raqam, login bilan bir xil emas. Xato matni yoki null. */
export function weakPassword(p: string, login: string): string | null {
  if (p.length < 8) return 'kamida 8 belgi bo\'lsin'
  if (!/\d/.test(p) || !/[a-zA-Zа-яА-Я]/.test(p)) return 'harf va raqam aralash bo\'lsin'
  if (p.toLowerCase().includes(login)) return 'loginni o\'z ichiga olmasin'
  if (/^(.)\1+$/.test(p) || /12345678|qwerty|parol|password/i.test(p)) return 'juda oddiy'
  return null
}

async function listLogins(): Promise<Login[]> {
  const r = await auth<{ users: AuthUser[] }>('admin/users?per_page=1000')
  return r.users.flatMap((u) => asLogin(u) ?? []).sort((a, b) => a.login.localeCompare(b.login))
}

async function ourUser(id: string): Promise<Login | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const u = await auth<AuthUser>(`admin/users/${id}`).catch(() => null)
  return u && asLogin(u)
}

/** Shu Telegram hisobiga bog'langan login (bo'lmasa — null). */
export async function boundLogin(tgId: number): Promise<Login | null> {
  return (await listLogins()).find((u) => u.tg === tgId && u.role) ?? null
}

async function createLogin(login: string, password: string, role: Role): Promise<Login> {
  const u = await auth<AuthUser>('admin/users', {
    method: 'POST',
    body: JSON.stringify({ email: loginEmail(login), password, email_confirm: true, app_metadata: { role, login, tg: null } }),
  })
  await db('staff', { method: 'POST', body: JSON.stringify({ user_id: u.id }) }, 'resolution=ignore-duplicates')
  return asLogin(u)!
}

const setMeta = (u: Login, patch: AppMeta) =>
  auth(`admin/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ app_metadata: { ...u.app_metadata, ...patch } }) })

/** Telegram chatini "chiqqan" holatga qaytaradi: menyu tugmasi, buyruqlar, klaviatura. */
async function resetChat(tgId: number, text: string) {
  await tg('setChatMenuButton', { chat_id: tgId, menu_button: { type: 'default' } }).catch(() => {})
  await tg('deleteMyCommands', { scope: { type: 'chat', chat_id: tgId } }).catch(() => {})
  await say(tgId, `${text}\nQayta kirish: /start`, NO_KB).catch(() => {})
}

/**
 * Parolni almashtirish = hisobni qaytadan yaratish (o'sha login, o'sha tur): eski hisobdagi
 * hamma kirishlar (sayt, mini app, boshqa qurilmalar) darhol bekor bo'ladi.
 */
async function resetPassword(u: Login, password: string): Promise<Login> {
  await auth(`admin/users/${u.id}`, { method: 'DELETE' })
  if (u.tg) await resetChat(u.tg, '🔐 Parolingiz almashtirildi. Yangi parol bilan qayta kiring.')
  return createLogin(u.login, password, u.role ?? 'stats')
}

async function deleteLogin(u: Login) {
  await auth(`admin/users/${u.id}`, { method: 'DELETE' })
  if (u.tg) await resetChat(u.tg, '🚪 Hisobingiz o\'chirildi.')
}

const fmtDay = (iso?: string | null) => (iso ? tashkentStamp(iso).split(', ')[1] : 'hali kirmagan')

async function showLogins(chat: number) {
  const list = await listLogins()
  return say(chat, [
    '👥 <b>Loginlar</b>',
    `${ROLE_NAME.admin} — to'liq sayt (kassa, tovarlar, kirim) telefonda. ${ROLE_NAME.stats} — faqat statistika: sotuv, foyda, ombor, nasiya.`,
    'Saytga ham shu login bilan kiriladi.',
    '',
    ...(list.length
      ? list.map((u) => `• <code>${u.login}</code> — ${u.role ? ROLE_NAME[u.role] : '⚠️ turi tanlanmagan'} · ${u.tg ? '📱 Telegram ulangan' : 'Telegram ulanmagan'} · oxirgi kirish: ${fmtDay(u.last_sign_in_at)}`)
      : ["<i>Hali login yo'q.</i>"]),
  ].join('\n'), kb([
    ...list.map((u) => [b(`🔑 ${u.login}`, `lg:pw:${u.id}`), b(`🔁 turi`, `lg:role:${u.id}`), b(`🗑`, `lg:del:${u.id}`)]),
    [b("➕ Yangi login", 'lg:new')],
  ]))
}

const loginCard = (login: string, password: string, role: Role) => [
  `👤 Login: <code>${login}</code>`,
  `🔑 Parol: <code>${esc(password)}</code>`,
  `🏷 Turi: ${ROLE_NAME[role]}`,
  '',
  `Kirish: botga /start → 🔐 Kirish. Yoki saytda: ${siteUrl()}`,
  role === 'stats' ? "Statistika uchun do'kon PIN kodi ham so'raladi." : "Boshqaruv bo'limlari uchun do'kon PIN kodi so'raladi.",
].filter((x, i, a) => x || i < a.length - 1).join('\n')

/** Login yaratish yoki parolini almashtirish (sessiyadagi holatga qarab). */
async function finishLogin(chat: number, s: Session, password: string, MENU: Record<string, unknown>) {
  const weak = weakPassword(password, s.login!)
  if (weak) return say(chat, `⚠️ Parol ${weak}. Qaytadan yozing yoki 🎲 tugmasini bosing.`)
  try {
    if (s.userId) {
      const old = await ourUser(s.userId)
      if (!old) throw new Error('login topilmadi')
      const u = await resetPassword(old, password)
      await endSession(chat)
      return say(chat, `✅ Parol almashtirildi (eski kirishlar bekor qilindi)\n\n${loginCard(u.login, password, u.role!)}`, MENU)
    }
    await createLogin(s.login!, password, s.role!)
    await endSession(chat)
    return say(chat, `✅ Login yaratildi\n\n${loginCard(s.login!, password, s.role!)}`, MENU)
  } catch (e) {
    await endSession(chat)
    return say(chat, `⚠️ Xato: ${esc(String((e as Error).message ?? e)).slice(0, 300)}`, MENU)
  }
}

// ---------- Botga login/parol bilan kirish (admin va kuzatuvchi hisoblari) ----------

const NO_KB = { reply_markup: { remove_keyboard: true } }

/** Bot xabarini tahrirlash (chat to'lib ketmasin). Xabar topilmasa — yangisini yuboradi; xabar id sini qaytaradi. */
async function edit(chat: number, msgId: number | undefined, text: string, extra: Record<string, unknown> = {}): Promise<number> {
  if (msgId) {
    try {
      await tg('editMessageText', { chat_id: chat, message_id: msgId, text, parse_mode: 'HTML', ...extra })
      return msgId
    } catch (e) {
      if (/not modified/i.test(String(e))) return msgId
    }
  }
  const m = await say(chat, text, extra) as { message_id?: number }
  return m?.message_id ?? 0
}
const drop = (chat: number, msgId?: number) =>
  msgId ? tg('deleteMessage', { chat_id: chat, message_id: msgId }).catch(() => {}) : Promise.resolve()

/** Kirgan foydalanuvchi menyusi: panel (mini app) va chiqish. */
const roleMenu = (role: Role) => ({
  reply_markup: {
    keyboard: [
      [{ text: PANEL_NAME[role], web_app: { url: panelUrl() } }],
      [{ text: '🚪 Chiqish' }],
    ],
    resize_keyboard: true, is_persistent: true,
  },
})

/** Rasm yig'ish paytidagi pastki tugmalar (100–200 ta rasmdan keyin ham ko'rinib turadi). */
const PHOTO_KB = { reply_markup: { keyboard: [[{ text: '✅ Rasmlar tayyor' }], [{ text: '❌ Bekor qilish' }]], resize_keyboard: true, is_persistent: true } }
/** Savollar paytida: variantlar xabar tagida, "qo'lda" va "bekor" — pastda. */
const QA_KB = { reply_markup: { keyboard: [[{ text: "✍️ Qo'lda kiritish" }, { text: '❌ Bekor qilish' }]], resize_keyboard: true, is_persistent: true } }
const CONFIRM_KB = { reply_markup: { keyboard: [[{ text: '✅ Tasdiqlash' }], [{ text: '❌ Bekor qilish' }]], resize_keyboard: true, is_persistent: true } }

const ADMIN_COMMANDS = (owner: boolean) => [
  { command: 'yuk', description: "📦 Yuk qo'shish" },
  { command: 'sozlamalar', description: '⚙️ Sozlamalar' },
  { command: 'bekor', description: '❌ Joriy kirimni bekor qilish' },
  { command: 'sync', description: '🔄 Kanalni yangilash' },
  ...(owner ? [{ command: 'loginlar', description: '👥 Loginlar' }] : []),
]

/** Chatdagi ko'k tugma (Menu o'rnida) — panelni ochadi; "/" menyusida — /logout. */
async function setupChat(tgId: number, label: string, commands: { command: string; description: string }[]) {
  await tg('setChatMenuButton', { chat_id: tgId, menu_button: { type: 'web_app', text: label, web_app: { url: panelUrl() } } }).catch(() => {})
  await tg('setMyCommands', { commands, scope: { type: 'chat', chat_id: tgId } }).catch(() => {})
}

/** Noto'g'ri login yoki parol: 3 marta — 15 daqiqa, keyin 30, 60… (24 soatgacha) kutish. */
export const MAX_TRIES = 3
export const lockMinutes = (locks: number) => Math.min(15 * 2 ** locks, 24 * 60)

interface Guard { fails?: number; locks?: number; lockUntil?: number }

/** Parolni tekshiradi (Supabase o'zi), to'g'ri bo'lsa ochilgan sessiyani darhol yopadi. */
async function checkPassword(login: string, password: string): Promise<Login | null> {
  try {
    const r = await auth<{ access_token: string; user: AuthUser }>('token?grant_type=password', {
      method: 'POST', body: JSON.stringify({ email: loginEmail(login), password }),
    })
    await auth('logout?scope=local', { method: 'POST' }, r.access_token).catch(() => {})
    return asLogin(r.user)
  } catch {
    return null
  }
}

type From = { id: number; first_name?: string; username?: string }
const who = (f: From) => `${esc(f.first_name ?? '')}${f.username ? ` @${esc(f.username)}` : ''} (ID <code>${f.id}</code>)`

/** Admin bo'lmaganlar: kirish, bog'langan hisob menyusi, chiqish. */
async function guestUpdate(u: Update, from: From, chat: number) {
  if (u.callback_query) await tg('answerCallbackQuery', { callback_query_id: u.callback_query.id }).catch(() => {})
  const m = u.message ?? { message_id: undefined }
  const text = u.message?.text?.trim() ?? ''
  const me = await boundLogin(from.id)

  const name = esc(from.first_name || from.username || 'do\'stim')

  if (me) {
    if (u.callback_query) return
    if (text === '🚪 Chiqish' || text === '/logout') {
      await setMeta(me, { tg: null })
      await resetChat(chat, `🚪 Chiqdingiz, ${name}.`)
      return
    }
    return say(chat, [
      `👋 ${name}, siz ${ROLE_NAME[me.role!]} sifatida kirgansiz.`,
      `${PANEL_NAME[me.role!]} — pastdagi tugma yoki chatdagi ko'k tugma orqali ochiladi.`,
      '🚪 Chiqish — hisobdan chiqish.',
    ].join('\n'), roleMenu(me.role!))
  }

  // Butun kirish bitta xabarda: u tahrirlanib boradi, yozilgan login va parol darhol o'chiriladi.
  const s = (await getSession(chat)) ?? { step: 'auth_idle' as Step }
  const g: Guard = s.guard ?? {}
  const left = () => Math.ceil(((g.lockUntil ?? 0) - Date.now()) / 60_000)
  const locked = (g.lockUntil ?? 0) > Date.now()
  const lockedText = () => `⛔ Juda ko'p noto'g'ri urinish. <b>${left()} daqiqa</b>dan keyin qayta urinib ko'ring.`
  const welcome = [
    `👋 <b>Assalomu alaykum, ${name}!</b>`,
    "Bu do'kon boti. Ishlash uchun do'kon egasi bergan <b>login va parol</b> bilan kiring.",
  ].join('\n')
  const KIRISH = kb([[b('🔐 Kirish', 'auth:start')]])
  const BEKOR = kb([[b('❌ Bekor qilish', 'auth:cancel')]])

  /** Noto'g'ri urinish: hisoblanadi, 3 tadan keyin qulf (egasiga xabar). */
  const fail = async (reason: string, step: Step, extra: Partial<Session> = {}) => {
    const fails = (g.fails ?? 0) + 1
    if (fails >= MAX_TRIES) {
      const locks = g.locks ?? 0
      const ng = { fails: 0, locks: locks + 1, lockUntil: Date.now() + lockMinutes(locks) * 60_000 }
      const id = await edit(chat, s.cardId, `⛔ ${MAX_TRIES} marta noto'g'ri. <b>${lockMinutes(locks)} daqiqa</b>dan keyin qayta urinib ko'ring.`)
      await setSession(chat, { step: 'auth_idle', guard: ng, cardId: id })
      const owner = admins()[0]
      if (owner) await say(owner, `⚠️ <b>Shubhali urinish</b>\n${who(from)} ${MAX_TRIES} marta noto'g'ri login/parol kiritdi${s.login ? ` (<code>${esc(s.login)}</code>)` : ''}. ${lockMinutes(locks)} daqiqaga to'xtatildi.`).catch(() => {})
      return
    }
    const id = await edit(chat, s.cardId, `${reason}\nQolgan urinish: <b>${MAX_TRIES - fails}</b>`, BEKOR)
    await setSession(chat, { ...s, ...extra, step, guard: { ...g, fails }, cardId: id })
  }

  if (u.callback_query) {
    const data = u.callback_query.data ?? ''
    const msgId = u.callback_query.message?.message_id
    if (data === 'auth:start') {
      if (locked) return edit(chat, msgId, lockedText())
      await setSession(chat, { step: 'auth_login', guard: g, cardId: msgId })
      return edit(chat, msgId, '👤 <b>Loginingizni yozing:</b>', BEKOR)
    }
    if (data === 'auth:cancel') {
      await setSession(chat, { step: 'auth_idle', guard: g, cardId: msgId })
      return edit(chat, msgId, welcome, KIRISH)
    }
    return
  }

  // Login/parol bosqichida yozilgan har qanday xabar darhol o'chiriladi.
  const typing = s.step === 'auth_login' || s.step === 'auth_pass'
  if (typing && !text.startsWith('/')) await drop(chat, m.message_id)

  if (!typing || !text || text.startsWith('/')) {
    if (locked) return say(chat, lockedText(), NO_KB)
    const id = (await say(chat, welcome, KIRISH) as { message_id?: number })?.message_id
    await drop(chat, s.cardId)
    return setSession(chat, { step: 'auth_idle', guard: g, cardId: id })
  }
  if (locked) return edit(chat, s.cardId, lockedText())

  if (s.step === 'auth_login') {
    const login = text.toLowerCase()
    const exists = LOGIN_RE.test(login) && (await listLogins()).some((x) => x.login === login)
    if (!exists) return fail(`❌ <b>«${esc(text.slice(0, 30))}»</b> degan login topilmadi.\n👤 Loginni qayta yozing:`, 'auth_login')
    await setSession(chat, { ...s, step: 'auth_pass', login })
    return edit(chat, s.cardId, `👤 Login: <b>${login}</b>\n🔑 <b>Parolni yozing:</b>`, BEKOR)
  }

  // auth_pass
  const user = await checkPassword(s.login ?? '', text)
  if (!user) return fail(`👤 Login: <b>${esc(s.login ?? '')}</b>\n❌ Parol noto'g'ri. 🔑 Qayta yozing:`, 'auth_pass')
  if (!user.role) {
    await setSession(chat, { step: 'auth_idle', guard: g, cardId: s.cardId })
    return edit(chat, s.cardId, "⚠️ Bu hisobning turi tanlanmagan. Do'kon egasiga murojaat qiling.", KIRISH)
  }
  // Bitta login — bitta Telegram: avval boshqa Telegramda ochiq bo'lsa, u yerdan chiqariladi.
  if (user.tg && user.tg !== from.id) await resetChat(user.tg, '🚪 Hisobingizga boshqa Telegramdan kirildi — bu yerdan chiqarildingiz.')
  await setMeta(user, { tg: from.id })
  await endSession(chat)
  await setupChat(chat, user.role === 'admin' ? '🛠 Admin' : '📊 Statistika', [{ command: 'logout', description: '🚪 Hisobdan chiqish' }])
  const owner = admins()[0]
  if (owner && owner !== from.id) await say(owner, `🔐 <code>${user.login}</code> (${ROLE_NAME[user.role]}) botga kirdi: ${who(from)}`).catch(() => {})
  // Kirish xabari o'rniga — kutib olish (pastki tugmalar bilan).
  await drop(chat, s.cardId)
  return say(chat, [
    `✅ <b>Xush kelibsiz, ${name}!</b>`,
    `Hisob turi: ${ROLE_NAME[user.role]}`,
    `${PANEL_NAME[user.role]} — pastdagi tugma yoki chatdagi ko'k tugma. Qayta login so'ralmaydi.`,
  ].join('\n'), roleMenu(user.role))
}

// ---------- Mini app (panel) ga kirish ----------

const enc = new TextEncoder()
async function hmac(key: ArrayBuffer, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(data))
}
const hex = (buf: ArrayBuffer) => [...new Uint8Array(buf)].map((x) => x.toString(16).padStart(2, '0')).join('')

/** Telegram mini app ma'lumoti haqiqiymi (bot kaliti bilan imzolangan) — foydalanuvchi id yoki null. */
export async function verifyInitData(initData: string, maxAgeSec = 86_400): Promise<number | null> {
  const p = new URLSearchParams(initData)
  const hash = p.get('hash')
  if (!hash) return null
  p.delete('hash')
  const check = [...p].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')
  const secret = await hmac(enc.encode('WebAppData').buffer as ArrayBuffer, env('BOT_TOKEN'))
  if (hex(await hmac(secret, check)) !== hash) return null
  if (Date.now() / 1000 - Number(p.get('auth_date')) > maxAgeSec) return null
  try {
    return Number(JSON.parse(p.get('user') ?? '{}').id) || null
  } catch {
    return null
  }
}

/**
 * Mini app ochilganda: Telegram imzosi tekshiriladi, keyin bir martalik kirish kaliti beriladi —
 * bot adminlariga ("tg-<id>" hisob) va botda login qilib bog'langan foydalanuvchilarga (o'z hisobi).
 * Boshqalar — kira olmaydi (avval botda kirishi kerak).
 */
export async function tgAuth(initData: string): Promise<{ token_hash?: string; role?: Role | 'owner'; unbound?: boolean; error?: string }> {
  const id = await verifyInitData(initData)
  if (!id) return { error: "Telegram ma'lumoti tasdiqlanmadi" }
  let email: string
  let role: Role | 'owner'
  if (admins().includes(id)) {
    email = `tg-${id}@${loginDomain()}`
    role = 'owner'
    await auth('admin/users', {
      method: 'POST', body: JSON.stringify({ email, password: genPassword(32), email_confirm: true, app_metadata: { telegram_id: id } }),
    }).catch(() => {}) // bor bo'lsa — xato, e'tiborsiz
  } else {
    const u = await boundLogin(id)
    if (!u) return { unbound: true }
    email = u.email!
    role = u.role!
  }
  const link = await auth<{ id: string; hashed_token: string }>('admin/generate_link', {
    method: 'POST', body: JSON.stringify({ type: 'magiclink', email }),
  })
  await db('staff', { method: 'POST', body: JSON.stringify({ user_id: link.id }) }, 'resolution=ignore-duplicates')
  return { token_hash: link.hashed_token, role }
}

// ---------- Telegram yangilanishlari ----------

interface Update {
  message?: { message_id?: number; chat: { id: number; type?: string }; from?: From; text?: string; photo?: { file_id: string }[]; media_group_id?: string }
  callback_query?: { id: string; from: From; data?: string; message?: { chat: { id: number }; message_id: number } }
}

const admins = () => env('ADMIN_IDS').split(/[,\s]+/).filter(Boolean).map(Number)

async function onUpdate(u: Update) {
  const from = u.message?.from?.id ?? u.callback_query?.from.id
  const chat = u.message?.chat.id ?? u.callback_query?.message?.chat.id
  if (!from || !chat) return
  // Faqat shaxsiy chat (guruhlarda bot ishlamaydi).
  if (u.message && u.message.chat.type && u.message.chat.type !== 'private') return
  if (!admins().includes(from)) return guestUpdate(u, (u.message?.from ?? u.callback_query!.from), chat)
  const owner = admins()[0] === from
  const MENU = menu(owner)

  // Tugmalar
  if (u.callback_query) {
    const data = u.callback_query.data ?? ''
    await tg('answerCallbackQuery', { callback_query_id: u.callback_query.id }).catch(() => {})
    const s = await getSession(chat)
    if (data === 'cancel') return cancelFlow(chat, s, MENU)
    // Loginlar (faqat asosiy admin)
    if (data.startsWith('lg:')) {
      if (!owner) return say(chat, '⛔ Loginlarni faqat asosiy admin boshqaradi.')
      if (s && !s.step.startsWith('login_') && s.step !== 'setting') return say(chat, "⚠️ Avval joriy kirimni tugating yoki /bekor deb yozing.")
      const [, act, id] = data.split(':')
      if (act === 'new') {
        await setSession(chat, { step: 'login_name' })
        return say(chat, [
          '🏷 Hisob turini tanlang:',
          `${ROLE_NAME.admin} — to'liq sayt telefonda (kassa, tovarlar, kirim, etiketka).`,
          `${ROLE_NAME.stats} — faqat statistika (sotuv, foyda, ombor, nasiya).`,
        ].join('\n'), kb([[b(ROLE_NAME.admin, 'lg:type:admin'), b(ROLE_NAME.stats, 'lg:type:stats')], [b('❌ Bekor qilish', 'cancel')]]))
      }
      if (act === 'type') {
        if (s?.step !== 'login_name' || (id !== 'admin' && id !== 'stats')) return
        await setSession(chat, { step: 'login_name', role: id })
        return say(chat, `${ROLE_NAME[id]} uchun login yozing: lotin harf va raqam, 3–20 belgi.\nMasalan: <code>ali</code>, <code>sotuvchi1</code>`, kb([[b('❌ Bekor qilish', 'cancel')]]))
      }
      if (act === 'gen') {
        if (s?.step !== 'login_pass') return
        return finishLogin(chat, s, genPassword(), MENU)
      }
      if (act === 'list') return showLogins(chat)
      const user = await ourUser(id ?? '')
      if (!user) return say(chat, 'Bu login topilmadi.')
      if (act === 'role') {
        const role: Role = user.role === 'admin' ? 'stats' : 'admin'
        await setMeta(user, { role })
        if (user.tg) await resetChat(user.tg, `🏷 Hisobingiz turi o'zgardi: ${ROLE_NAME[role]}. Qayta kiring.`).then(() => setMeta({ ...user, app_metadata: { ...user.app_metadata, role } }, { tg: null }))
        await say(chat, `✅ <code>${user.login}</code> endi ${ROLE_NAME[role]}.`)
        return showLogins(chat)
      }
      if (act === 'pw') {
        await setSession(chat, { step: 'login_pass', login: user.login, userId: user.id })
        return say(chat, `🔑 <code>${user.login}</code> uchun yangi parol yozing (kamida 8 belgi, harf va raqam) yoki 🎲 bosing.\nEski parol bilan ochilgan hamma joydan chiqariladi.`, kb([[b('🎲 Parol yaratish', 'lg:gen')], [b('❌ Bekor qilish', 'cancel')]]))
      }
      if (act === 'del') {
        return say(chat, `🗑 <code>${user.login}</code> o'chirilsinmi? U saytdan ham, paneldan ham chiqib ketadi.`, kb([[b("Ha, o'chirish", `lg:delok:${user.id}`), b('Yo\'q', 'lg:list')]]))
      }
      if (act === 'delok') {
        await deleteLogin(user)
        await say(chat, `✅ <code>${user.login}</code> o'chirildi.`)
        return showLogins(chat)
      }
      return showLogins(chat)
    }
    // Sozlamalar
    if (data.startsWith('set:')) {
      const key = data.slice(4)
      if (s && s.step !== 'setting') return say(chat, "⚠️ Avval joriy kirimni tugating yoki /bekor deb yozing.")
      if (key === 'price') {
        const c = await getCfg()
        await saveCfg({ ...c, showPrice: !c.showPrice })
        return showSettings(chat)
      }
      if (key === 'refresh') {
        await say(chat, '🔄 Kanaldagi postlar yangilanmoqda…')
        const r = await refreshPosts()
        return say(chat, [
          `✅ Yangilandi: ${r.edited} ta post${r.same ? ` (${r.same} tasi o'zgarmagan)` : ''}`,
          r.left ? `⏳ Yana ${r.left} ta qoldi — tugmani yana bir bor bosing.` : null,
        ].filter(Boolean).join('\n'))
      }
      if (!SET_PROMPTS[key]) return
      await setSession(chat, { step: 'setting', setting: key })
      return say(chat, SET_PROMPTS[key], kb([[b('❌ Bekor qilish', 'cancel')]]))
    }
    // Eski (tugagan kirimdagi) tugma — jim.
    if (!s) return
    if (data.startsWith('manual:')) return manualInput(chat, s)
    if (data === 'photos_done') return photosDone(chat, s)
    if (data === 'ok' && s.step === 'confirm') return confirmSave(chat, s, MENU)
    if (data === 'brand_new') {
      const ns = { ...s, step: 'brand_new' as Step }
      await setSession(chat, ns)
      return ask(chat, ns)
    }
    const [key, ...rest] = data.split(':')
    const val = rest.join(':')
    const fields: Record<string, (v: string) => Partial<Session> | null> = {
      packs: (v) => (Number(v) > 0 ? { packsPerPhoto: Number(v) } : null),
      brand: (v) => ({ brand: v }),
      size: (v) => ({ size: v }),
      color: (v) => ({ color: v }),
      packSize: (v) => (Number(v) > 0 ? { packSize: Number(v) } : null),
      cost: (v) => (Number(v) > 0 ? { cost: Number(v) } : null),
      price: (v) => (Number(v) > 0 ? { price: Number(v) } : null),
    }
    // Eski xabardagi tugma bosilsa — e'tiborsiz (joriy savolga tegishli emas).
    if (key !== s.step && !(key === 'brand' && s.step === 'brand_new')) return
    const patch = fields[key]?.(val)
    if (!patch) return
    if (key === 'packSize') await saveCfg(learnPackSize(await getCfg(), Number(val)))
    const step: Step = key === 'packs' ? 'brand' : next({ ...s, step: key as Step })
    const ns = { ...s, ...patch, step }
    await setSession(chat, ns)
    return ask(chat, ns, priceWarning(ns))
  }

  const m = u.message!
  const text = m.text?.trim() ?? ''

  if (text === '/start' || text === '/help') {
    await setupChat(chat, '📊 Panel', ADMIN_COMMANDS(owner))
    return say(chat, [
      '👋 <b>Assalomu alaykum!</b>',
      '',
      "📦 <b>Yuk qo'shish</b> — rasmlar yuborib, yangi kirim qilish (tovar saytga tushadi va kanalga chiqadi).",
      "⚙️ <b>Sozlamalar</b> — razmerlar, ranglar, pachka sonlari, kanaldagi narx va telefon.",
      "📊 <b>Panel</b> — statistika (sotuv, foyda, ombor, nasiya) va to'liq sayt telefonda.",
      ...(owner ? ["👥 <b>Loginlar</b> — boshqalarga login/parol berish (🛠 Admin yoki 📊 Kuzatuvchi)."] : []),
      '',
      "/bekor — joriy kirimni bekor qilish · /sync — kanalni yangilash",
    ].join('\n'), MENU)
  }
  if (text === "📦 Yuk qo'shish" || text === '/yuk') {
    const cur = await getSession(chat)
    if (cur && cur.step !== 'photos' && cur.step !== 'setting') return say(chat, '⚠️ Avval joriy kirimni tugating yoki /bekor deb yozing.')
    await endSession(chat)
    await setSession(chat, { step: 'photos' })
    return say(chat, [
      "📷 <b>Rasmlarni yuboring</b>",
      'Bir xil narxdagi pachkalar — har rasm 1 pachka. Bitta rasm yuborsangiz, nechta pachka ekanini so\'rayman.',
      '',
      'Hammasini yuborib bo\'lgach — tugmani bosing:',
    ].join('\n'), PHOTO_KB)
  }
  if (text === '👥 Loginlar' || text === '/loginlar') {
    if (!owner) return say(chat, '⛔ Loginlarni faqat asosiy admin boshqaradi.')
    const cur = await getSession(chat)
    if (cur?.step.startsWith('login_') || cur?.step === 'setting') await endSession(chat)
    return showLogins(chat)
  }
  if (text === '⚙️ Sozlamalar' || text === '/sozlamalar') {
    const cur = await getSession(chat)
    if (cur?.step === 'setting') await endSession(chat)
    return showSettings(chat)
  }
  if (text === '/bekor' || text === '/cancel' || text === '❌ Bekor qilish') {
    await drop(chat, m.message_id)
    return cancelFlow(chat, await getSession(chat), MENU)
  }
  if (text === '✅ Tasdiqlash') {
    await drop(chat, m.message_id)
    const cur = await getSession(chat)
    if (cur?.step !== 'confirm') return
    return confirmSave(chat, cur, MENU)
  }
  if (text === "✍️ Qo'lda kiritish") {
    await drop(chat, m.message_id)
    const cur = await getSession(chat)
    if (!cur) return
    return manualInput(chat, cur)
  }
  if (text === '✅ Rasmlar tayyor') {
    const cur = await getSession(chat)
    if (cur?.step !== 'photos') return say(chat, "Hozir rasm yig'ilmayapti. Yangi kirim: 📦 Yuk qo'shish", MENU)
    return photosDone(chat, cur)
  }
  if (text === '/sync') {
    const r = await syncSold()
    return say(chat, `🔄 Kanal yangilandi: ${r.archived} ta sotilganlarga o'tdi, ${r.updated} ta yangilandi.`)
  }

  // Rasm: yig'ib boriladi (albom rasmlari bir vaqtda keladi).
  if (m.photo?.length) {
    const s = await getSession(chat)
    if (s && s.step !== 'photos') return say(chat, s.step === 'setting' ? '⚠️ Avval sozlamani yozing yoki ❌ Bekor qiling.' : '⚠️ Avval joriy kirimni tugating yoki /bekor deb yozing.')
    await db('bot_photos', { method: 'POST', body: JSON.stringify({ chat_id: chat, file_id: m.photo.at(-1)!.file_id }) })
    // Faqat birinchi rasmga javob (qolganlari jim qo'shiladi).
    const created = await db<unknown[]>('bot_sessions', {
      method: 'POST', body: JSON.stringify({ chat_id: chat, data: { step: 'photos' } }),
    }, 'resolution=ignore-duplicates,return=representation')
    if (created.length) {
      return say(chat, "📷 Yangi kirim boshlandi, rasmlar qabul qilinmoqda… Hammasini yuborib bo'lgach, pastdagi <b>✅ Rasmlar tayyor</b> tugmasini bosing.", PHOTO_KB)
    }
    return
  }

  // Matnli javoblar
  const s = await getSession(chat)
  if (!s) return say(chat, "Yangi kirim: 📦 Yuk qo'shish · Sozlamalar: ⚙️ Sozlamalar", MENU)
  if (s.step === 'login_name') {
    if (!s.role) return say(chat, '🏷 Avval hisob turini tanlang (tugmalardan).')
    const login = text.toLowerCase()
    if (!LOGIN_RE.test(login)) return say(chat, '🤔 Faqat lotin harf, raqam, nuqta yoki _ (3–20 belgi). Qaytadan yozing.')
    if ((await listLogins()).some((u) => u.login === login)) return say(chat, `⚠️ <code>${login}</code> allaqachon bor. Boshqa nom yozing.`)
    await setSession(chat, { step: 'login_pass', login, role: s.role })
    return say(chat, `🔑 <code>${login}</code> uchun parol yozing (kamida 8 belgi, harf va raqam) yoki 🎲 bosing:`, kb([[b('🎲 Parol yaratish', 'lg:gen')], [b('❌ Bekor qilish', 'cancel')]]))
  }
  if (s.step === 'login_pass') {
    // Parol yozilgan xabar chatda qolmasin.
    await tg('deleteMessage', { chat_id: chat, message_id: m.message_id }).catch(() => {})
    return finishLogin(chat, s, text, MENU)
  }
  if (s.step === 'setting') {
    if (!(await applySetting(s.setting ?? '', text))) return say(chat, '🤔 Tushunmadim, qaytadan yozing.')
    await endSession(chat)
    await say(chat, '✅ Saqlandi.', MENU)
    return showSettings(chat)
  }
  // Savollarga yozilgan javob kartochkada ko'rinadi — xabarning o'zi o'chiriladi (chat toza turadi).
  if (QA_STEPS.includes(s.step)) await drop(chat, m.message_id)
  let patch: Partial<Session> | null = null
  switch (s.step) {
    case 'photos': return say(chat, 'Rasmlarni yuborib bo\'lgach pastdagi "✅ Rasmlar tayyor" ni bosing.', PHOTO_KB)
    case 'packs': { const n = parseInt(text); patch = n > 0 && n < 500 ? { packsPerPhoto: n } : null; break }
    case 'brand':
    case 'brand_new': patch = text.length >= 2 ? { brand: text.replace(/\s+/g, ' ') } : null; break
    case 'model': patch = text.length >= 1 ? { model: text.replace(/\s+/g, ' ') } : null; break
    case 'size': patch = { size: text }; break
    case 'color': patch = { color: text === '-' ? '' : text }; break
    case 'packSize': {
      const n = parseInt(text)
      patch = n > 0 && n < 100 ? { packSize: n } : null
      if (patch) await saveCfg(learnPackSize(await getCfg(), n))
      break
    }
    case 'cost': { const v = parseSum(text); patch = v ? { cost: v } : null; break }
    case 'price': { const v = parseSum(text); patch = v ? { price: v } : null; break }
    case 'confirm': return say(chat, 'Pastdagi tugmalardan birini bosing: ✅ Tasdiqlash yoki ❌ Bekor qilish.', CONFIRM_KB)
    case 'saving': return say(chat, '⏳ Saqlanmoqda, biroz kuting…')
  }
  if (!patch) return ask(chat, s, `🤔 «${esc(text.slice(0, 30))}» — tushunmadim, qaytadan yozing.`)
  const step: Step = s.step === 'packs' ? 'brand' : next(s)
  const ns = { ...s, ...patch, step }
  await setSession(chat, ns)
  return ask(chat, ns, priceWarning(ns))
}

/** Kirim savollari bosqichlari (javob xabarlari o'chiriladi). */
const QA_STEPS: Step[] = ['packs', 'brand', 'brand_new', 'model', 'size', 'color', 'packSize', 'cost', 'price']

const priceWarning = (s: Session) =>
  s.step === 'confirm' && s.price! < s.cost! ? `Sotuv narxi kelish narxidan (${formatSum(s.cost!)}) past!` : undefined

/** "✍️ Qo'lda kiritish": joriy savolga matn bilan javob berish. */
async function manualInput(chat: number, s: Session) {
  if (s.step === 'brand') {
    const ns = { ...s, step: 'brand_new' as Step }
    await setSession(chat, ns)
    return ask(chat, ns)
  }
  if (!QA_STEPS.includes(s.step)) return
  return ask(chat, s, '✍️ Javobni yozib yuboring:')
}

/** Bekor qilish: kartochka ham olib tashlanadi. */
async function cancelFlow(chat: number, s: Session | null, MENU: Record<string, unknown>) {
  if (s?.cardId) await drop(chat, s.cardId)
  await endSession(chat)
  return say(chat, "❌ Bekor qilindi. Yangi kirim: 📦 Yuk qo'shish", MENU)
}

/** Tasdiqlash: saytga yozish va kanalga joylash (ikki marta bosilsa ham bir marta). */
async function confirmSave(chat: number, s: Session, MENU: Record<string, unknown>) {
  const won = await db<unknown[]>(`bot_sessions?chat_id=eq.${chat}&data->>step=eq.confirm`, {
    method: 'PATCH', body: JSON.stringify({ data: { ...s, step: 'saving' } }),
  }, 'return=representation')
  if (!won.length) return
  const wait = await edit(chat, s.cardId, '⏳ Saqlanmoqda va kanalga joylanmoqda…')
  try {
    const result = await commit(chat, s)
    await drop(chat, wait)
    return say(chat, result, MENU)
  } catch (e) {
    console.error(e)
    await drop(chat, wait)
    await setSession(chat, { ...s, cardId: undefined })
    return confirmCard(chat, { ...s, cardId: undefined }, `Xato: ${esc(String((e as Error).message ?? e)).slice(0, 200)}. Qaytadan "✅ Tasdiqlash" ni bosing.`)
  }
}

// ---------- HTTP kirish nuqtasi ----------

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Saytdan chaqiruv: faqat kirgan va staff ro'yxatidagi foydalanuvchi. */
async function isStaffRequest(req: Request): Promise<boolean> {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!jwt) return false
  const res = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${jwt}` } })
  if (!res.ok) return false
  const user = await res.json()
  const rows = await db<unknown[]>(`staff?user_id=eq.${user.id}&select=user_id`)
  return rows.length > 0
}

export async function handle(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const url = new URL(req.url)

  // Bir martalik sozlash: brauzerda .../bot?setup=<WEBHOOK_SECRET> ochiladi.
  if (req.method === 'GET' && url.searchParams.get('setup')) {
    if (url.searchParams.get('setup') !== env('WEBHOOK_SECRET')) return new Response('Kalit noto\'g\'ri', { status: 403 })
    const hook = `${SB()}/functions/v1/bot`
    const r = await tg('setWebhook', { url: hook, secret_token: env('WEBHOOK_SECRET'), allowed_updates: ['message', 'callback_query'] })
    await tg('setMyCommands', { commands: [
      { command: 'start', description: '🏠 Boshlash' },
      { command: 'login', description: '🔐 Kirish' },
      { command: 'logout', description: '🚪 Chiqish' },
    ] }).catch(() => {})
    // Hamma uchun oddiy menyu; adminlarga — ko'k "📊 Panel" tugmasi va to'liq buyruqlar.
    await tg('setChatMenuButton', { menu_button: { type: 'default' } }).catch(() => {})
    for (const id of admins()) await setupChat(id, '📊 Panel', ADMIN_COMMANDS(id === admins()[0])).catch(() => {})
    const me = await tg<{ username: string }>('getMe', {})
    return new Response(`✅ Tayyor! Bot @${me.username} ulandi (${JSON.stringify(r)}). Endi botga /start yozing.`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  // Telegram
  const tgSecret = req.headers.get('X-Telegram-Bot-Api-Secret-Token')
  if (tgSecret !== null) {
    if (tgSecret !== env('WEBHOOK_SECRET')) return new Response('forbidden', { status: 403 })
    const work = req.json().then(onUpdate).catch((e) => console.error(e))
    // Telegram'ga darhol javob qaytaramiz (aks holda u xabarni qayta yuboradi), ish fonda davom etadi.
    const rt = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime
    if (rt?.waitUntil) rt.waitUntil(work)
    else await work
    return new Response('ok')
  }

  // Sayt: sotuvdan keyin kanalni yangilash
  if (req.method === 'POST') {
    const body = await req.clone().json().catch(() => ({})) as { action?: string; initData?: string }
    // Mini app: Telegram orqali kirish
    if (body.action === 'tg-auth') {
      const r = await tgAuth(String(body.initData ?? '')).catch((e) => ({ error: String((e as Error).message ?? e) }))
      return new Response(JSON.stringify(r), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    if (!(await isStaffRequest(req))) return new Response('forbidden', { status: 403, headers: cors })
    const r = await syncSold()
    return new Response(JSON.stringify(r), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }
  return new Response('Do\'kon boti ishlayapti', { headers: cors })
}

const D = (globalThis as { Deno?: { serve(h: (r: Request) => Promise<Response>): void } }).Deno
if (D?.serve) D.serve(handle)

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
  /** Botdan ulangan kanallar (bo'lmasa — Supabase Secrets'dagi CHANNEL_ID / SOLD_CHANNEL_ID). */
  channelId?: number | null
  soldChannelId?: number | null
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

const SET_PROMPTS: Record<string, string> = {
  sizes: "📏 Razmerlarni vergul bilan yozing.\nMasalan: <code>39-43, 40-44, 41-45, 44-45-46</code>",
  colors: "🎨 Ranglarni vergul bilan yozing.\nMasalan: <code>qora, oq, jigarrang, zamish</code>",
  packs: '📦 Pachkadagi juft sonlarini vergul bilan yozing (3 tagacha).\nMasalan: <code>5, 6, 3</code>',
  phone: "📞 Kanalga yoziladigan telefon(lar)ni yozing. Bir nechta bo'lsa — vergul bilan.\nMasalan: <code>+998 90 111 11 11, +998 91 222 22 22</code>\n<code>-</code> — ko'rsatmaslik, <code>sayt</code> — saytdagini olish.",
  address: "📍 Kanalga yoziladigan manzilni yozing.\n<code>-</code> — ko'rsatmaslik, <code>sayt</code> — saytdagini olish.",
}

/** Kanallar: avval botdan ulangani, bo'lmasa — Secrets'dagi. */
async function channelIds(): Promise<{ main: number | null; sold: number | null }> {
  const c = await getCfg()
  return {
    main: c.channelId || Number(env('CHANNEL_ID')) || null,
    sold: c.soldChannelId || Number(env('SOLD_CHANNEL_ID')) || null,
  }
}

/** Kanal nomi (bot ko'ra olsa), aks holda id. */
async function channelTitle(id: number | null): Promise<string> {
  if (!id) return "<i>ulanmagan</i>"
  const c = await tg<{ title?: string; username?: string }>('getChat', { chat_id: id }).catch(() => null)
  return c ? `<b>${esc(c.title ?? '')}</b>${c.username ? ` (@${esc(c.username)})` : ''}` : `<code>${id}</code> <i>(bot ko'ra olmayapti)</i>`
}

/**
 * Kanalni ulash: bot shu kanalda admin bo'lishi va post yoza olishi kerak (asosiy kanalda — o'chira ham olishi).
 * Natija: kanal (id, nom) yoki xato matni.
 */
export async function checkChannel(ref: number | string, needDelete: boolean): Promise<{ id: number; title: string } | string> {
  const chat = await tg<{ id: number; title?: string; type: string }>('getChat', { chat_id: ref }).catch(() => null)
  if (!chat) return "Kanal topilmadi. Botni kanalga admin qilib qo'shing va qaytadan urinib ko'ring."
  if (chat.type !== 'channel') return "Bu kanal emas. Kanaldan xabar forward qiling."
  const me = await tg<{ id: number }>('getMe', {})
  const m = await tg<{ status: string; can_post_messages?: boolean; can_edit_messages?: boolean; can_delete_messages?: boolean }>(
    'getChatMember', { chat_id: chat.id, user_id: me.id },
  ).catch(() => null)
  if (!m || (m.status !== 'administrator' && m.status !== 'creator')) return `Bot «${chat.title}» kanalida admin emas. Avval botni kanalga admin qiling.`
  if (m.status === 'administrator' && !m.can_post_messages) return "Botga kanalda «xabar joylash» huquqini bering."
  if (needDelete && m.status === 'administrator' && (!m.can_delete_messages || !m.can_edit_messages)) {
    return "Botga kanalda «tahrirlash» va «o'chirish» huquqlarini ham bering (sotilgan postlar shu bilan olinadi)."
  }
  return { id: chat.id, title: chat.title ?? String(chat.id) }
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
  | 'home' | 'm_settings' | 'm_channels' | 'm_channel_set' | 'm_logins' | 'm_login' | 'm_login_del' | 'm_login_role' | 'm_devices' | 'm_device_del'
  | 'login_type' | 'login_name' | 'login_pass'
  | 'auth_idle' | 'auth_login' | 'auth_pass' | 'pin_old' | 'pin_new' | 'pin_new2'
interface Session extends Partial<Draft> {
  step: Step; packsPerPhoto?: number; photoCount?: number; setting?: string
  /** Login yaratish / parol almashtirish / botga kirish: login nomi, turi va (almashtirishda) foydalanuvchi id. */
  login?: string; userId?: string; role?: Role
  /** Ekran: tahrirlanib boradigan bitta xabar (menyu, kirish oynasi yoki kirim kartochkasi) va uning pastki tugmalari. */
  cardId?: number; kbKey?: string
  /** Kirim savollari paytidagi pastki tugmalar xabari. */
  kbId?: number
  /** PIN almashtirishda: yangi PIN izi (ikkinchi marta tekshirish uchun). */
  pinNew?: string
  /** Qurilmani chiqarishda: qurilma id ('tg' — Telegram, '*' — hammasi). */
  deviceId?: string
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
  return { text: [head, quote(done), ...(note ? [quote([`<i>${note}</i>`])] : []), q].filter(Boolean).join('\n'), rows }
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
  await drop(chat, s.kbId)
  const m = await say(chat, [
    '📋 <b>Tekshiring</b>',
    quote([
      `👟 <b>${esc(s.brand!)} ${esc(s.model!)}</b>`,
      `📏 ${esc(s.size || '—')} · 🎨 ${esc(s.color || '—')} · ${s.packSize} juftlik`,
      `📷 ${s.photoCount} ta rasm → <b>${total} pachka</b> (${pairs} juft)`,
      `💵 Kelish: ${formatSum(s.cost!)} · 💰 Sotuv: <b>${formatSum(s.price!)}</b> (1 juft)`,
      `📈 Foyda: <b>${formatSum((s.price! - s.cost!) * s.packSize!)}</b> (1 pachka)`,
    ]),
    note ? quote([`⚠️ ${note}`]) : '',
    '<i>Tasdiqlasangiz — saytga tushadi va kanalga chiqadi.</i>',
  ].filter(Boolean).join('\n'), CONFIRM_KB) as { message_id?: number }
  await setSession(chat, { ...s, cardId: m?.message_id, kbId: undefined, kbKey: undefined })
}

/** Rasmlar tayyor: nechta rasm kelganini aytadi va savollarni boshlaydi. */
async function photosDone(chat: number, s: Session) {
  if (s.step !== 'photos') return
  const n = (await db<{ id: number }[]>(`bot_photos?chat_id=eq.${chat}&select=id`)).length
  if (!n) return screen(chat, s, { step: 'photos' }, "📷 Hali rasm yo'q. Avval rasmlarni yuboring, keyin <b>✅ Rasmlar tayyor</b>.", PHOTO_KEYS)
  // Rasm yig'ish ekrani o'rniga: pastki tugmalar ("qo'lda", "bekor") xabari va savol kartochkasi.
  await drop(chat, s.cardId)
  const kb = await say(chat, `📷 <b>${n} ta rasm</b> qabul qilindi. Savollarga javob bering 👇`, QA_KB) as { message_id?: number }
  const ns: Session = { ...s, photoCount: n, step: n === 1 ? 'packs' : 'brand', packsPerPhoto: 1, cardId: undefined, kbKey: undefined, kbId: kb?.message_id }
  await setSession(chat, ns)
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
  const channel = (await channelIds()).main
  let posted = 0
  for (const g of channel ? groups : []) {
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
    quote([
      `👟 ${esc(d.brand)} · ${total} pachka · kodlar: ${esc(codeOf(first) ?? '')}–${esc(codeOf(lastName) ?? '')}`,
      channel ? `📣 Kanalga: ${posted}/${groups.length} ta post` : '📣 Kanal ulanmagan — ⚙️ Sozlamalar → 📣 Kanallar',
      `🏷 Etiketka: saytda Etiketkalar → Kirim №${number}`,
    ]),
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
  const sold = (await channelIds()).sold
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
/**
 * Hisob ma'lumoti app_metadata da — uni faqat maxfiy kalit o'zgartira oladi
 * (foydalanuvchi o'zi turini o'zgartira olmaydi).
 */
interface AppMeta {
  role?: Role; login?: string; tg?: number | null
  /** Kuzatuvchining PIN izi (maxfiy kalit bilan), noto'g'ri urinishlar va qulf vaqti. */
  pin?: string | null; pinFails?: number; pinLock?: number
}
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

const setMeta = (u: { id: string; app_metadata?: AppMeta }, patch: AppMeta) =>
  auth(`admin/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ app_metadata: { ...u.app_metadata, ...patch } }) })

/** Telegram chatini "chiqqan" holatga qaytaradi: menyu tugmasi, buyruqlar va kirish ekrani. */
async function resetChat(tgId: number, note: string) {
  await tg('setChatMenuButton', { chat_id: tgId, menu_button: { type: 'default' } }).catch(() => {})
  await tg('deleteMyCommands', { scope: { type: 'chat', chat_id: tgId } }).catch(() => {})
  const s = await getSession(tgId).catch(() => null)
  await screen(tgId, s, { step: 'auth_idle', guard: s?.guard }, `${quote([note])}\n${welcomeText()}`, LOGIN_KEYS).catch(() => {})
}

/**
 * Parolni almashtirish = hisobni qaytadan yaratish (o'sha login, o'sha tur): eski hisobdagi
 * hamma kirishlar (sayt, mini app, boshqa qurilmalar) darhol bekor bo'ladi. PIN ham qaytadan yaratiladi.
 */
async function resetPassword(u: Login, password: string): Promise<Login> {
  await auth(`admin/users/${u.id}`, { method: 'DELETE' })
  if (u.tg) await resetChat(u.tg, '🔐 Parolingiz almashtirildi. Yangi parol bilan qayta kiring.')
  return createLogin(u.login, password, u.role ?? 'stats')
}

async function deleteLogin(u: Login) {
  await auth(`admin/users/${u.id}`, { method: 'DELETE' })
  if (u.tg) await resetChat(u.tg, "🚪 Hisobingiz o'chirildi.")
}

const fmtDay = (iso?: string | null) => (iso ? tashkentStamp(iso).split(', ')[1] : 'hali kirmagan')

// ---------- Kuzatuvchining shaxsiy PIN kodi ----------

export const PIN_RE = /^\d{4,6}$/
const PIN_TRIES = 5

/** PIN izi: maxfiy kalit bilan imzolangan (bazadagi iz bilan PIN ni topib bo'lmaydi). */
const pinHash = async (userId: string, pin: string) =>
  hex(await hmac(enc.encode(`${env('WEBHOOK_SECRET')}:pin`).buffer as ArrayBuffer, `${userId}:${pin}`))

/** PIN to'g'rimi: null — to'g'ri, aks holda xato matni. Noto'g'ri urinishlar sanaladi (5 ta → 15 daqiqa). */
export async function pinCheck(u: { id: string; app_metadata?: AppMeta }, pin: string): Promise<string | null> {
  const m = u.app_metadata ?? {}
  if (!m.pin) return 'PIN hali yaratilmagan'
  if ((m.pinLock ?? 0) > Date.now()) return `Juda ko'p urinish. ${Math.ceil((m.pinLock! - Date.now()) / 60_000)} daqiqadan keyin urinib ko'ring.`
  if (PIN_RE.test(pin) && (await pinHash(u.id, pin)) === m.pin) {
    if (m.pinFails) await setMeta(u, { pinFails: 0 })
    return null
  }
  const fails = (m.pinFails ?? 0) + 1
  if (fails >= PIN_TRIES) {
    await setMeta(u, { pinFails: 0, pinLock: Date.now() + 15 * 60_000 })
    return `${PIN_TRIES} marta noto'g'ri — 15 daqiqa kuting.`
  }
  await setMeta(u, { pinFails: fails })
  return `PIN noto'g'ri. Qolgan urinish: ${PIN_TRIES - fails}`
}

export async function pinSet(u: { id: string; app_metadata?: AppMeta }, pin: string) {
  await setMeta(u, { pin: await pinHash(u.id, pin), pinFails: 0, pinLock: 0 })
}

// ---------- Ekran: pastki tugmalar va bitta yangilanib boradigan xabar ----------

type Key = { text: string; web_app?: { url: string } }
type Keys = Key[][]
const keys = (...rows: (string | Key)[][]): Keys =>
  rows.filter((r) => r.length).map((r) => r.map((x) => (typeof x === 'string' ? { text: x } : x)))
const replyKb = (k: Keys) => ({ reply_markup: { keyboard: k, resize_keyboard: true, is_persistent: true } })

const BACK = '⬅️ Orqaga'
const HOME = '🏠 Menyu'

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

/**
 * Bot "ekrani": har chatda bitta asosiy xabar. Pastdagi tugma bosilganda (yoki javob yozilganda)
 * yozilgan xabar o'chiriladi va ekran yangilanadi: tugmalar o'sha bo'lsa — matn tahrirlanadi,
 * boshqacha bo'lsa — eskisi o'chib, yangisi chiqadi (Telegram pastki tugmalarni tahrirlatmaydi).
 */
async function screen(chat: number, prev: Session | null, next: Session, text: string, k: Keys): Promise<void> {
  const kbKey = JSON.stringify(k)
  let id: number | undefined
  if (prev?.cardId && prev.kbKey === kbKey) {
    try {
      await tg('editMessageText', { chat_id: chat, message_id: prev.cardId, text, parse_mode: 'HTML' })
      id = prev.cardId
    } catch (e) {
      if (/not modified/i.test(String(e))) id = prev.cardId
    }
  }
  if (!id) {
    await drop(chat, prev?.cardId)
    await drop(chat, prev?.kbId)
    const m = await say(chat, text, replyKb(k)) as { message_id?: number }
    id = m?.message_id
  }
  await setSession(chat, { ...next, cardId: id, kbKey, kbId: undefined })
}

/** Telegram iqtibosi (chap chiziqli blok) — xabar ichidagi ma'lumot ajralib, bilinib turadi. Bo'sh chetlar olinadi. */
function quote(lines: string[]): string {
  const l = [...lines]
  while (l.length && !l[0].trim()) l.shift()
  while (l.length && !l[l.length - 1].trim()) l.pop()
  return l.length ? `<blockquote>${l.join('\n')}</blockquote>` : ''
}

/**
 * Ekran matni: tepada (bo'lsa) natija/xato — iqtibosda, keyin sarlavha (birinchi qator),
 * ma'lumotlar — iqtibos ichida, oxiridagi kursiv izoh (<i>…</i>) — iqtibosdan tashqarida.
 */
function page(note: string | undefined, ...lines: (string | false | null | undefined)[]): string {
  const ls = lines.filter((x): x is string => x !== false && x !== null && x !== undefined)
  const [title = '', ...rest] = ls
  while (rest.length && !rest[rest.length - 1].trim()) rest.pop()
  const tail = rest.length && /^<i>[\s\S]*<\/i>$/.test(rest[rest.length - 1]) ? rest.pop()! : ''
  return [note ? quote([note]) : '', title, quote(rest), tail].filter(Boolean).join('\n')
}

/** Rasm yig'ish paytidagi pastki tugmalar (100–200 ta rasmdan keyin ham ko'rinib turadi). */
const PHOTO_KEYS = keys(['✅ Rasmlar tayyor'], ['❌ Bekor qilish'])
/** Savollar paytida: variantlar xabar tagida, "qo'lda" va "bekor" — pastda. */
const QA_KB = replyKb(keys(["✍️ Qo'lda kiritish", '❌ Bekor qilish']))
const CONFIRM_KB = replyKb(keys(['✅ Tasdiqlash'], ['❌ Bekor qilish']))

const ADMIN_COMMANDS = (owner: boolean) => [
  { command: 'start', description: '🏠 Asosiy menyu' },
  { command: 'yuk', description: "📦 Yuk qo'shish" },
  { command: 'sozlamalar', description: '⚙️ Sozlamalar' },
  ...(owner ? [{ command: 'loginlar', description: '👥 Loginlar' }] : []),
  { command: 'bekor', description: '❌ Joriy kirimni bekor qilish' },
  { command: 'sync', description: '🔄 Kanalni yangilash' },
]

/** Chatdagi ko'k tugma (Menu o'rnida) — panelni ochadi; "/" menyusida — buyruqlar. */
async function setupChat(tgId: number, label: string, commands: { command: string; description: string }[]) {
  await tg('setChatMenuButton', { chat_id: tgId, menu_button: { type: 'web_app', text: label, web_app: { url: panelUrl() } } }).catch(() => {})
  await tg('setMyCommands', { commands, scope: { type: 'chat', chat_id: tgId } }).catch(() => {})
}

// ---------- Admin ekranlari: asosiy menyu, sozlamalar, loginlar ----------

const adminKeys = (owner: boolean) => keys(
  ["📦 Yuk qo'shish", '⚙️ Sozlamalar'],
  [{ text: '📊 Panel', web_app: { url: panelUrl() } }, ...(owner ? ['👥 Loginlar'] : [])],
)

async function homeScreen(chat: number, prev: Session | null, owner: boolean, note?: string) {
  return screen(chat, prev, { step: 'home' }, page(note,
    '🏠 <b>Asosiy menyu</b>',
    '',
    "📦 <b>Yuk qo'shish</b> — rasm yuborib yangi kirim",
    '⚙️ <b>Sozlamalar</b> — razmer, rang, pachka, narx, telefon',
    "📊 <b>Panel</b> — statistika va to'liq sayt",
    owner && '👥 <b>Loginlar</b> — boshqalarga kirish berish',
  ), adminKeys(owner))
}

const SETTING_BTN: Record<string, string> = {
  '📏 Razmerlar': 'sizes', '🎨 Ranglar': 'colors', '📦 Pachka': 'packs', '📞 Telefon': 'phone', '📍 Manzil': 'address',
}
const PRICE_ON = "💰 Narxni ko'rsatish"
const PRICE_OFF = '🙈 Narxni yashirish'
const REFRESH = '🔄 Kanal postlarini yangilash'

async function settingsScreen(chat: number, prev: Session | null, note?: string) {
  const c = await getCfg()
  const shop = (await db<{ data: Shop }[]>('settings?id=eq.main&select=data'))[0]?.data ?? {}
  const show = (v: string | null, site?: string) =>
    v === null ? `${esc(site || '—')} <i>(saytdan)</i>` : v === '' ? "<i>ko'rsatilmaydi</i>" : esc(v)
  return screen(chat, prev, { step: 'm_settings' }, page(note,
    '⚙️ <b>Bot sozlamalari</b>',
    '',
    `📏 Razmerlar:  <b>${esc(c.sizes.join(', '))}</b>`,
    `🎨 Ranglar:  <b>${esc(c.colors.join(', '))}</b>`,
    `📦 Pachkada juft:  <b>${c.packSizes.join(', ')}</b>`,
    `💰 Kanalda narx:  <b>${c.showPrice ? "ko'rsatiladi" : 'yashirilgan'}</b>`,
    `📞 Telefon:  ${show(c.phone, shop.shopPhone)}`,
    `📍 Manzil:  ${show(c.address, shop.shopAddress)}`,
    `📣 Kanal:  ${await channelTitle((await channelIds()).main)}`,
    '',
    "<i>O'zgartirish uchun pastdagi tugmani bosing.</i>",
  ), keys(['📏 Razmerlar', '🎨 Ranglar', '📦 Pachka'], [c.showPrice ? PRICE_OFF : PRICE_ON, '📞 Telefon', '📍 Manzil'], [CHANNELS, REFRESH], [BACK]))
}

const CHANNELS = '📣 Kanallar'
const CH_MAIN = '📣 Asosiy kanal'
const CH_SOLD = '✅ Sotilganlar kanali'

async function channelsScreen(chat: number, prev: Session | null, note?: string) {
  const ch = await channelIds()
  return screen(chat, prev, { step: 'm_channels' }, page(note,
    '📣 <b>Kanallar</b>',
    '',
    `📣 Asosiy kanal:  ${await channelTitle(ch.main)}`,
    '      <i>yangi yuk shu yerga post bo\'lib chiqadi</i>',
    `✅ Sotilganlar:  ${await channelTitle(ch.sold)}`,
    '      <i>sotilgan post shu yerga ko\'chadi</i>',
    '',
    "<i>O'zgartirish uchun tugmani bosing.</i>",
  ), keys([CH_MAIN, CH_SOLD], [BACK]))
}

const channelAsk = (chat: number, prev: Session | null, which: 'main' | 'sold', note?: string) =>
  screen(chat, prev, { step: 'm_channel_set', setting: which }, page(note,
    which === 'main' ? '📣 <b>Asosiy kanal</b>' : '✅ <b>Sotilganlar kanali</b>',
    '',
    "1️⃣ Botni kanalga <b>admin</b> qiling (xabar joylash, tahrirlash, o'chirish huquqlari bilan).",
    "2️⃣ Kanaldagi istalgan xabarni shu yerga <b>forward</b> qiling.",
    '<i>Yoki kanal manzilini yozing: @kanal_nomi</i>',
  ), keys(['🚫 Kanalni uzish'], [BACK]))

/** Forward qilingan xabardan yoki yozilgan @nom / -100… dan kanal. */
function channelRef(m: NonNullable<Update['message']>): number | string | null {
  const f = m.forward_origin?.type === 'channel' ? m.forward_origin.chat?.id : m.forward_from_chat?.id
  if (f) return f
  const t = m.text?.trim() ?? ''
  if (/^@[A-Za-z0-9_]{4,}$/.test(t)) return t
  if (/^-100\d{5,}$/.test(t)) return Number(t)
  const link = t.match(/^(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]{4,})\/?$/)
  return link ? `@${link[1]}` : null
}

// ---------- Hisoblar ro'yxati: loginlar, email hisoblar, bot adminlari ----------

/**
 * Hisob turlari ro'yxatda:
 * - login — bot bergan login (🛠 Admin yoki 📊 Kuzatuvchi);
 * - email — saytda email bilan kiradigan hisob (Supabase'da qo'lda yaratilgan, masalan egasining gmail'i) — to'liq kirish;
 * - tg — bot admini (ADMIN_IDS) mini app'ga kirganda o'zi yaratiladigan "tg-<id>" hisob.
 */
type Kind = 'login' | 'email' | 'tg'
interface Account extends AuthUser { kind: Kind; label: string; icon: string; login: string; role: Role | null; tg: number | null; staff: boolean }

function asAccount(u: AuthUser, staff: Set<string>): Account {
  const base = { staff: staff.has(u.id) }
  const l = asLogin(u)
  if (l) return { ...l, ...base, kind: 'login', label: l.login, icon: '👤' }
  const [name, domain] = (u.email ?? '').split('@')
  if (domain === loginDomain() && /^tg-\d+$/.test(name)) {
    return { ...u, ...base, kind: 'tg', label: name.slice(3), icon: '🤖', login: name, role: null, tg: Number(name.slice(3)) }
  }
  return { ...u, ...base, kind: 'email', label: u.email ?? u.id, icon: '📧', login: u.email ?? u.id, role: null, tg: null }
}

async function listAccounts(): Promise<Account[]> {
  const [r, staffRows] = await Promise.all([
    auth<{ users: AuthUser[] }>('admin/users?per_page=1000'),
    db<{ user_id: string }[]>('staff?select=user_id'),
  ])
  const staff = new Set(staffRows.map((x) => x.user_id))
  const order: Record<Kind, number> = { email: 0, tg: 1, login: 2 }
  return r.users.map((u) => asAccount(u, staff)).sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label))
}

async function accountById(id: string): Promise<Account | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null
  const u = await auth<AuthUser>(`admin/users/${id}`).catch(() => null)
  if (!u) return null
  const staff = await db<{ user_id: string }[]>(`staff?user_id=eq.${id}&select=user_id`)
  return asAccount(u, new Set(staff.map((x) => x.user_id)))
}

const kindName = (a: Account) =>
  a.kind === 'login' ? (a.role ? ROLE_NAME[a.role] : '⚠️ turi tanlanmagan')
    : a.kind === 'email' ? "👑 Email hisob — to'liq kirish"
      : '🤖 Bot admini (Telegram orqali)'

const accButton = (a: Account) => `${a.icon} ${a.label}`

async function loginsScreen(chat: number, prev: Session | null, note?: string) {
  const list = await listAccounts()
  const block = (title: string, items: Account[], line: (a: Account) => string) =>
    items.length ? [title, ...items.map(line), ''] : []
  return screen(chat, prev, { step: 'm_logins' }, page(note,
    `👥 <b>Hisoblar</b> · ${list.length} ta`,
    '',
    ...block('📧 <b>Email hisoblar</b> (saytga email bilan)', list.filter((a) => a.kind === 'email'),
      (a) => `   ${esc(a.label)}${a.staff ? '' : ' · ⛔ ruxsatsiz'} · 🕓 ${fmtDay(a.last_sign_in_at)}`),
    ...block('🤖 <b>Bot adminlari</b> (Telegram orqali)', list.filter((a) => a.kind === 'tg'),
      (a) => `   ID ${a.label} · 🕓 ${fmtDay(a.last_sign_in_at)}`),
    ...block('👤 <b>Loginlar</b> (bot bergan)', list.filter((a) => a.kind === 'login'),
      (a) => `   <b>${a.label}</b> — ${kindName(a)} · ${a.tg ? '📱 ulangan' : '📵 ulanmagan'}`),
    list.some((a) => a.kind === 'login') ? '' : "<i>Hali login yo'q.</i>\n",
    `${ROLE_NAME.admin} — to'liq sayt telefonda · ${ROLE_NAME.stats} — faqat statistika`,
    '',
    "<i>Hisobni tanlang yoki yangi login qo'shing.</i>",
  ), keys(...chunk(list.map(accButton), 2), ['➕ Yangi login'], [BACK]))
}

async function loginScreen(chat: number, prev: Session | null, a: Account, note?: string) {
  const devices = await activeDevices(a.id)
  return screen(chat, prev, { step: 'm_login', userId: a.id, login: a.login }, page(note,
    `${a.icon} <b>${esc(a.label)}</b>`,
    '',
    `🏷 Turi:  ${kindName(a)}`,
    a.kind === 'login' && `📱 Telegram:  ${a.tg ? `ulangan (ID ${a.tg})` : 'ulanmagan'}`,
    a.role === 'stats' && `🔢 PIN:  ${a.app_metadata?.pin ? "o'rnatilgan" : 'hali yaratilmagan'}`,
    `💻 Qurilmalar:  ${devices.length} ta`,
    !a.staff && "⛔ Do'konga ruxsati yo'q",
    `🕓 Oxirgi kirish:  ${fmtDay(a.last_sign_in_at)}`,
    `📅 Yaratilgan:  ${fmtDay(a.created_at)}`,
  ), a.kind === 'login'
    ? keys(['🔑 Parolni almashtirish', '🔁 Turini almashtirish'], ['📱 Qurilmalar', ...(a.role === 'stats' ? ['🔢 PIN reset'] : [])], ["🗑 O'chirish"], [BACK])
    : a.kind === 'email'
      ? keys(['🔑 Parolni almashtirish', '📱 Qurilmalar'], [BACK])
      : keys(['📱 Qurilmalar'], [BACK]))
}

// ---------- Qurilmalar (sayt va mini app ochilgan joylar) ----------

interface DeviceRow { id: string; name: string; last_seen: string; created_at: string }

const activeDevices = (userId: string) =>
  db<DeviceRow[]>(`devices?user_id=eq.${userId}&revoked=eq.false&select=id,name,last_seen,created_at&order=last_seen.desc`).catch(() => [] as DeviceRow[])

/** Qurilmani chiqarish: sayt uni ko'rib (darhol yoki 15 soniyada) hisobdan chiqadi. */
const revokeDevices = (userId: string, deviceId?: string) =>
  db(`devices?user_id=eq.${userId}${deviceId ? `&id=eq.${encodeURIComponent(deviceId)}` : ''}`, { method: 'PATCH', body: JSON.stringify({ revoked: true }) })

async function devicesScreen(chat: number, prev: Session | null, a: Account, note?: string) {
  const list = await activeDevices(a.id)
  const tgBound = Boolean(a.kind === 'login' && a.tg)
  return screen(chat, prev, { step: 'm_devices', userId: a.id, login: a.login }, page(note,
    `📱 <b>Qurilmalar</b> · ${a.icon} ${esc(a.label)}`,
    '',
    tgBound && `🤖 <b>Telegram bot</b> — ulangan (ID ${a.tg})`,
    tgBound && '',
    ...(list.length
      ? list.map((d, i) => `${i + 1}. ${/telegram/i.test(d.name) ? '📱' : '💻'} <b>${esc(d.name)}</b>\n      🕓 oxirgi faollik: ${tashkentStamp(d.last_seen).split(', ')[1]}`)
      : ["<i>Saytda ochiq qurilma yo'q.</i>"]),
    '',
    "<i>Chiqarilgan qurilma darhol hisobdan chiqadi.</i>",
  ), keys(
    tgBound ? ['🚪 Telegramdan uzish'] : [],
    ...chunk(list.map((_, i) => `🚪 ${i + 1}`), 4),
    list.length + (tgBound ? 1 : 0) > 1 ? ['🚪 Hammasidan chiqarish'] : [],
    [BACK],
  ))
}

/** Chiqarishni tasdiqlash ekrani. deviceId: qurilma id, 'tg' — Telegram, '*' — hammasi. */
async function deviceAskScreen(chat: number, prev: Session | null, a: Account, deviceId: string) {
  const list = await activeDevices(a.id)
  const what = deviceId === '*' ? 'hamma qurilmadan' + (a.kind === 'login' && a.tg ? ' va Telegramdan' : '')
    : deviceId === 'tg' ? 'Telegram botdan'
      : `«${esc(list.find((d) => d.id === deviceId)?.name ?? 'qurilma')}» dan`
  return screen(chat, prev, { step: 'm_device_del', userId: a.id, login: a.login, deviceId }, page(undefined,
    `🚪 <b>${esc(a.label)}</b> ${what} chiqarilsinmi?`,
    '',
    deviceId === 'tg' || deviceId === '*' ? "<i>Botda qayta kirish uchun login va parol kerak bo'ladi.</i>" : '<i>U yerda qayta kirish uchun parol kerak bo\'ladi.</i>',
  ), keys(['✅ Ha, chiqarish'], [BACK]))
}

async function doRevoke(a: Account, deviceId: string) {
  if (deviceId === 'tg' || deviceId === '*') {
    if (a.kind === 'login' && a.tg) {
      await setMeta(a, { tg: null })
      await resetChat(a.tg, '🚪 Hisobingizdan chiqarildingiz.')
    }
  }
  if (deviceId === '*') return revokeDevices(a.id)
  if (deviceId !== 'tg') {
    // Telegram ichidagi qurilma (mini app) — login bo'lsa Telegram bog'lanishi ham uziladi, aks holda u yana kirib qoladi.
    const d = (await activeDevices(a.id)).find((x) => x.id === deviceId)
    if (d && /telegram/i.test(d.name) && a.kind === 'login' && a.tg) {
      await setMeta(a, { tg: null })
      await resetChat(a.tg, '🚪 Hisobingizdan chiqarildingiz.')
    }
    return revokeDevices(a.id, deviceId)
  }
}

const roleAskScreen = (chat: number, prev: Session | null, a: Account) => {
  const next: Role = a.role === 'admin' ? 'stats' : 'admin'
  return screen(chat, prev, { step: 'm_login_role', userId: a.id, login: a.login }, page(undefined,
    `🔁 <b>${a.label}</b> — turini almashtirish`,
    '',
    `Hozir:  ${a.role ? ROLE_NAME[a.role] : '—'}`,
    `Yangi:  ${ROLE_NAME[next]}`,
    '',
    next === 'admin' ? "🛠 Admin — to'liq sayt (kassa, tovarlar, kirim) telefonda." : '📊 Kuzatuvchi — faqat statistika, kassaga kira olmaydi.',
    "<i>U botda qayta kirishi kerak bo'ladi.</i>",
  ), keys([`✅ Ha, ${ROLE_NAME[next]} qilish`], [BACK]))
}

const loginTypeScreen = (chat: number, prev: Session | null) =>
  screen(chat, prev, { step: 'login_type' }, page(undefined,
    '➕ <b>Yangi login</b>',
    '',
    'Hisob turini tanlang:',
    `${ROLE_NAME.admin} — to'liq sayt telefonda (kassa, tovarlar, kirim, etiketka)`,
    `${ROLE_NAME.stats} — faqat statistika (sotuv, foyda, ombor, nasiya)`,
  ), keys([ROLE_NAME.admin, ROLE_NAME.stats], [BACK]))

const loginNameScreen = (chat: number, prev: Session | null, role: Role, note?: string) =>
  screen(chat, prev, { step: 'login_name', role }, page(note,
    `➕ <b>Yangi login</b> · ${ROLE_NAME[role]}`,
    '',
    '👤 Login yozing: lotin harf va raqam, 3–20 belgi.',
    'Masalan: <code>ali</code>, <code>sotuvchi1</code>',
  ), keys([BACK]))

const loginPassScreen = (chat: number, prev: Session | null, next: Session, note?: string) =>
  screen(chat, prev, { ...next, step: 'login_pass' }, page(note,
    next.userId ? `🔑 <b>${esc(next.login ?? '')}</b> — yangi parol` : `➕ <b>Yangi login</b> · ${ROLE_NAME[next.role!]}`,
    '',
    `👤 Login:  <code>${esc(next.login ?? '')}</code>`,
    '🔑 Parol yozing (kamida 8 belgi, harf va raqam) yoki 🎲 bosing.',
    next.userId ? '<i>Eski parol bilan ochilgan hamma joydan chiqariladi.</i>' : '',
  ), keys(['🎲 Parol yaratish'], [BACK]))

const loginCard = (login: string, password: string, role: Role) => [
  `🔐 <b>Kirish ma'lumoti</b>`,
  quote([
    `👤 Login:  <code>${login}</code>`,
    `🔑 Parol:  <code>${esc(password)}</code>`,
    `🏷 Turi:  ${ROLE_NAME[role]}`,
  ]),
  quote([
    `🤖 Botda: /start → 🔐 Kirish`,
    `💻 Saytda: ${siteUrl()}`,
    ...(role === 'stats' ? ["🔢 Birinchi kirishda o'z PIN kodingizni yaratasiz."] : []),
  ]),
].join('\n')

/** Login yaratish yoki parolini almashtirish. Kirish ma'lumoti alohida xabar (egasiga yuborish uchun). */
async function finishLogin(chat: number, s: Session, password: string) {
  const weak = weakPassword(password, s.login!.split('@')[0])
  if (weak) return loginPassScreen(chat, s, s, `⚠️ Parol ${weak}. Qaytadan yozing yoki 🎲 bosing.`)
  try {
    if (s.userId) {
      const acc = await accountById(s.userId)
      if (!acc) throw new Error('hisob topilmadi')
      if (acc.kind === 'email') {
        // Email hisob (masalan egasining gmail'i): o'sha hisob qoladi, parol o'zgaradi, saytdagi qurilmalar chiqariladi.
        await auth(`admin/users/${acc.id}`, { method: 'PUT', body: JSON.stringify({ password }) })
        await revokeDevices(acc.id)
        await say(chat, `🔐 <b>Yangi parol</b>\n${quote([`📧 ${esc(acc.label)}`, `🔑 <code>${esc(password)}</code>`])}`)
        return loginScreen(chat, { ...s, cardId: undefined }, acc, "✅ Parol almashtirildi — saytdagi hamma qurilmalardan chiqarildi. Yangi parol yuqorida.")
      }
      const old = await ourUser(s.userId)
      if (!old) throw new Error('login topilmadi')
      const u = await resetPassword(old, password)
      await say(chat, loginCard(u.login, password, u.role!))
      const nu = await accountById(u.id)
      return nu
        ? loginScreen(chat, { ...s, cardId: undefined }, nu, '✅ Parol almashtirildi — eski kirishlar bekor qilindi. Yangi ma\'lumot yuqorida.')
        : loginsScreen(chat, { ...s, cardId: undefined })
    }
    await createLogin(s.login!, password, s.role!)
    await say(chat, loginCard(s.login!, password, s.role!))
    return loginsScreen(chat, { ...s, cardId: undefined }, `✅ <b>${s.login}</b> yaratildi. Kirish ma'lumoti yuqorida — egasiga yuboring.`)
  } catch (e) {
    return loginsScreen(chat, s, `⚠️ Xato: ${esc(String((e as Error).message ?? e)).slice(0, 200)}`)
  }
}

// ---------- Botga login/parol bilan kirish (admin va kuzatuvchi hisoblari) ----------

const LOGIN_KEYS = keys(['🔐 Kirish'])
const PANEL_NAME: Record<Role, string> = { admin: '🛠 Admin panel', stats: '📊 Kuzatuvchi panel' }
const PIN_BTN = "🔢 PIN kodni o'zgartirish"
const roleKeys = (role: Role) => keys(
  [{ text: PANEL_NAME[role], web_app: { url: panelUrl() } }],
  role === 'stats' ? [PIN_BTN, '🚪 Chiqish'] : ['🚪 Chiqish'],
)

const welcomeText = (name?: string) => [
  `👋 <b>Assalomu alaykum${name ? `, ${name}` : ''}!</b>`,
  quote(["Bu do'kon boti. Ishlash uchun do'kon egasi bergan <b>login va parol</b> bilan kiring."]),
  '👇 <b>🔐 Kirish</b> tugmasini bosing.',
].join('\n')

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
const whoLines = (f: From) => [
  `🙍 ${esc(f.first_name ?? '')}${f.username ? ` (@${esc(f.username)})` : ''}`,
  `🆔 <code>${f.id}</code>`,
]

/** Kirgan foydalanuvchining ekrani. */
const roleHome = (chat: number, prev: Session | null, me: Login, name: string, note?: string) =>
  screen(chat, prev, { step: 'home' }, page(note,
    `👋 <b>${name}</b>`,
    '',
    `🏷 Hisob:  ${ROLE_NAME[me.role!]}`,
    '',
    `${PANEL_NAME[me.role!]} — pastdagi tugma yoki chatdagi ko'k tugma.`,
    me.role === 'stats' && `${PIN_BTN} — /changepass`,
    '🚪 Chiqish — /logout',
  ), roleKeys(me.role!))

const pinScreen = (chat: number, prev: Session | null, step: Step, note?: string, extra: Partial<Session> = {}) =>
  screen(chat, prev, { ...extra, step, guard: prev?.guard }, page(note,
    '🔢 <b>PIN kodni o\'zgartirish</b>',
    '',
    step === 'pin_old' ? '🔒 Hozirgi PIN kodni yozing:' : step === 'pin_new' ? '🆕 Yangi PIN kod (4–6 raqam):' : '🔁 Yangi PIN kodni takrorlang:',
    '<i>Yozganingiz darhol o\'chiriladi.</i>',
  ), keys([BACK]))

/** Admin bo'lmaganlar: kirish, bog'langan hisob menyusi, PIN, chiqish. Hamma narsa — pastki tugmalar va bitta ekran. */
async function guestUpdate(u: Update, from: From, chat: number) {
  if (u.callback_query) {
    await tg('answerCallbackQuery', { callback_query_id: u.callback_query.id }).catch(() => {})
    return
  }
  const m = u.message!
  const text = m.text?.trim() ?? ''
  // Foydalanuvchi yozgan har qanday xabar (tugma, login, parol, PIN) darhol o'chiriladi — ekran yangilanadi.
  await drop(chat, m.message_id)
  const name = esc(from.first_name || from.username || "do'stim")
  const s = await getSession(chat)
  const me = await boundLogin(from.id)

  if (me) {
    if (text === '🚪 Chiqish' || text === '/logout') {
      await setMeta(me, { tg: null })
      await tg('setChatMenuButton', { chat_id: chat, menu_button: { type: 'default' } }).catch(() => {})
      await tg('deleteMyCommands', { scope: { type: 'chat', chat_id: chat } }).catch(() => {})
      return screen(chat, s, { step: 'auth_idle', guard: s?.guard }, page(`🚪 Chiqdingiz, ${name}.`, welcomeText()), LOGIN_KEYS)
    }
    const step = s?.step
    const inPin = step === 'pin_old' || step === 'pin_new' || step === 'pin_new2'
    if (text === BACK || text === '/start' || (!inPin && text !== PIN_BTN && text !== '/changepass')) return roleHome(chat, s, me, name)
    if (me.role !== 'stats') return roleHome(chat, s, me, name, "ℹ️ PIN kod faqat kuzatuvchi hisobda.")
    if (text === PIN_BTN || text === '/changepass') return pinScreen(chat, s, me.app_metadata?.pin ? 'pin_old' : 'pin_new')
    if (step === 'pin_old') {
      const err = await pinCheck(me, text)
      return err ? pinScreen(chat, s, 'pin_old', `❌ ${err}`) : pinScreen(chat, s, 'pin_new', '✅ To\'g\'ri.')
    }
    if (!PIN_RE.test(text)) return pinScreen(chat, s, step!, '⚠️ PIN — 4 dan 6 tagacha raqam.', { pinNew: s?.pinNew })
    if (step === 'pin_new') return pinScreen(chat, s, 'pin_new2', undefined, { pinNew: await pinHash(me.id, text) })
    if (s?.pinNew !== (await pinHash(me.id, text))) return pinScreen(chat, s, 'pin_new', '❌ Bir xil emas — qaytadan.')
    await pinSet(me, text)
    return roleHome(chat, s, me, name, "✅ PIN kod o'zgartirildi.")
  }

  // Kirmagan foydalanuvchi.
  const g: Guard = s?.guard ?? {}
  const locked = (g.lockUntil ?? 0) > Date.now()
  const idle = () => screen(chat, s, { step: 'auth_idle', guard: g }, welcomeText(name), LOGIN_KEYS)
  if (locked) {
    return screen(chat, s, { step: 'auth_idle', guard: g },
      `⛔ Juda ko'p noto'g'ri urinish.\n\n⏳ <b>${Math.ceil((g.lockUntil! - Date.now()) / 60_000)} daqiqa</b>dan keyin qayta urinib ko'ring.`, LOGIN_KEYS)
  }
  const loginScr = (note?: string) => screen(chat, s, { step: 'auth_login', guard: g }, page(note, '🔐 <b>Kirish</b>', '', '👤 Loginingizni yozing:'), keys([BACK]))
  const passScr = (login: string, note?: string, guard = g) =>
    screen(chat, s, { step: 'auth_pass', login, guard }, page(note, '🔐 <b>Kirish</b>', '', `👤 Login:  <b>${esc(login)}</b>`, '🔑 Parolni yozing:'), keys([BACK]))

  /** Noto'g'ri urinish: sanaladi, 3 tadan keyin qulf (egasiga xabar). */
  const fail = async (retry: (note: string, guard: Guard) => Promise<void>, reason: string) => {
    const fails = (g.fails ?? 0) + 1
    if (fails < MAX_TRIES) return retry(`${reason}\nQolgan urinish: <b>${MAX_TRIES - fails}</b>`, { ...g, fails })
    const locks = g.locks ?? 0
    const ng = { fails: 0, locks: locks + 1, lockUntil: Date.now() + lockMinutes(locks) * 60_000 }
    await screen(chat, s, { step: 'auth_idle', guard: ng },
      `⛔ ${MAX_TRIES} marta noto'g'ri.\n\n⏳ <b>${lockMinutes(locks)} daqiqa</b>dan keyin qayta urinib ko'ring.`, LOGIN_KEYS)
    const owner = admins()[0]
    if (owner) {
      await say(owner, [
        '⚠️ <b>Shubhali urinish</b>',
        quote([
          ...whoLines(from),
          ...(s?.login ? [`👤 Login:  <code>${esc(s.login)}</code>`] : []),
          `❌ ${MAX_TRIES} marta noto'g'ri — ${lockMinutes(locks)} daqiqaga to'xtatildi`,
        ]),
      ].join('\n')).catch(() => {})
    }
  }

  if (text === '🔐 Kirish' || text === '/login') return loginScr()
  if (text === BACK) return s?.step === 'auth_pass' ? loginScr() : idle()
  if (s?.step === 'auth_login' && text && !text.startsWith('/')) {
    const login = text.toLowerCase()
    const exists = LOGIN_RE.test(login) && (await listLogins()).some((x) => x.login === login)
    if (exists) return passScr(login)
    return fail(
      (note, guard) => screen(chat, s, { step: 'auth_login', guard }, page(note, '🔐 <b>Kirish</b>', '', '👤 Loginni qayta yozing:'), keys([BACK])),
      `❌ <b>«${esc(text.slice(0, 30))}»</b> degan login topilmadi.`,
    )
  }
  if (s?.step === 'auth_pass' && text && !text.startsWith('/')) {
    const user = await checkPassword(s.login ?? '', text)
    if (!user) return fail((note, guard) => passScr(s.login ?? '', note, guard), "❌ Parol noto'g'ri.")
    if (!user.role) return screen(chat, s, { step: 'auth_idle', guard: g }, "⚠️ Bu hisobning turi tanlanmagan.\nDo'kon egasiga murojaat qiling.", LOGIN_KEYS)
    // Bitta login — bitta Telegram: avval boshqa Telegramda ochiq bo'lsa, u yerdan chiqariladi.
    if (user.tg && user.tg !== from.id) await resetChat(user.tg, '🚪 Hisobingizga boshqa Telegramdan kirildi — bu yerdan chiqarildingiz.')
    await setMeta(user, { tg: from.id })
    await setupChat(chat, user.role === 'admin' ? '🛠 Admin' : '📊 Statistika', [
      { command: 'start', description: '🏠 Bosh sahifa' },
      ...(user.role === 'stats' ? [{ command: 'changepass', description: "🔢 PIN kodni o'zgartirish" }] : []),
      { command: 'logout', description: '🚪 Hisobdan chiqish' },
    ])
    const owner = admins()[0]
    if (owner && owner !== from.id) {
      await say(owner, ['🔐 <b>Botga kirish</b>', quote([`👤 Login:  <code>${user.login}</code> · ${ROLE_NAME[user.role]}`, ...whoLines(from)])].join('\n')).catch(() => {})
    }
    return roleHome(chat, s, { ...user, tg: from.id }, name, `✅ <b>Xush kelibsiz, ${name}!</b>`)
  }
  return idle()
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
  message?: {
    message_id?: number; chat: { id: number; type?: string }; from?: From; text?: string; photo?: { file_id: string }[]; media_group_id?: string
    /** Kanaldan forward qilingan xabar (kanalni ulash uchun). */
    forward_origin?: { type: string; chat?: { id: number; title?: string } }
    forward_from_chat?: { id: number; title?: string; type?: string }
  }
  callback_query?: { id: string; from: From; data?: string; message?: { chat: { id: number }; message_id: number } }
}

const admins = () => env('ADMIN_IDS').split(/[,\s]+/).filter(Boolean).map(Number)

/** Kirim (yuk qo'shish) bosqichlari — bu paytda menyu tugmalari ishlamaydi. */
const IMPORT_STEPS: Step[] = ['photos', 'packs', 'brand', 'brand_new', 'model', 'size', 'color', 'packSize', 'cost', 'price', 'confirm', 'saving']
const inImport = (s: Session | null) => Boolean(s && IMPORT_STEPS.includes(s.step))

async function onUpdate(u: Update) {
  const from = u.message?.from?.id ?? u.callback_query?.from.id
  const chat = u.message?.chat.id ?? u.callback_query?.message?.chat.id
  if (!from || !chat) return
  // Faqat shaxsiy chat (guruhlarda bot ishlamaydi).
  if (u.message && u.message.chat.type && u.message.chat.type !== 'private') return
  if (!admins().includes(from)) return guestUpdate(u, (u.message?.from ?? u.callback_query!.from), chat)
  const owner = admins()[0] === from
  if (u.callback_query) return adminCallback(u.callback_query, chat, owner)
  return adminMessage(u.message!, chat, owner)
}

/** Xabar tagidagi tugmalar — faqat kirim savollaridagi variantlar (brend, razmer, rang, narx…). */
async function adminCallback(q: NonNullable<Update['callback_query']>, chat: number, owner: boolean) {
  const data = q.data ?? ''
  await tg('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {})
  const s = await getSession(chat)
  if (!s || !inImport(s)) return // eski xabardagi tugma
  if (data === 'cancel') return cancelFlow(chat, s, owner)
  if (data.startsWith('manual:')) return manualInput(chat, s)
  if (data === 'photos_done') return photosDone(chat, s)
  if (data === 'ok' && s.step === 'confirm') return confirmSave(chat, s, owner)
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

/** Rasm: kirimga yig'iladi (albom rasmlari bir vaqtda keladi — faqat birinchisiga javob). */
async function onPhoto(m: NonNullable<Update['message']>, chat: number, s: Session | null) {
  if (inImport(s) && s!.step !== 'photos') return ask(chat, s!, '⚠️ Avval shu kirimni tugating yoki ❌ Bekor qiling.')
  await db('bot_photos', { method: 'POST', body: JSON.stringify({ chat_id: chat, file_id: m.photo!.at(-1)!.file_id }) })
  if (s?.step === 'photos') return
  const text = "📷 <b>Yangi kirim</b>\n\nRasmlar qabul qilinmoqda…\nHammasini yuborib bo'lgach — pastdagi <b>✅ Rasmlar tayyor</b>."
  // Kim birinchi bo'lib "rasm yig'ish" holatiga o'tkazsa — o'sha javob beradi.
  if (!s) {
    const created = await db<unknown[]>('bot_sessions', {
      method: 'POST', body: JSON.stringify({ chat_id: chat, data: { step: 'photos' } }),
    }, 'resolution=ignore-duplicates,return=representation')
    if (created.length) return screen(chat, null, { step: 'photos' }, text, PHOTO_KEYS)
    return
  }
  const won = await db<unknown[]>(`bot_sessions?chat_id=eq.${chat}&data->>step=eq.${s.step}`, {
    method: 'PATCH', body: JSON.stringify({ data: { ...s, step: 'photos' } }),
  }, 'return=representation')
  if (won.length) return screen(chat, s, { step: 'photos' }, text, PHOTO_KEYS)
}

/** Admin xabarlari: pastki tugmalar (menyu, orqaga), kirim javoblari va rasmlar. */
async function adminMessage(m: NonNullable<Update['message']>, chat: number, owner: boolean) {
  const text = m.text?.trim() ?? ''
  const s = await getSession(chat)
  if (s?.step === 'm_channel_set' && text !== BACK && text !== '🚫 Kanalni uzish' && !text.startsWith('/')) {
    await drop(chat, m.message_id)
    const which = s.setting === 'sold' ? 'sold' : 'main'
    const ref = channelRef(m)
    if (!ref) return channelAsk(chat, s, which, '🤔 Kanaldan xabar forward qiling yoki @kanal_nomi yozing.')
    const r = await checkChannel(ref, which === 'main')
    if (typeof r === 'string') return channelAsk(chat, s, which, `⚠️ ${r}`)
    const c = await getCfg()
    await saveCfg(which === 'main' ? { ...c, channelId: r.id } : { ...c, soldChannelId: r.id })
    return channelsScreen(chat, s, `✅ Ulandi: <b>${esc(r.title)}</b>`)
  }
  if (m.photo?.length) return onPhoto(m, chat, s)

  // Hamma joyda ishlaydigan buyruqlar.
  if (text === '/start' || text === '/help' || text === HOME) {
    await drop(chat, m.message_id)
    await setupChat(chat, '📊 Panel', ADMIN_COMMANDS(owner))
    if (inImport(s)) return cancelFlow(chat, s, owner)
    return homeScreen(chat, s, owner)
  }
  if (text === '/sync') {
    await drop(chat, m.message_id)
    const r = await syncSold()
    if (inImport(s)) return
    return homeScreen(chat, s, owner, `🔄 Kanal yangilandi: ${r.archived} ta sotilganlarga o'tdi, ${r.updated} ta yangilandi.`)
  }

  // ---- Kirim davomida ----
  if (inImport(s)) return importMessage(m, chat, s!, owner)

  // ---- Menyular (yozilgan xabar o'chadi, ekran yangilanadi) ----
  await drop(chat, m.message_id)
  if (text === "📦 Yuk qo'shish" || text === '/yuk') {
    await db(`bot_photos?chat_id=eq.${chat}`, { method: 'DELETE' })
    return screen(chat, s, { step: 'photos' }, page(undefined,
      "📷 <b>Yangi kirim — rasmlarni yuboring</b>",
      '',
      "• Bir xil narxdagi pachkalar — har rasm 1 pachka.",
      "• Bitta rasm yuborsangiz, nechta pachka ekanini so'rayman.",
      '',
      "Hammasini yuborib bo'lgach — pastdagi <b>✅ Rasmlar tayyor</b>.",
    ), PHOTO_KEYS)
  }
  if (text === '⚙️ Sozlamalar' || text === '/sozlamalar') return settingsScreen(chat, s)
  if (text === '👥 Loginlar' || text === '/loginlar') {
    return owner ? loginsScreen(chat, s) : homeScreen(chat, s, owner, '⛔ Loginlarni faqat asosiy admin boshqaradi.')
  }
  if (text === '/bekor' || text === '❌ Bekor qilish') return homeScreen(chat, s, owner)

  const step = s?.step
  if (text === BACK) {
    switch (step) {
      case 'setting': case 'm_channels': return settingsScreen(chat, s)
      case 'm_channel_set': return channelsScreen(chat, s)
      case 'm_login': case 'login_type': return loginsScreen(chat, s)
      case 'login_name': return loginTypeScreen(chat, s)
      case 'login_pass': case 'm_login_del': case 'm_login_role': case 'm_devices': case 'm_device_del': {
        if (!s!.userId) return loginNameScreen(chat, s, s!.role ?? 'stats')
        const a = await accountById(s!.userId)
        if (!a) return loginsScreen(chat, s)
        return step === 'm_device_del' ? devicesScreen(chat, s, a) : loginScreen(chat, s, a)
      }
      default: return homeScreen(chat, s, owner)
    }
  }

  // Kanallar
  if (step === 'm_channels') {
    if (text === CH_MAIN) return channelAsk(chat, s, 'main')
    if (text === CH_SOLD) return channelAsk(chat, s, 'sold')
    return channelsScreen(chat, s)
  }
  if (step === 'm_channel_set' && text === '🚫 Kanalni uzish') {
    const c = await getCfg()
    await saveCfg(s!.setting === 'sold' ? { ...c, soldChannelId: null } : { ...c, channelId: null })
    return channelsScreen(chat, s, '✅ Uzildi.')
  }

  // Sozlamalar
  if (step === 'm_settings') {
    if (text === CHANNELS) return channelsScreen(chat, s)
    const key = SETTING_BTN[text]
    if (key) return screen(chat, s, { step: 'setting', setting: key }, SET_PROMPTS[key], keys([BACK]))
    if (text === PRICE_ON || text === PRICE_OFF) {
      const c = await getCfg()
      await saveCfg({ ...c, showPrice: text === PRICE_ON })
      return settingsScreen(chat, s, text === PRICE_ON ? "✅ Kanalda narx endi ko'rsatiladi." : '✅ Kanalda narx endi yashiriladi.')
    }
    if (text === REFRESH) {
      await screen(chat, s, { step: 'm_settings' }, '🔄 Kanaldagi postlar yangilanmoqda…', keys([BACK]))
      const r = await refreshPosts()
      return settingsScreen(chat, await getSession(chat), [
        `✅ Yangilandi: ${r.edited} ta post${r.same ? ` (${r.same} tasi o'zgarmagan)` : ''}`,
        r.left ? `⏳ Yana ${r.left} ta qoldi — tugmani yana bosing.` : '',
      ].filter(Boolean).join('\n'))
    }
    return settingsScreen(chat, s)
  }
  if (step === 'setting') {
    if (await applySetting(s!.setting ?? '', text)) return settingsScreen(chat, s, '✅ Saqlandi.')
    return screen(chat, s, { step: 'setting', setting: s!.setting }, page('🤔 Tushunmadim, qaytadan yozing.', SET_PROMPTS[s!.setting ?? ''] ?? ''), keys([BACK]))
  }

  // Hisoblar va loginlar (faqat asosiy admin)
  if (step?.startsWith('login_') || step?.startsWith('m_login') || step?.startsWith('m_device')) {
    if (!owner) return homeScreen(chat, s, owner)
    if (step === 'm_logins') {
      if (text === '➕ Yangi login') return loginTypeScreen(chat, s)
      const a = (await listAccounts()).find((x) => accButton(x) === text)
      return a ? loginScreen(chat, s, a) : loginsScreen(chat, s)
    }
    if (step === 'login_type') {
      const role = text === ROLE_NAME.admin ? 'admin' : text === ROLE_NAME.stats ? 'stats' : null
      return role ? loginNameScreen(chat, s, role) : loginTypeScreen(chat, s)
    }
    if (step === 'login_name') {
      const role = s!.role ?? 'stats'
      const login = text.toLowerCase()
      if (!LOGIN_RE.test(login)) return loginNameScreen(chat, s, role, "🤔 Faqat lotin harf, raqam, nuqta yoki _ (3–20 belgi).")
      if ((await listLogins()).some((x) => x.login === login)) return loginNameScreen(chat, s, role, `⚠️ <b>${login}</b> allaqachon bor. Boshqa nom yozing.`)
      return loginPassScreen(chat, s, { step: 'login_pass', login, role })
    }
    if (step === 'login_pass') return finishLogin(chat, s!, text === '🎲 Parol yaratish' ? genPassword() : text)
    const a = await accountById(s!.userId ?? '')
    if (!a) return loginsScreen(chat, s, 'Bu hisob topilmadi.')
    if (step === 'm_login') {
      if (text === '📱 Qurilmalar') return devicesScreen(chat, s, a)
      if (text === '🔑 Parolni almashtirish' && a.kind !== 'tg') {
        return loginPassScreen(chat, s, { step: 'login_pass', login: a.login, userId: a.id, role: a.role ?? 'stats' })
      }
      if (a.kind !== 'login') return loginScreen(chat, s, a)
      if (text === '🔁 Turini almashtirish') return roleAskScreen(chat, s, a)
      if (text === '🔢 PIN reset' && a.role === 'stats') {
        await setMeta(a, { pin: null, pinFails: 0, pinLock: 0 })
        return loginScreen(chat, s, { ...a, app_metadata: { ...a.app_metadata, pin: null } }, "✅ PIN o'chirildi — keyingi kirishda o'zi yangisini yaratadi.")
      }
      if (text === "🗑 O'chirish") {
        return screen(chat, s, { step: 'm_login_del', userId: a.id, login: a.login }, page(undefined,
          `🗑 <b>${a.label}</b> o'chirilsinmi?`,
          '',
          "U saytdan ham, paneldan ham darhol chiqib ketadi.",
        ), keys(["✅ Ha, o'chirish"], [BACK]))
      }
      return loginScreen(chat, s, a)
    }
    if (step === 'm_login_role') {
      if (a.kind === 'login' && text.startsWith('✅ Ha,')) {
        const role: Role = a.role === 'admin' ? 'stats' : 'admin'
        await setMeta(a, { role, tg: null })
        if (a.tg) await resetChat(a.tg, `🏷 Hisobingiz turi o'zgardi: ${ROLE_NAME[role]}. Qayta kiring.`)
        return loginScreen(chat, s, { ...a, role, tg: null, app_metadata: { ...a.app_metadata, role } }, `✅ <b>${a.label}</b> endi ${ROLE_NAME[role]}.`)
      }
      return loginScreen(chat, s, a)
    }
    if (step === 'm_login_del') {
      if (a.kind === 'login' && text === "✅ Ha, o'chirish") {
        const u = await ourUser(a.id)
        if (u) await deleteLogin(u)
        return loginsScreen(chat, s, `✅ <b>${a.label}</b> o'chirildi.`)
      }
      return loginScreen(chat, s, a)
    }
    if (step === 'm_devices') {
      if (text === '🚪 Telegramdan uzish') return deviceAskScreen(chat, s, a, 'tg')
      if (text === '🚪 Hammasidan chiqarish') return deviceAskScreen(chat, s, a, '*')
      const n = Number(text.match(/^🚪 (\d+)$/)?.[1])
      const d = n ? (await activeDevices(a.id))[n - 1] : undefined
      return d ? deviceAskScreen(chat, s, a, d.id) : devicesScreen(chat, s, a)
    }
    if (step === 'm_device_del') {
      if (text === '✅ Ha, chiqarish' && s!.deviceId) {
        await doRevoke(a, s!.deviceId)
        const fresh = (await accountById(a.id)) ?? a
        return devicesScreen(chat, s, fresh, '✅ Chiqarildi.')
      }
      return devicesScreen(chat, s, a)
    }
  }
  return homeScreen(chat, s, owner, text ? '👇 Pastdagi tugmalardan foydalaning.' : undefined)
}

/** Kirim davomidagi xabarlar: pastki tugmalar va savollarga javoblar. */
async function importMessage(m: NonNullable<Update['message']>, chat: number, s: Session, owner: boolean) {
  const text = m.text?.trim() ?? ''
  if (text === '/bekor' || text === '/cancel' || text === '❌ Bekor qilish') {
    await drop(chat, m.message_id)
    return cancelFlow(chat, s, owner)
  }
  if (text === '✅ Tasdiqlash') {
    await drop(chat, m.message_id)
    return s.step === 'confirm' ? confirmSave(chat, s, owner) : undefined
  }
  if (text === "✍️ Qo'lda kiritish") {
    await drop(chat, m.message_id)
    return manualInput(chat, s)
  }
  if (text === '✅ Rasmlar tayyor') {
    await drop(chat, m.message_id)
    return photosDone(chat, s)
  }
  // Savollarga yozilgan javob kartochkada ko'rinadi — xabarning o'zi o'chiriladi (chat toza turadi).
  if (QA_STEPS.includes(s.step)) await drop(chat, m.message_id)
  let patch: Partial<Session> | null = null
  switch (s.step) {
    case 'photos': {
      await drop(chat, m.message_id)
      return
    }
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
    case 'confirm':
    case 'saving': {
      await drop(chat, m.message_id)
      return
    }
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

/** Kirimni bekor qilish: kartochka va rasmlar olib tashlanadi, asosiy menyuga qaytiladi. */
async function cancelFlow(chat: number, s: Session | null, owner: boolean) {
  await db(`bot_photos?chat_id=eq.${chat}`, { method: 'DELETE' })
  return homeScreen(chat, s, owner, '❌ Kirim bekor qilindi — hech narsa saqlanmadi.')
}

/** Tasdiqlash: saytga yozish va kanalga joylash (ikki marta bosilsa ham bir marta). */
async function confirmSave(chat: number, s: Session, owner: boolean) {
  const won = await db<unknown[]>(`bot_sessions?chat_id=eq.${chat}&data->>step=eq.confirm`, {
    method: 'PATCH', body: JSON.stringify({ data: { ...s, step: 'saving' } }),
  }, 'return=representation')
  if (!won.length) return
  const wait = await edit(chat, s.cardId, '⏳ Saqlanmoqda va kanalga joylanmoqda…')
  try {
    const result = await commit(chat, s)
    await drop(chat, wait)
    return homeScreen(chat, null, owner, result)
  } catch (e) {
    console.error(e)
    await drop(chat, wait)
    await setSession(chat, { ...s, cardId: undefined })
    return confirmCard(chat, { ...s, cardId: undefined }, `Xato: ${esc(String((e as Error).message ?? e)).slice(0, 200)}. Qaytadan "✅ Tasdiqlash" ni bosing.`)
  }
}

// ---------- Qo'ldagi tovarga rasm (sayt / mini app'dan) ----------

/** Telegram'ga fayl bilan so'rov (multipart). */
async function tgForm<T = unknown>(method: string, form: FormData): Promise<T> {
  const res = await fetch(`https://api.telegram.org/bot${env('BOT_TOKEN')}/${method}`, { method: 'POST', body: form })
  const j = await res.json()
  if (!j.ok) throw new Error(`TG ${method}: ${j.description}`)
  return j.result as T
}

type PhotoProduct = { id: string; brand: string; name: string; size: string; color: string; pack_size: number; sale_price: number; stock: number; batch_id: string | null }

/** Bir nechta pachka (bitta model) uchun post matni: kod oralig'i, "Mavjud: N pachka". */
async function photoCaption(list: PhotoProduct[]): Promise<string> {
  const { shop, cfg } = await currentShop()
  const p = list[0]
  const codes = list.map((x) => codeOf(x.name)).filter((x): x is string => Boolean(x))
  const code = codes.length > 1 ? `${codes[0]}–${codes[codes.length - 1]}` : codes[0] ?? ''
  const own = codeOf(p.name)
  const model = own ? p.name.slice(0, -own.length).trim() : p.name
  const d: Draft = { brand: p.brand, model, size: p.size, color: p.color, packSize: p.pack_size, cost: 0, price: Number(p.sale_price) }
  return postCaption(d, code, shop, list.length, list.filter((x) => x.stock > 0).length, cfg.showPrice)
}

/**
 * Qo'ldagi (etiketkasi yopishtirilgan) tovarga rasm: kanalga post bo'lib chiqadi.
 * Tovarlar allaqachon ochiq postda bo'lsa — o'sha postdagi rasm almashtiriladi.
 */
export async function attachPhoto(productIds: string[], jpeg: Uint8Array): Promise<{ ok: true; replaced: boolean } | { error: string }> {
  const ids = [...new Set(productIds)].filter((x) => /^[\w-]{1,64}$/.test(x)).slice(0, 200)
  if (!ids.length) return { error: 'Tovar tanlanmagan' }
  if (jpeg.length < 1000 || jpeg.length > 9_000_000) return { error: "Rasm noto'g'ri yoki juda katta" }
  const list = (await db<PhotoProduct[]>(`products?select=id,brand,name,size,color,pack_size,sale_price,stock,batch_id&id=in.(${ids.map((x) => `"${x}"`).join(',')})`))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
  if (!list.length) return { error: 'Tovar topilmadi' }
  const open = await db<Post[]>(`channel_posts?archived_at=is.null&select=id,product_ids,chat_id,message_id,caption,packs,left_packs&product_ids=ov.{${ids.map((x) => `"${x}"`).join(',')}}`)
  const blob = new Blob([jpeg as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })

  // Kanalda bor — rasmni almashtiramiz (matn o'sha qoladi).
  if (open.length) {
    const post = open[0]
    if (!ids.every((id) => post.product_ids.includes(id))) return { error: "Bu tovarlar kanalda boshqa-boshqa postlarda — bittalab tanlang" }
    const form = new FormData()
    form.append('chat_id', String(post.chat_id))
    form.append('message_id', String(post.message_id))
    form.append('media', JSON.stringify({ type: 'photo', media: 'attach://p', caption: post.caption, parse_mode: 'HTML' }))
    form.append('p', blob, 'photo.jpg')
    const m = await tgForm<{ photo?: { file_id: string }[] }>('editMessageMedia', form)
    await db(`channel_posts?id=eq.${post.id}`, { method: 'PATCH', body: JSON.stringify({ file_id: m.photo?.at(-1)?.file_id ?? '' }) })
    return { ok: true, replaced: true }
  }

  const channel = (await channelIds()).main
  if (!channel) return { error: 'Kanal ulanmagan — botda ⚙️ Sozlamalar → 📣 Kanallar' }
  const caption = await photoCaption(list)
  const form = new FormData()
  form.append('chat_id', String(channel))
  form.append('caption', caption)
  form.append('parse_mode', 'HTML')
  form.append('photo', blob, 'photo.jpg')
  const m = await tgForm<{ message_id: number; photo: { file_id: string }[] }>('sendPhoto', form)
  await db('channel_posts', { method: 'POST', body: JSON.stringify({
    product_ids: list.map((x) => x.id), chat_id: channel, message_id: m.message_id, file_id: m.photo.at(-1)?.file_id ?? '',
    caption, batch_id: list[0].batch_id, packs: list.length, left_packs: list.filter((x) => x.stock > 0).length,
  }) })
  return { ok: true, replaced: false }
}

/** Saytdan: rasm (base64 JPEG) va tovarlar. Kuzatuvchi rasm qo'sha olmaydi. */
async function photoRequest(req: Request, body: { productIds?: string[]; image?: string }): Promise<Response> {
  const who = await staffUser(req)
  if (!who) return json({ error: "Ruxsat yo'q" }, 403)
  if (normRole(who.app_metadata?.role) === 'stats') return json({ error: "Kuzatuvchi rasm qo'sha olmaydi" }, 403)
  try {
    const b64 = String(body.image ?? '').replace(/^data:image\/\w+;base64,/, '')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return json(await attachPhoto(Array.isArray(body.productIds) ? body.productIds.map(String) : [], bytes))
  } catch (e) {
    return json({ error: String((e as Error).message ?? e).slice(0, 200) })
  }
}

// ---------- HTTP kirish nuqtasi ----------

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/** Saytdan chaqiruv: kirgan va staff ro'yxatidagi foydalanuvchi (bo'lmasa — null). */
async function staffUser(req: Request): Promise<AuthUser | null> {
  const jwt = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
  if (!jwt) return null
  const res = await fetch(`${SB()}/auth/v1/user`, { headers: { apikey: KEY(), Authorization: `Bearer ${jwt}` } })
  if (!res.ok) return null
  const user = await res.json() as AuthUser
  const rows = await db<unknown[]>(`staff?user_id=eq.${user.id}&select=user_id`)
  return rows.length ? user : null
}

const json = (x: unknown, status = 200) => new Response(JSON.stringify(x), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

/** Kuzatuvchining shaxsiy PIN kodi (mini app va sayt shu orqali tekshiradi). */
async function pinRequest(req: Request, op?: string, pin?: string): Promise<Response> {
  const who = await staffUser(req)
  if (!who) return json({ error: 'Ruxsat yo\'q' }, 403)
  // Eng so'nggi holat (urinishlar, qulf) — bazadan.
  const u = await auth<AuthUser>(`admin/users/${who.id}`)
  // Shaxsiy PIN faqat kuzatuvchida; boshqalarga kerak emas.
  if (normRole(u.app_metadata?.role) !== 'stats') return op === 'status' ? json({ skip: true }) : json({ error: 'PIN faqat kuzatuvchi hisobda' }, 400)
  const has = Boolean(u.app_metadata?.pin)
  if (op === 'status') return json({ hasPin: has })
  if (op === 'set') {
    if (has) return json({ error: 'PIN allaqachon bor — botda /changepass bilan almashtiring' })
    if (!PIN_RE.test(pin ?? '')) return json({ error: '4 dan 6 tagacha raqam' })
    await pinSet(u, pin!)
    return json({ ok: true })
  }
  if (op === 'check') {
    const err = await pinCheck(u, String(pin ?? ''))
    return json(err ? { error: err } : { ok: true })
  }
  return json({ error: 'op' }, 400)
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

  // Sayt (kirish sahifasi): telefonda "botda oching" tugmasi uchun bot nomi. Maxfiy narsa qaytmaydi.
  if (req.method === 'GET' && url.searchParams.has('info')) {
    const me = await tg<{ username: string }>('getMe', {}).catch(() => null)
    return json({ bot: me?.username ?? null })
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
    const body = await req.clone().json().catch(() => ({})) as { action?: string; initData?: string; op?: string; pin?: string; productIds?: string[]; image?: string }
    // Mini app: Telegram orqali kirish
    if (body.action === 'tg-auth') {
      const r = await tgAuth(String(body.initData ?? '')).catch((e) => ({ error: String((e as Error).message ?? e) }))
      return new Response(JSON.stringify(r), { headers: { ...cors, 'Content-Type': 'application/json' } })
    }
    if (body.action === 'pin') return pinRequest(req, body.op, body.pin)
    if (body.action === 'photo') return photoRequest(req, body as { productIds?: string[]; image?: string })
    if (!(await staffUser(req))) return new Response('forbidden', { status: 403, headers: cors })
    const r = await syncSold()
    return new Response(JSON.stringify(r), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }
  return new Response('Do\'kon boti ishlayapti', { headers: cors })
}

const D = (globalThis as { Deno?: { serve(h: (r: Request) => Promise<Response>): void } }).Deno
if (D?.serve) D.serve(handle)

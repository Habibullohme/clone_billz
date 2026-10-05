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

/** Kanal posti matni. Kelish narxi hech qachon yozilmaydi. */
export function postCaption(d: Draft, code: string, shop: Shop, packs = 1, left = packs): string {
  const lines: (string | null)[] = [
    `👟 <b>${esc(d.brand)} ${esc(d.model)}</b>`,
    '',
    d.size ? `📏 Razmer: ${esc(d.size)}` : null,
    d.color ? `🎨 Rang: ${esc(d.color)}` : null,
    `📦 Pachkada: ${d.packSize} juft`,
    `💰 Narxi: <b>${formatSum(d.price)} so'm</b> (1 juft)`,
    packs > 1 ? `🔢 Mavjud: ${left} pachka` : null,
    `🔖 Kod: <b>${code}</b>`,
    shop.shopPhone || shop.shopAddress ? '' : null,
    shop.shopPhone ? `📞 ${esc(shop.shopPhone)}` : null,
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

// ---------- Suhbat holati ----------

type Step = 'photos' | 'packs' | 'brand' | 'brand_new' | 'model' | 'size' | 'color' | 'packSize' | 'cost' | 'price' | 'confirm' | 'saving'
interface Session extends Partial<Draft> { step: Step; packsPerPhoto?: number; photoCount?: number }

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

async function ask(chat: number, s: Session) {
  const cancel = [b('❌ Bekor qilish', 'cancel')]
  switch (s.step) {
    case 'packs':
      return say(chat, '📦 Bitta rasm. Bu rasmdagi model <b>nechta pachka</b>?', kb([
        ['1', '2', '3', '5', '10'].map((n) => b(n, `packs:${n}`)), cancel,
      ]))
    case 'brand': {
      const brands = await brandList()
      return say(chat, `🏷 <b>Brend</b>ni tanlang (${s.photoCount} ta rasm${(s.packsPerPhoto ?? 1) > 1 ? ` · ${s.packsPerPhoto} pachka` : ''})`, kb([
        ...chunk(brands.map((x) => b(x, `brand:${x.slice(0, 50)}`)), 3),
        [b('➕ Yangi brend', 'brand_new')], cancel,
      ]))
    }
    case 'brand_new':
      return say(chat, '✍️ Yangi brend nomini yozing:')
    case 'model':
      return say(chat, `✍️ <b>${esc(s.brand!)}</b> — <b>model nomi</b>ni yozing (masalan: qo'shma):`, kb([cancel]))
    case 'size':
      return say(chat, '📏 <b>Razmer</b> (yoki yozing):', kb([
        ['39-43', '40-44', '41-45'].map((x) => b(x, `size:${x}`)),
        ['36-40', '37-41', '45-48'].map((x) => b(x, `size:${x}`)), cancel,
      ]))
    case 'color':
      return say(chat, '🎨 <b>Rang</b> (yoki yozing):', kb([
        ['qora', 'oq', 'jigarrang'].map((x) => b(x, `color:${x}`)),
        ['kulrang', "ko'k", 'bej'].map((x) => b(x, `color:${x}`)),
        [b('— Yozmaslik', 'color:')], cancel,
      ]))
    case 'packSize':
      return say(chat, '👟 <b>Pachkada necha juft?</b>', kb([['5', '6', '3', '4', '10'].map((x) => b(x, `packSize:${x}`)), cancel]))
    case 'cost':
      return say(chat, '💵 <b>Kelish narxi</b> (1 juft uchun), masalan: 200000\n<i>Kanalga chiqmaydi.</i>', kb([cancel]))
    case 'price':
      return say(chat, `💰 <b>Sotuv narxi</b> (1 juft uchun). Kelish: ${formatSum(s.cost!)}`, kb([cancel]))
    case 'confirm': {
      const total = (s.photoCount ?? 0) * (s.packsPerPhoto ?? 1)
      const pairs = total * s.packSize!
      return say(chat, [
        '📋 <b>Tekshiring</b>',
        '',
        `👟 ${esc(s.brand!)} ${esc(s.model!)}`,
        `📏 ${esc(s.size || '—')} · 🎨 ${esc(s.color || '—')} · ${s.packSize} juftlik`,
        `📷 ${s.photoCount} ta rasm → <b>${total} pachka</b> (${pairs} juft)`,
        `💵 Kelish: ${formatSum(s.cost!)} · 💰 Sotuv: <b>${formatSum(s.price!)}</b> (1 juft)`,
        `📈 Foyda: ${formatSum((s.price! - s.cost!) * pairs)}`,
        '',
        'Tasdiqlasangiz — saytga tushadi va kanalga chiqadi.',
      ].join('\n'), kb([[b('✅ Tasdiqlash', 'ok'), b('❌ Bekor', 'cancel')]]))
    }
  }
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
  const shop = (await db<{ data: Shop }[]>('settings?id=eq.main&select=data'))[0]?.data ?? {}
  const channel = Number(env('CHANNEL_ID'))
  let posted = 0
  for (const g of groups) {
    const code = g.codes.length > 1 ? `${g.codes[0]}–${g.codes[g.codes.length - 1]}` : g.codes[0]
    const caption = postCaption(d, code, shop, g.ids.length)
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

// ---------- Telegram yangilanishlari ----------

interface Update {
  message?: { chat: { id: number }; from?: { id: number }; text?: string; photo?: { file_id: string }[]; media_group_id?: string }
  callback_query?: { id: string; from: { id: number }; data?: string; message?: { chat: { id: number }; message_id: number } }
}

const admins = () => env('ADMIN_IDS').split(/[,\s]+/).filter(Boolean).map(Number)

async function onUpdate(u: Update) {
  const from = u.message?.from?.id ?? u.callback_query?.from.id
  const chat = u.message?.chat.id ?? u.callback_query?.message?.chat.id
  if (!from || !chat) return
  if (!admins().includes(from)) {
    if (u.message?.text?.startsWith('/start')) await say(chat, `Bu do'kon boti. Sizning Telegram ID: <code>${from}</code>\nEgasi uni ADMIN_IDS ga qo'shsa — ishlay olasiz.`)
    return
  }

  // Tugmalar
  if (u.callback_query) {
    const data = u.callback_query.data ?? ''
    await tg('answerCallbackQuery', { callback_query_id: u.callback_query.id }).catch(() => {})
    const s = await getSession(chat)
    if (data === 'cancel') {
      await endSession(chat)
      return say(chat, '❌ Bekor qilindi. Yangi kirim uchun rasm yuboring.')
    }
    // Eski (tugagan kirimdagi) tugma — jim.
    if (!s) return
    if (data === 'photos_done') {
      if (s.step !== 'photos') return
      const n = (await db<{ id: number }[]>(`bot_photos?chat_id=eq.${chat}&select=id`)).length
      if (!n) return say(chat, 'Hali rasm yo\'q.')
      const ns: Session = { ...s, photoCount: n, step: n === 1 ? 'packs' : 'brand', packsPerPhoto: 1 }
      await setSession(chat, ns)
      return ask(chat, ns)
    }
    if (data === 'ok' && s.step === 'confirm') {
      // Ikki marta bosilsa (yoki Telegram qayta yuborsa) — faqat bittasi o'tadi.
      const won = await db<unknown[]>(`bot_sessions?chat_id=eq.${chat}&data->>step=eq.confirm`, {
        method: 'PATCH', body: JSON.stringify({ data: { ...s, step: 'saving' } }),
      }, 'return=representation')
      if (!won.length) return
      await say(chat, '⏳ Saqlanmoqda va kanalga joylanmoqda…')
      try {
        return say(chat, await commit(chat, s))
      } catch (e) {
        console.error(e)
        await setSession(chat, s)
        return say(chat, `⚠️ Xato: ${esc(String((e as Error).message ?? e)).slice(0, 300)}\nQaytadan "✅ Tasdiqlash" ni bosib ko'ring.`, kb([[b('✅ Tasdiqlash', 'ok'), b('❌ Bekor', 'cancel')]]))
      }
    }
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
    }
    // Eski xabardagi tugma bosilsa — e'tiborsiz (joriy savolga tegishli emas).
    if (key !== s.step && !(key === 'brand' && s.step === 'brand_new')) return
    const patch = fields[key]?.(val)
    if (!patch) return
    const step: Step = key === 'packs' ? 'brand' : next({ ...s, step: key as Step })
    const ns = { ...s, ...patch, step }
    await setSession(chat, ns)
    return ask(chat, ns)
  }

  const m = u.message!
  const text = m.text?.trim() ?? ''

  if (text === '/start' || text === '/help') {
    return say(chat, [
      '👋 <b>Yuk kiritish</b>',
      '1. Bir xil narxdagi pachkalarning rasmlarini yuboring (har rasm — 1 pachka).',
      '2. "✅ Rasmlar tayyor" ni bosing.',
      '3. Savollarga javob bering — tovar saytga tushadi va kanalga chiqadi.',
      '',
      'Bitta rasm yuborsangiz — nechta pachka ekanini so\'rayman.',
      '/bekor — joriy kirimni bekor qilish',
    ].join('\n'))
  }
  if (text === '/bekor' || text === '/cancel') {
    await endSession(chat)
    return say(chat, '❌ Bekor qilindi.')
  }
  if (text === '/sync') {
    const r = await syncSold()
    return say(chat, `🔄 Kanal yangilandi: ${r.archived} ta sotilganlarga o'tdi, ${r.updated} ta yangilandi.`)
  }

  // Rasm: yig'ib boriladi (albom rasmlari bir vaqtda keladi).
  if (m.photo?.length) {
    const s = await getSession(chat)
    if (s && s.step !== 'photos') return say(chat, '⚠️ Avval joriy kirimni tugating yoki /bekor deb yozing.')
    await db('bot_photos', { method: 'POST', body: JSON.stringify({ chat_id: chat, file_id: m.photo.at(-1)!.file_id }) })
    // Faqat birinchi rasmga javob (qolganlari jim qo'shiladi).
    const created = await db<unknown[]>('bot_sessions', {
      method: 'POST', body: JSON.stringify({ chat_id: chat, data: { step: 'photos' } }),
    }, 'resolution=ignore-duplicates,return=representation')
    if (created.length) {
      return say(chat, '📷 Rasmlar qabul qilinmoqda… Hammasini yuborib bo\'lgach, tugmani bosing:', kb([[b('✅ Rasmlar tayyor', 'photos_done')], [b('❌ Bekor qilish', 'cancel')]]))
    }
    return
  }

  // Matnli javoblar
  const s = await getSession(chat)
  if (!s) return say(chat, 'Yangi kirim uchun rasm yuboring. Yordam: /help')
  let patch: Partial<Session> | null = null
  switch (s.step) {
    case 'photos': return say(chat, 'Rasmlarni yuborib bo\'lgach "✅ Rasmlar tayyor" ni bosing.')
    case 'packs': { const n = parseInt(text); patch = n > 0 && n < 500 ? { packsPerPhoto: n } : null; break }
    case 'brand':
    case 'brand_new': patch = text.length >= 2 ? { brand: text.replace(/\s+/g, ' ') } : null; break
    case 'model': patch = text.length >= 1 ? { model: text.replace(/\s+/g, ' ') } : null; break
    case 'size': patch = { size: text }; break
    case 'color': patch = { color: text === '-' ? '' : text }; break
    case 'packSize': { const n = parseInt(text); patch = n > 0 && n < 100 ? { packSize: n } : null; break }
    case 'cost': { const v = parseSum(text); patch = v ? { cost: v } : null; break }
    case 'price': {
      const v = parseSum(text)
      patch = v ? { price: v } : null
      if (v && v < (s.cost ?? 0)) await say(chat, `⚠️ Diqqat: sotuv narxi kelish narxidan (${formatSum(s.cost!)}) past.`)
      break
    }
    case 'confirm': return say(chat, 'Tugmalardan birini bosing: ✅ Tasdiqlash yoki ❌ Bekor.')
    case 'saving': return say(chat, '⏳ Saqlanmoqda, biroz kuting…')
  }
  if (!patch) return say(chat, '🤔 Tushunmadim, qaytadan yozing.')
  const step: Step = s.step === 'packs' ? 'brand' : next(s)
  const ns = { ...s, ...patch, step }
  await setSession(chat, ns)
  return ask(chat, ns)
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
    if (!(await isStaffRequest(req))) return new Response('forbidden', { status: 403, headers: cors })
    const r = await syncSold()
    return new Response(JSON.stringify(r), { headers: { ...cors, 'Content-Type': 'application/json' } })
  }
  return new Response('Do\'kon boti ishlayapti', { headers: cors })
}

const D = (globalThis as { Deno?: { serve(h: (r: Request) => Promise<Response>): void } }).Deno
if (D?.serve) D.serve(handle)

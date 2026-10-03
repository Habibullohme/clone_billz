import type { ProductInput } from '../types'

/** Shablon ustunlari. Tartibi va nomi — foydalanuvchi Excel'da ko'radigan ko'rinishda. */
export const TEMPLATE_COLUMNS = [
  { key: 'brand', title: 'Brend', example: 'Nike', required: true, width: 16 },
  { key: 'name', title: 'Model nomi', example: 'Nike Air 270', required: true, width: 28 },
  { key: 'size', title: 'Razmer', example: '40-44', required: false, width: 10 },
  { key: 'color', title: 'Rang', example: 'qora', required: false, width: 12 },
  { key: 'packSize', title: 'Pachkada (juft)', example: 5, required: true, width: 16 },
  { key: 'costPrice', title: 'Kelish narxi (1 juft)', example: 160000, required: true, width: 22 },
  { key: 'salePrice', title: 'Sotuv narxi (1 juft)', example: 190000, required: true, width: 22 },
] as const

type Key = (typeof TEMPLATE_COLUMNS)[number]['key']

const norm = (s: unknown) =>
  String(s ?? '')
    .toLowerCase()
    .replace(/[ʻʼ'`’]/g, '')
    .replace(/[^a-zа-яё0-9]/g, '')

/** Sarlavhalarni moslashuvchan tanish: "Kelish narxi", "kelish", "tannarx" va h.k. */
const aliases: Record<Key, string[]> = {
  brand: ['brend', 'brand', 'бренд'],
  name: ['modelnomi', 'model', 'nomi', 'nom', 'name', 'наименование', 'название'],
  size: ['razmer', 'razmerlar', 'olcham', 'size', 'размер'],
  color: ['rang', 'color', 'цвет'],
  packSize: ['pachkadajuft', 'pachkada', 'pachkahajmi', 'juftsoni', 'вупаковке'],
  costPrice: ['kelishnarxi1juft', 'kelishnarxi', 'kelish', 'tannarx', 'себестоимость', 'закупка'],
  salePrice: ['sotuvnarxi1juft', 'sotuvnarxi', 'sotuv', 'narx', 'цена', 'цена продажи'],
}

function detectColumns(header: unknown[]): Partial<Record<Key, number>> {
  const map: Partial<Record<Key, number>> = {}
  const cells = header.map(norm)
  // Avval aniq mosliklarni, keyin "boshlanishi" bo'yicha mosliklarni qidiramiz.
  for (const exact of [true, false]) {
    for (const key of Object.keys(aliases) as Key[]) {
      if (map[key] !== undefined) continue
      const i = cells.findIndex(
        (c, idx) =>
          !Object.values(map).includes(idx) &&
          aliases[key].some((a) => (exact ? c === norm(a) : c.startsWith(norm(a)))),
      )
      if (i !== -1) map[key] = i
    }
  }
  return map
}

function toNumber(v: unknown): number {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/\s/g, '').replace(',', '.').replace(/so'?m|сум|uzs/gi, '')
  const n = Number(s)
  return Number.isFinite(n) ? n : NaN
}

export interface ParsedRow {
  row: number
  input: ProductInput
  errors: string[]
}

/** Excel qatorlarini tovarlarga aylantiradi. Bo'sh qatorlar tashlab ketiladi. */
export function parseRows(rows: unknown[][]): { items: ParsedRow[]; missing: string[] } {
  const headerIdx = rows.findIndex((r) => r.some((c) => norm(c) === 'brend' || norm(c) === 'brand' || norm(c) === 'бренд'))
  const start = headerIdx === -1 ? 0 : headerIdx
  const cols = detectColumns(rows[start] ?? [])
  const missing = TEMPLATE_COLUMNS.filter((c) => c.required && cols[c.key] === undefined).map((c) => c.title)
  if (missing.length) return { items: [], missing }

  const get = (r: unknown[], k: Key) => (cols[k] === undefined ? undefined : r[cols[k]!])
  const items: ParsedRow[] = []
  rows.slice(start + 1).forEach((r, i) => {
    if (r.every((c) => c === null || c === undefined || String(c).trim() === '')) return
    const input: ProductInput = {
      brand: String(get(r, 'brand') ?? '').trim(),
      name: String(get(r, 'name') ?? '').trim(),
      size: String(get(r, 'size') ?? '').trim(),
      color: String(get(r, 'color') ?? '').trim(),
      packSize: toNumber(get(r, 'packSize')),
      // Har bir qator — bitta pachka, alohida tovar.
      packs: 1,
      costPrice: toNumber(get(r, 'costPrice')),
      salePrice: toNumber(get(r, 'salePrice')),
    }
    const isExample = TEMPLATE_COLUMNS.every((c) => String(input[c.key as keyof ProductInput]) === String(c.example))
    if (isExample) return
    const errors: string[] = []
    if (!input.brand) errors.push('brend yo\'q')
    if (!input.name) errors.push('model nomi yo\'q')
    if (!(input.packSize >= 1 && Number.isInteger(input.packSize))) errors.push('pachkada juft soni noto\'g\'ri')
    if (!(input.costPrice > 0)) errors.push('kelish narxi noto\'g\'ri')
    if (!(input.salePrice > 0)) errors.push('sotuv narxi noto\'g\'ri')
    if (input.salePrice > 0 && input.costPrice > 0 && input.salePrice < input.costPrice) errors.push('sotuv narxi kelishdan past')
    items.push({ row: start + i + 2, input, errors })
  })
  return { items, missing: [] }
}

export async function readExcel(file: File): Promise<unknown[][]> {
  const { readSheet } = await import('read-excel-file/browser')
  return (await readSheet(file)) as unknown[][]
}

export async function downloadTemplate() {
  const { default: writeXlsxFile } = await import('write-excel-file/browser')
  const header = TEMPLATE_COLUMNS.map((c) => ({ value: c.title, fontWeight: 'bold' as const, backgroundColor: '#dcefe9' }))
  const example = TEMPLATE_COLUMNS.map((c) => ({ value: c.example as string | number, color: '#888888' }))
  await writeXlsxFile([header, example], {
    columns: TEMPLATE_COLUMNS.map((c) => ({ width: c.width })),
    sheet: 'Tovarlar',
  }).toFile('tovarlar-shablon.xlsx')
}

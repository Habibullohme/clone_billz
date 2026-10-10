import type { Product } from '../types'
import { formatSum } from './money'

export type LabelFieldKey = 'name' | 'brand' | 'size' | 'color' | 'pack' | 'price' | 'barcode'

export interface LabelField {
  key: LabelFieldKey
  /** Shrift o'lchami, pt. Shtrix-kod uchun — balandligi, mm. */
  size: number
  bold: boolean
  align: 'left' | 'center' | 'right'
  /** Joylashuv, mm (etiketkaning chap-yuqori burchagidan). Yo'q bo'lsa — avtomatik. */
  x?: number
  y?: number
  w?: number
  h?: number
}

export type PlacedField = LabelField & Required<Pick<LabelField, 'x' | 'y' | 'w' | 'h'>>

const PT_TO_MM = 25.4 / 72

/** Matn qatorining balandligi, mm. */
export const textHeight = (pt: number) => pt * PT_TO_MM * 1.25

/** Avtomatik joylashuv: maydonlar ustma-ust, oralari teng. */
export function autoLayout(t: LabelTemplate): PlacedField[] {
  const pad = 1.5
  const heights = t.fields.map((f) => (f.key === 'barcode' ? f.size : textHeight(f.size)))
  const free = t.height - 2 * pad - heights.reduce((s, h) => s + h, 0)
  const gap = Math.max(0, free / (t.fields.length + 1))
  let y = pad + gap
  return t.fields.map((f, i) => {
    const placed = { ...f, x: pad, y: round(y), w: round(t.width - 2 * pad), h: round(heights[i]) }
    y += heights[i] + gap
    return placed
  })
}

/** Maydonlarning joyi: saqlangani, bo'lmasa avtomatik. */
export function placedFields(t: LabelTemplate): PlacedField[] {
  return t.fields.every((f) => f.w && f.h) ? (t.fields as PlacedField[]) : autoLayout(t)
}

const round = (n: number) => Math.round(n * 10) / 10

export interface LabelTemplate {
  id: string
  name: string
  /** mm */
  width: number
  /** mm */
  height: number
  format: 'CODE128' | 'EAN13'
  /** Shtrix-kod ostida raqamlar chiqsinmi. */
  barcodeText: boolean
  fields: LabelField[]
}

export const fieldNames: Record<LabelFieldKey, string> = {
  name: 'Model nomi',
  brand: 'Brend',
  size: 'Razmer',
  color: 'Rang',
  pack: 'Pachkada (juft)',
  price: 'Narx',
  barcode: 'Shtrix-kod',
}

export function fieldText(key: LabelFieldKey, p: Product): string {
  switch (key) {
    case 'name': return p.name
    case 'brand': return p.brand
    case 'size': return p.size
    case 'color': return p.color
    case 'pack': return `${p.packSize} juft`
    case 'price': return `${formatSum(p.salePrice)} so'm`
    case 'barcode': return p.barcode
  }
}

export const defaultTemplates: LabelTemplate[] = [
  {
    id: 'std-58x40', name: 'Narxli 58×40', width: 58, height: 40, format: 'CODE128', barcodeText: true,
    fields: [
      { key: 'name', size: 11, bold: true, align: 'center' },
      { key: 'size', size: 8, bold: false, align: 'center' },
      { key: 'price', size: 12, bold: true, align: 'center' },
      { key: 'barcode', size: 12, bold: false, align: 'center' },
    ],
  },
  {
    id: 'noprice-58x40', name: 'Narxsiz 58×40', width: 58, height: 40, format: 'CODE128', barcodeText: true,
    fields: [
      { key: 'name', size: 12, bold: true, align: 'left' },
      { key: 'barcode', size: 14, bold: false, align: 'center' },
    ],
  },
  {
    id: 'small-40x30', name: 'Kichik 40×30', width: 40, height: 30, format: 'CODE128', barcodeText: true,
    fields: [
      { key: 'name', size: 8, bold: true, align: 'center' },
      { key: 'price', size: 9, bold: true, align: 'center' },
      { key: 'barcode', size: 10, bold: false, align: 'center' },
    ],
  },
]

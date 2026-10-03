import type { Product } from '../types'
import { formatSum } from './money'

export type LabelFieldKey = 'name' | 'brand' | 'size' | 'color' | 'pack' | 'price' | 'article' | 'barcode'

export interface LabelField {
  key: LabelFieldKey
  /** Shrift o'lchami, pt. Shtrix-kod uchun — balandligi, mm. */
  size: number
  bold: boolean
  align: 'left' | 'center' | 'right'
}

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
  article: 'Kod',
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
    case 'article': return p.article
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

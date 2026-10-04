import type { ProductInput } from '../types'

/** Sinov uchun namunaviy tovarlar. Haqiqiy tovarlar Excel shablon orqali import qilinadi. */
export const demoInputs: ProductInput[] = [
  { brand: 'Little', name: 'Little 01', size: '36-40', color: 'qora', packSize: 5, packs: 12, costPrice: 95_000, salePrice: 105_000 },
  { brand: 'Little', name: 'Little qalin', size: '36-40', color: 'jigarrang', packSize: 5, packs: 8, costPrice: 105_000, salePrice: 115_000 },
  { brand: 'Ezel', name: 'Ezel 18', size: '40-44', color: 'oq', packSize: 5, packs: 10, costPrice: 93_000, salePrice: 110_000 },
  { brand: 'Richmen', name: 'Richmen Pol klassika 29', size: '40-44', color: 'qora', packSize: 5, packs: 6, costPrice: 150_000, salePrice: 175_000 },
  { brand: 'Nike', name: 'Nike Air 270', size: '40-44', color: 'oq', packSize: 5, packs: 20, costPrice: 160_000, salePrice: 190_000 },
  { brand: 'Velikan', name: 'Velikan klassika', size: '46-48', color: 'qora', packSize: 3, packs: 9, costPrice: 180_000, salePrice: 215_000 },
  { brand: 'Adidas', name: 'Adidas Run', size: '39-44', color: 'kulrang', packSize: 6, packs: 5, costPrice: 120_000, salePrice: 140_000 },
]

import { useEffect, useState } from 'react'
import type { Product } from '../types'
import { getProducts, searchProducts } from '../data/store'
import { formatSum } from '../lib/money'
import { packsLabel } from '../lib/cart'

export function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([])
  const [q, setQ] = useState('')
  useEffect(() => {
    getProducts().then(setProducts)
  }, [])

  const list = q ? searchProducts(products, q, 500) : products

  return (
    <div className="page">
      <h1>Mahsulotlar</h1>
      <input className="input" placeholder="Qidiruv: nom, artikul, shtrix-kod" value={q} onChange={(e) => setQ(e.target.value)} />
      <table className="table">
        <thead>
          <tr><th>Brend</th><th>Nomi</th><th>Artikul</th><th>Shtrix-kod</th><th>Pachka</th><th>Qoldiq</th><th>Kelish</th><th>Sotuv</th><th>Foyda / pachka</th></tr>
        </thead>
        <tbody>
          {list.map((p) => (
            <tr key={p.id}>
              <td>{p.brand}</td>
              <td><b>{p.name}</b></td>
              <td>{p.article}</td>
              <td className="mono">{p.barcode}</td>
              <td>{p.packSize} juft</td>
              <td className={p.stock <= p.packSize * 2 ? 'warn' : ''}>{packsLabel(Math.max(0, p.stock), p.packSize)}<div className="muted small">{p.stock} juft</div></td>
              <td>{formatSum(p.costPrice)}</td>
              <td>{formatSum(p.salePrice)}</td>
              <td>{formatSum((p.salePrice - p.costPrice) * p.packSize)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">Hozircha namunaviy mahsulotlar. Keyingi bosqichda: Billz'dan import, bot orqali qo'shish, shtrix-kod chop etish.</p>
    </div>
  )
}

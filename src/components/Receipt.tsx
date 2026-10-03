import type { Sale } from '../types'
import type { Settings } from '../data/store'
import { formatSum } from '../lib/money'
import { packsLabel } from '../lib/cart'

export function Receipt({ sale, settings }: { sale: Sale; settings: Settings }) {
  const d = new Date(sale.createdAt)
  const p = sale.payment
  return (
    <div className={`receipt w${settings.receiptWidth}`}>
      <div className="r-center">
        <b className="r-shop">{settings.shopName}</b>
        {settings.shopAddress && <div>{settings.shopAddress}</div>}
        {settings.shopPhone && <div>{settings.shopPhone}</div>}
      </div>
      <div className="r-line" />
      <div className="r-kv"><span>Chek №</span><span>{String(sale.number).padStart(6, '0')}</span></div>
      <div className="r-kv"><span>Sana</span><span>{d.toLocaleDateString('ru-RU')} {d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></div>
      {settings.receiptShowCustomer && sale.customerName && <div className="r-kv"><span>Mijoz</span><b>{sale.customerName}</b></div>}
      <div className="r-line" />
      {sale.lines.map((l) => (
        <div key={l.productId} className="r-item">
          <div>{l.name}</div>
          <div className="r-kv">
            <span>{settings.receiptShowPacks && `${packsLabel(l.pairs, l.packSize)} · `}{l.pairs} × {formatSum(l.price)}</span>
            <span>{formatSum(l.pairs * l.price)}</span>
          </div>
        </div>
      ))}
      <div className="r-line" />
      {sale.discount > 0 && (
        <>
          <div className="r-kv"><span>Oraliq jami</span><span>{formatSum(sale.subtotal)}</span></div>
          <div className="r-kv"><span>Chegirma</span><span>−{formatSum(sale.discount)}</span></div>
        </>
      )}
      <div className="r-kv r-total"><span>JAMI</span><span>{formatSum(sale.total)}</span></div>
      <div className="r-line" />
      {p.cash > 0 && <div className="r-kv"><span>Naqd</span><span>{formatSum(p.cash)}</span></div>}
      {p.usd > 0 && (
        <div className="r-kv"><span>Dollar {p.usd}$ × {formatSum(p.usdRate)}</span><span>{formatSum(Math.round(p.usd * p.usdRate))}</span></div>
      )}
      {p.card > 0 && <div className="r-kv"><span>Karta</span><span>{formatSum(p.card)}</span></div>}
      {sale.change > 0 && <div className="r-kv"><span>Qaytim</span><span>{formatSum(sale.change)}</span></div>}
      {p.debt > 0 && <div className="r-kv"><b>Nasiya</b><b>{formatSum(p.debt)}</b></div>}
      {sale.note && <><div className="r-line" /><div>{sale.note}</div></>}
      <div className="r-line" />
      <div className="r-center">{settings.receiptFooter}</div>
    </div>
  )
}

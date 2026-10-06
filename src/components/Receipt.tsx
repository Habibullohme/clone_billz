import { splitPhones } from '../lib/phones'
import type React from 'react'
import type { Sale } from '../types'
import type { Settings } from '../data/store'
import { formatSum } from '../lib/money'
import { groupReceiptLines } from '../lib/receipt'

export function Receipt({ sale, settings }: { sale: Sale; settings: Settings }) {
  const d = new Date(sale.createdAt)
  const p = sale.payment
  const groups = groupReceiptLines(sale.lines)
  const totalPacks = groups.reduce((s, g) => s + g.packs, 0)
  const totalPairs = groups.reduce((s, g) => s + g.pairs, 0)
  return (
    <div className="receipt" style={{ '--rw': `${settings.receiptWidth}mm` } as React.CSSProperties}>
      <div className="r-center">
        {settings.receiptShowLogo && settings.shopLogo && <img className="r-logo" src={settings.shopLogo} alt="" />}
        <b className="r-shop">{settings.shopName}</b>
        {settings.shopAddress && <div>{settings.shopAddress}</div>}
        {splitPhones(settings.shopPhone).map((ph) => <div key={ph}>{ph}</div>)}
      </div>
      <div className="r-line" />
      <div className="r-kv"><span>Chek №</span><span>{String(sale.number).padStart(6, '0')}</span></div>
      <div className="r-kv"><span>Sana</span><span>{d.toLocaleDateString('ru-RU')} {d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></div>
      {settings.receiptShowCustomer && sale.customerName && <div className="r-kv"><span>Mijoz</span><b>{sale.customerName}</b></div>}
      <div className="r-line" />
      {groups.map((g, i) => (
        <div key={i} className="r-item">
          <div className="r-title">
            <b>{g.title}</b>
            {settings.receiptShowPacks && <span>{packsText(g.packs)}</span>}
          </div>
          <div className="r-kv">
            <span>{g.pairs} × {formatSum(g.price)}</span>
            <b>{formatSum(g.sum)}</b>
          </div>
        </div>
      ))}
      <div className="r-line" />
      <div className="r-kv r-count"><span>Jami tovar</span><span>{packsText(totalPacks)} · {totalPairs} juft</span></div>
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

/** 3 → "3 pachka", 2.4 → "2.4 pachka" (qisman pachka sotilgan bo'lsa). */
function packsText(n: number): string {
  return `${Number.isInteger(n) ? n : n.toFixed(1)} pachka`
}

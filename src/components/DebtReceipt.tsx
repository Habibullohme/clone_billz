import type React from 'react'
import type { Settings } from '../data/store'
import type { LedgerRow } from '../lib/debt'
import { formatSum } from '../lib/money'
import { splitPhones } from '../lib/phones'

/** Nasiya cheki: nasiya berilganda yoki qarz to'langanda — oldingi va qolgan qarz bilan. */
export function DebtReceipt({ row, name, phone, settings }: { row: LedgerRow; name: string; phone?: string; settings: Settings }) {
  const d = new Date(row.date)
  const debt = row.kind === 'debt'
  return (
    <div className="receipt" style={{ '--rw': `${settings.receiptWidth}mm` } as React.CSSProperties}>
      <div className="r-center">
        {settings.receiptShowLogo && settings.shopLogo && <img className="r-logo" src={settings.shopLogo} alt="" />}
        <b className="r-shop">{settings.shopName}</b>
        {settings.shopAddress && <div>{settings.shopAddress}</div>}
        {splitPhones(settings.shopPhone).map((ph) => <div key={ph}>{ph}</div>)}
      </div>
      <div className="r-line" />
      <div className="r-center"><b>{debt ? 'NASIYA CHEKI' : "TO'LOV CHEKI"}</b></div>
      <div className="r-line" />
      <div className="r-kv"><span>Sana</span><span>{d.toLocaleDateString('ru-RU')} {d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span></div>
      <div className="r-kv"><span>Mijoz</span><b>{name}</b></div>
      {phone && <div className="r-kv"><span>Telefon</span><span>{phone}</span></div>}
      {row.saleNumber && <div className="r-kv"><span>Sotuv cheki</span><span>№{String(row.saleNumber).padStart(6, '0')}</span></div>}
      <div className="r-line" />
      <div className="r-kv"><span>Oldingi qarz</span><span>{formatSum(Math.max(0, row.before))}</span></div>
      <div className="r-kv r-total"><span>{debt ? 'Nasiya' : "To'landi"}</span><span>{debt ? '+' : '−'}{formatSum(row.amount)}</span></div>
      <div className="r-kv"><b>{row.after > 0 ? 'Qolgan qarz' : row.after < 0 ? "Ortiqcha to'lov" : 'Qarz'}</b><b>{row.after === 0 ? "yo'q" : formatSum(Math.abs(row.after))}</b></div>
      {row.note && <><div className="r-line" /><div>{row.note}</div></>}
      <div className="r-line" />
      <div className="r-sign"><span>Imzo:</span><span className="r-sign-line" /></div>
      <div className="r-center">{settings.receiptFooter}</div>
    </div>
  )
}

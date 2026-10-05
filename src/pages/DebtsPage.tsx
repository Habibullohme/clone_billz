import { useEffect, useMemo, useState } from 'react'
import type { Customer, LedgerEntry } from '../types'
import { addLedgerEntry, balanceOf, deleteLedgerEntry, getCustomers, updateCustomer } from '../data/store'
import { formatSum, parseSum } from '../lib/money'
import { hueStyle } from '../lib/colors'
import { CustomerInput } from '../components/CustomerInput'
import { IconEdit, IconTrash, Modal, MoneyInput, Segmented } from '../components/ui'

type Filter = 'debtors' | 'all'

const today = () => new Date().toISOString().slice(0, 10)
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit' })
const lastDate = (c: Customer) => (c.ledger ?? []).reduce((m, e) => (e.date > m ? e.date : m), '')

/** Nasiyalar: kimga qancha nasiya berilgan, kim qancha qaytargan. Kassadagi nasiyalar o'zi tushadi, daftardagilar qo'lda kiritiladi. */
export function DebtsPage() {
  const [customers, setCustomers] = useState<Customer[]>([])
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('debtors')
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const reload = () => getCustomers().then(setCustomers)
  useEffect(() => {
    reload()
  }, [])

  const withLedger = customers.filter((c) => (c.ledger ?? []).length > 0)
  const rows = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return withLedger
      .map((c) => ({ c, balance: balanceOf(c), last: lastDate(c) }))
      .filter(({ c, balance }) => (filter === 'all' || balance > 0) && words.every((w) => `${c.name} ${c.phone ?? ''}`.toLowerCase().includes(w)))
      .sort((a, b) => b.balance - a.balance || b.last.localeCompare(a.last))
  }, [customers, q, filter])

  const totalDebt = withLedger.reduce((s, c) => s + Math.max(0, balanceOf(c)), 0)
  const debtors = withLedger.filter((c) => balanceOf(c) > 0).length
  const month = new Date().toISOString().slice(0, 7)
  const paidThisMonth = withLedger.reduce(
    (s, c) => s + (c.ledger ?? []).filter((e) => e.kind === 'payment' && e.date.slice(0, 7) === month).reduce((x, e) => x + e.amount, 0),
    0,
  )
  const open = customers.find((c) => c.id === openId) ?? null

  return (
    <div className="page debts-page">
      <div className="page-head">
        <h1>Nasiyalar</h1>
        <div className="head-actions">
          <button className="btn primary" onClick={() => setAdding(true)}>+ Nasiya yozish</button>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi tone-red"><span>Jami nasiya</span><b>{formatSum(totalDebt)}</b></div>
        <div className="kpi tone-amber"><span>Qarzdorlar</span><b>{debtors}</b></div>
        <div className="kpi tone-green"><span>Shu oy qaytarildi</span><b>{formatSum(paidThisMonth)}</b></div>
      </div>

      <div className="debts-bar">
        <input className="input" placeholder="Qidirish: ism yoki telefon" value={q} onChange={(e) => setQ(e.target.value)} />
        <Segmented<Filter> value={filter} onChange={setFilter} options={[['debtors', 'Qarzdorlar'], ['all', 'Hammasi']]} />
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <b>{withLedger.length ? 'Topilmadi' : "Hali nasiya yo'q"}</b>
          <span className="muted">Kassada nasiyaga sotilganlar shu yerga o'zi tushadi. Daftardagi eski nasiyalarni "+ Nasiya yozish" bilan kiriting.</span>
        </div>
      ) : (
        <div className="debt-list">
          {rows.map(({ c, balance, last }) => (
            <button key={c.id} className="debt-row" onClick={() => setOpenId(c.id)}>
              <span className="avatar" style={hueStyle(c.name)}>{c.name.slice(0, 1).toUpperCase()}</span>
              <span className="debt-who">
                <b>{c.name}</b>
                <span className="muted small">{[c.phone, last && `oxirgi: ${fmtDate(last)}`].filter(Boolean).join(' · ')}</span>
              </span>
              <span className={`debt-bal${balance > 0 ? ' owe' : balance < 0 ? ' over' : ' zero'}`}>
                {balance > 0 ? formatSum(balance) : balance < 0 ? `+${formatSum(-balance)} ortiqcha` : "to'langan"}
              </span>
            </button>
          ))}
        </div>
      )}

      {adding && (
        <EntryForm
          title="Nasiya yozish"
          kind="debt"
          askCustomer
          onClose={() => setAdding(false)}
          onSave={async (name, phone, e) => {
            const c = await addLedgerEntry(name, phone, e)
            setAdding(false)
            await reload()
            setOpenId(c.id)
          }}
        />
      )}

      {open && <CustomerCard c={open} onClose={() => setOpenId(null)} onChanged={reload} />}
    </div>
  )
}

/** Bitta mijozning daftari: qoldiq, tarix, to'lov qabul qilish. */
function CustomerCard({ c, onClose, onChanged }: { c: Customer; onClose: () => void; onChanged: () => Promise<unknown> }) {
  const [entry, setEntry] = useState<'debt' | 'payment' | null>(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(c.name)
  const [phone, setPhone] = useState(c.phone ?? '')
  const [error, setError] = useState('')
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const balance = balanceOf(c)
  const history = [...(c.ledger ?? [])].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))

  return (
    <Modal title="Nasiya daftari" onClose={onClose} wide>
      <div className="debt-head">
        <span className="avatar big" style={hueStyle(c.name)}>{c.name.slice(0, 1).toUpperCase()}</span>
        {editing ? (
          <div className="debt-edit">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ism" />
            <input className="input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
            {error && <span className="error small">{error}</span>}
            <div className="row-actions">
              <button className="btn ghost small" onClick={() => setEditing(false)}>Bekor</button>
              <button
                className="btn primary small"
                onClick={async () => {
                  const err = await updateCustomer(c.id, name, phone)
                  if (err) return setError(err)
                  setEditing(false)
                  onChanged()
                }}
              >
                Saqlash
              </button>
            </div>
          </div>
        ) : (
          <div className="debt-who">
            <b className="big">{c.name}</b>
            <span className="muted">
              {c.phone ? <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`}>{c.phone}</a> : 'telefon yozilmagan'}
              <button className="icon" aria-label="Tahrirlash" onClick={() => setEditing(true)}><IconEdit /></button>
            </span>
          </div>
        )}
        <div className={`debt-total${balance > 0 ? ' owe' : ''}`}>
          <span>{balance > 0 ? 'Qarzi' : balance < 0 ? 'Ortiqcha to\'lagan' : 'Qarzi yo\'q'}</span>
          <b>{formatSum(Math.abs(balance))}</b>
        </div>
      </div>

      <div className="debt-actions">
        <button className="btn primary grow" onClick={() => setEntry('payment')}>To'lov qabul qilish</button>
        <button className="btn ghost grow" onClick={() => setEntry('debt')}>+ Nasiya qo'shish</button>
      </div>

      <div className="ledger">
        {history.map((e) => (
          <div key={e.id} className={`ledger-row ${e.kind}`}>
            <span className="ledger-date">{fmtDate(e.date)}</span>
            <span className="ledger-what">
              <b>{e.kind === 'debt' ? 'Nasiya oldi' : "Pul to'ladi"}</b>
              <span className="muted small">{[e.saleNumber && `Chek №${e.saleNumber}`, e.note].filter(Boolean).join(' · ')}</span>
            </span>
            <span className="ledger-sum">{e.kind === 'debt' ? '+' : '−'}{formatSum(e.amount)}</span>
            {confirmDel === e.id ? (
              <button
                className="btn danger small"
                onClick={async () => {
                  await deleteLedgerEntry(c.id, e.id)
                  setConfirmDel(null)
                  onChanged()
                }}
              >
                O'chirilsinmi?
              </button>
            ) : (
              <button className="icon danger" aria-label="O'chirish" onClick={() => setConfirmDel(e.id)}><IconTrash /></button>
            )}
          </div>
        ))}
      </div>

      {entry && (
        <EntryForm
          title={entry === 'payment' ? "To'lov qabul qilish" : "Nasiya qo'shish"}
          kind={entry}
          defaultAmount={entry === 'payment' && balance > 0 ? balance : undefined}
          onClose={() => setEntry(null)}
          onSave={async (_n, _p, e) => {
            await addLedgerEntry(c.name, undefined, e)
            setEntry(null)
            onChanged()
          }}
        />
      )}
    </Modal>
  )
}

/** Yozuv qo'shish: summa, sana (eski daftar uchun), izoh. Yangi nasiyada — kimga va telefon. */
function EntryForm({
  title, kind, askCustomer, defaultAmount, onClose, onSave,
}: {
  title: string
  kind: LedgerEntry['kind']
  askCustomer?: boolean
  defaultAmount?: number
  onClose: () => void
  onSave: (name: string, phone: string, e: Omit<LedgerEntry, 'id' | 'createdAt'>) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState(defaultAmount ? String(defaultAmount) : '')
  const [date, setDate] = useState(today())
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const sum = parseSum(amount)
  const ok = Number.isFinite(sum) && sum > 0 && (!askCustomer || (name.trim() && phone.replace(/\D/g, '').length >= 9))

  return (
    <Modal title={title} onClose={onClose} center>
      <form
        className="entry-form"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!ok || busy) return
          setBusy(true)
          // Bugungi sana — hozirgi vaqt bilan; o'tgan sana — kun boshi.
          const when = date === today() ? new Date().toISOString() : new Date(`${date}T12:00:00`).toISOString()
          await onSave(name, phone, { kind, amount: sum, note: note.trim(), date: when })
        }}
      >
        {askCustomer && (
          <>
            <label className="field">
              <span>Kimga</span>
              <CustomerInput value={name} onChange={setName} onPick={(c) => c.phone && setPhone(c.phone)} autoFocus />
            </label>
            <label className="field">
              <span>Telefon</span>
              <input className="input" type="tel" inputMode="tel" placeholder="+998 90 123 45 67" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </label>
          </>
        )}
        <label className="field">
          <span>Summa, so'm</span>
          <MoneyInput value={amount} onChange={setAmount} placeholder="0" autoFocus={!askCustomer} />
        </label>
        <label className="field">
          <span>Sana</span>
          <input className="input" type="date" value={date} max={today()} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="field">
          <span>Izoh (ixtiyoriy)</span>
          <input className="input" value={note} placeholder={kind === 'debt' ? 'masalan: daftardan, 3 pachka' : 'masalan: naqd, kartaga'} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>Bekor</button>
          <button type="submit" className="btn primary grow" disabled={!ok || busy}>Saqlash</button>
        </div>
      </form>
    </Modal>
  )
}

import { describe, expect, it } from 'vitest'
import { merge, stamp, type CountSession } from './countSync'

const base = (over: Partial<CountSession> = {}): CountSession => ({ startedAt: '2026-10-24T05:00:00.000Z', scans: {}, order: [], brands: [], ignored: [], ...over })

describe('qayta sanash: qurilmalar orasida birlashtirish', () => {
  it('eski (faqat shu kompyuterdagi) natija bazaga birinchi marta to\'liq o\'tadi', () => {
    const local = base({ scans: { a: 1, b: 1 }, order: ['b', 'a'], relabel: ['b'] })
    const m = merge(local, null)!
    expect(Object.keys(m.scans).sort()).toEqual(['a', 'b'])
    expect(m.order).toEqual(['b', 'a'])
    expect(m.relabel).toEqual(['b'])
  })
  it('ikki qurilmadagi skanerlar qo\'shiladi', () => {
    const a = stamp(null, base({ sid: 's1', scans: { x: 1 }, order: ['x'] }), 1000)
    const b = stamp(null, base({ sid: 's1', scans: { y: 1 }, order: ['y'] }), 2000)
    const m = merge(a, b)!
    expect(m.order).toEqual(['y', 'x'])
  })
  it('bekor qilingan skaner boshqa qurilmadan qaytib kelmaydi', () => {
    const a1 = stamp(null, base({ sid: 's1', scans: { x: 1 }, order: ['x'] }), 1000)
    const remote = a1
    const a2 = stamp(a1, { ...a1, scans: {}, order: [] }, 2000)
    expect(merge(a2, remote)!.scans).toEqual({})
    expect(merge(remote, a2)!.scans).toEqual({})
  })
  it('bir xil eski natija ikki kompyuterda — bitta sanash deb qo\'shiladi', () => {
    const pc1 = base({ scans: { a: 1 }, order: ['a'] })
    const remote = merge(pc1, null)!
    const pc2 = stamp(remote, { ...remote, scans: { ...remote.scans, b: 1 }, order: ['b', ...remote.order] }, Date.parse('2026-10-24T09:00:00Z'))
    expect(Object.keys(merge(pc1, pc2)!.scans).sort()).toEqual(['a', 'b'])
  })
  it('boshqa (keyin boshlangan) sanash eskisining o\'rnini oladi', () => {
    const old = base({ scans: { a: 1 }, order: ['a'] })
    const fresh = base({ sid: 'n', startedAt: '2026-10-25T05:00:00.000Z', scans: { z: 1 }, order: ['z'] })
    expect(Object.keys(merge(old, fresh)!.scans)).toEqual(['z'])
    expect(Object.keys(merge(fresh, old)!.scans)).toEqual(['z'])
  })
  it('"boshidan boshlash" eski natijani boshqa qurilmada ham tozalaydi', () => {
    const old = base({ scans: { a: 1 }, order: ['a'] })
    expect(merge(old, { resetAt: Date.parse('2026-10-24T07:00:00Z') })).toBeNull()
    const fresh = base({ sid: 'n', startedAt: '2026-10-24T08:00:00.000Z' })
    expect(merge(fresh, { resetAt: Date.parse('2026-10-24T07:00:00Z') })).not.toBeNull()
  })
})

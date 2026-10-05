/**
 * Orqaga tugmasi (telefon va brauzer). Har ochilgan oyna (modal, menyu) tarixga bitta qadam qo'shadi —
 * orqaga bosilsa shu oyna yopiladi. Oynalar bo'lmasa — ilovaning o'z ishlovchisi (bo'limlar) chaqiriladi.
 *
 * history.back() kechikib bajariladi, shuning uchun tarix amallari navbat bilan, bittadan bajariladi:
 * "orqaga" tugamaguncha keyingi amal kutadi.
 */
import { useEffect, useRef } from 'react'

interface Layer { close: () => void; byHistory: boolean }

const layers: Layer[] = []
const ops: (() => void)[] = []
let waitingPop = false
let base: (() => void) | null = null

function pump() {
  while (!waitingPop && ops.length) ops.shift()!()
}

function run(op: () => void) {
  ops.push(op)
  pump()
}

/** O'zimiz chaqirgan "orqaga" — tugashini kutamiz, ishlovchilar chaqirilmaydi. */
function silentBack() {
  waitingPop = true
  history.back()
}

window.addEventListener('popstate', () => {
  if (waitingPop) {
    waitingPop = false
    pump()
    return
  }
  const top = layers.pop()
  if (top) {
    top.byHistory = true
    top.close()
    return
  }
  base?.()
})

/** Oynalar bo'lmaganda orqaga bosilsa nima bo'lishi. */
export function setBaseBack(fn: (() => void) | null) {
  base = fn
}

/**
 * Tarixni o'zgartirish (bo'lim almashganda). Yopilayotgan oynalarning qadamlari olib tashlangach bajariladi.
 * React oynalarni biroz keyin yopadi (ayniqsa await dan keyin) — shuning uchun qisqa kutamiz.
 */
export function afterNav(fn: () => void) {
  setTimeout(() => run(fn), 60)
}

/** Joriy qadamni olib tashlash (masalan, bo'limdan kassaga qaytganda). */
export function dropEntry() {
  silentBack()
}

/** Oyna ochilganda chaqiriladi; qaytgan funksiya — oyna yopilganda. */
function pushLayer(close: () => void): () => void {
  const layer: Layer = { close, byHistory: false }
  layers.push(layer)
  run(() => history.pushState({ v: 'layer' }, ''))
  return () => {
    const i = layers.indexOf(layer)
    if (i !== -1) layers.splice(i, 1)
    if (!layer.byHistory) run(silentBack)
  }
}

/** Komponent ko'rinib turgan paytda orqaga tugmasi uni yopadi. */
export function useBackClose(onClose: () => void) {
  const ref = useRef(onClose)
  ref.current = onClose
  useEffect(() => pushLayer(() => ref.current()), [])
}

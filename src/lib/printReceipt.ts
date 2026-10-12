/**
 * Chekni alohida (yashirin) sahifada chop etish: sahifada faqat chekning o'zi bo'ladi,
 * sahifa uzunligi esa chek uzunligiga teng — printer oldidan ham, keyin ham bo'sh qog'oz chiqarmaydi.
 * Oynadagi ochiq chek (.print-area .receipt) olinadi; topilmasa — oddiy window.print().
 */
export function printReceipt(): void {
  const src = document.querySelector<HTMLElement>('.print-area .receipt')
  if (!src) return window.print()

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, { position: 'fixed', left: '-10000px', top: '0', width: '400px', height: '800px', border: '0' })
  document.body.appendChild(frame)
  const doc = frame.contentDocument!
  const styles = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join('')
  doc.open()
  doc.write(`<!doctype html><html><head><meta charset="utf-8">${styles}
    <style>
      html, body { margin: 0; padding: 0; background: #fff; }
      .print-area { position: static !important; visibility: visible !important; }
      .print-area * { visibility: visible !important; }
    </style></head><body><div class="print-area">${src.outerHTML}</div></body></html>`)
  doc.close()

  const run = () => {
    const win = frame.contentWindow!
    const receipt = doc.querySelector<HTMLElement>('.receipt')
    const pw = receipt ? getComputedStyle(receipt).getPropertyValue('--pw').trim() || '48mm' : '48mm'
    // Chop etish ko'rinishida chek balandligini o'lchab, sahifani shu uzunlikda qilamiz (+4 mm zaxira).
    const probe = doc.createElement('style')
    probe.textContent = `.receipt { width: ${pw} !important; padding: 0 !important; font-size: 11px; overflow-wrap: anywhere; }`
    doc.head.appendChild(probe)
    const mm = Math.ceil((receipt?.getBoundingClientRect().height ?? 600) / 3.7795) + 4
    const page = doc.createElement('style')
    page.textContent = `@page { size: ${pw} ${mm}mm; margin: 0; } @media print { body * { visibility: visible !important; } }`
    doc.head.appendChild(page)
    const cleanup = () => setTimeout(() => frame.remove(), 500)
    win.addEventListener('afterprint', cleanup, { once: true })
    setTimeout(() => frame.isConnected && frame.remove(), 60_000)
    win.focus()
    win.print()
  }
  // Rasmlar (logotip) va shriftlar yuklanishini kutamiz.
  const imgs = [...doc.images].filter((i) => !i.complete)
  Promise.all([
    doc.fonts?.ready,
    ...imgs.map((i) => new Promise((r) => { i.onload = i.onerror = r })),
  ]).then(() => setTimeout(run, 50))
}

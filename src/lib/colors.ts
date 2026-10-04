import type React from 'react'

/** Har brendga doimiy rang (nomidan): kartalar va belgilarda farqlash uchun. */
export function brandHue(name: string): number {
  let h = 0
  for (const ch of name.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

export const hueStyle = (name: string) => ({ '--h': brandHue(name) }) as React.CSSProperties

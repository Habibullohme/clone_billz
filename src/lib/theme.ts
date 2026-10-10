export type Theme = 'auto' | 'light' | 'dark'

/** Mavzuni sahifaga qo'llaydi: "auto" — kompyuter/telefon sozlamasiga qarab. */
export function applyTheme(t: Theme) {
  const root = document.documentElement
  if (t === 'auto') delete root.dataset.theme
  else root.dataset.theme = t
}

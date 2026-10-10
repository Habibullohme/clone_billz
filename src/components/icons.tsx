/** Menyu belgilari: chiziqli, 20×20, joriy rang bilan. */
const S = ({ d }: { d: string }) => (
  <svg viewBox="0 0 20 20" width="19" height="19" aria-hidden="true">
    <path d={d} fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

export const IconSales = () => <S d="M3 16.5h14M5.5 13V9M10 13V5M14.5 13v-5.5" />
export const IconBox = () => <S d="M3 6.5L10 3l7 3.5v7L10 17l-7-3.5zM3 6.5l7 3.5 7-3.5M10 10v7" />
export const IconTag = () => <S d="M3 3h6.5L17 10.5 10.5 17 3 9.5zM6.5 6.5h.01" />
export const IconGear = () => (
  <svg viewBox="0 0 20 20" width="19" height="19" aria-hidden="true">
    <circle cx="10" cy="10" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
    <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
  </svg>
)
/** Nasiya daftari. */
export const IconDebt = () => <S d="M5 3h9.5v14H5zM5 3v14M8 7h4M8 10.5h4M8 14h2.5" />
export const IconCashbox = () => <S d="M3 8h14v8H3zM5.5 8V4h9v4M7 12h6" />
export const IconTheme = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
    <path d="M10 2.75a7.25 7.25 0 1 0 0 14.5z" fill="currentColor" />
    <circle cx="10" cy="10" r="7.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
  </svg>
)

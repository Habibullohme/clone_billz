/** Do'kon telefonlari bitta matnda saqlanadi: "+998 90 …, +998 91 …" (vergul, nuqtali vergul yoki yangi qator). */
export const splitPhones = (s?: string | null) => (s ?? '').split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean)
export const joinPhones = (list: string[]) => list.map((x) => x.trim()).filter(Boolean).join(', ')

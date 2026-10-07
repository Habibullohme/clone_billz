# Telegram bot — o'rnatish

Bot Supabase'da (Edge Function) ishlaydi: kompyuter kerak emas, 24 soat ishlaydi.
Kod: `supabase/functions/bot/index.ts` (bitta fayl). Bazasi: `supabase/bot.sql`.

## 1. Baza jadvallari
Supabase → **SQL Editor** → New query → `supabase/bot.sql` matni → **Run**.

## 2. ID larni bilib olish
- **Kanal ID**: web.telegram.org/a/ da kanalni oching — manzil oxirida `#-100…` raqam: shu.
  Asosiy kanal va "Sotilganlar" kanali uchun alohida.
- **Sizning ID** (ADMIN_IDS): 5-qadamdan keyin botga /start yozsangiz — bot o'zi aytadi.
  (Bir nechta odam bo'lsa vergul bilan: `111,222`.)
- Bot ikkala kanalda **admin**: "Xabar joylash", "Xabarlarni tahrirlash", "Xabarlarni o'chirish".

## 3. Funksiyani joylash
Supabase → **Edge Functions** → **Deploy a new function** → **Via Editor**:
- nomi: `bot` (aynan shunday)
- `index.ts` o'rniga `supabase/functions/bot/index.ts` matnini qo'ying → **Deploy**.
- Funksiya sozlamalarida **"Verify JWT" (Enforce JWT verification)** ni **o'chiring**
  (Telegram kalit yubora olmaydi; bot o'zi tekshiradi).

## 4. Maxfiy sozlamalar
Supabase → **Edge Functions** → **Secrets** (yoki Project Settings → Edge Functions):

| Nomi | Qiymati |
|---|---|
| BOT_TOKEN | @BotFather bergan token |
| ADMIN_IDS | sizning Telegram ID (bilmasangiz hozircha `0`) |
| CHANNEL_ID | asosiy kanal ID (`-100…`) |
| SOLD_CHANNEL_ID | "Sotilganlar" kanal ID (`-100…`) |
| WEBHOOK_SECRET | o'zingiz o'ylab topgan uzun so'z, masalan `richmen-bot-2026-kalit` |

Bu qiymatlar hech qachon chatga yoki GitHub'ga yozilmaydi.

## 5. Botni ulash
Brauzerda oching (oxiriga o'zingizning WEBHOOK_SECRET):
`https://kvotnpqbktrroxmtylrw.supabase.co/functions/v1/bot?setup=WEBHOOK_SECRET`
"✅ Tayyor! Bot @… ulandi" chiqishi kerak.

Kompyuterdagi eski bot shu token bilan ishlayotgan bo'lsa — uni to'xtating.

## Ishlatish
- Bir xil narxdagi pachkalar rasmlarini yuboring (har rasm — 1 pachka) → "✅ Rasmlar tayyor".
- Bitta rasm yuborsangiz — "nechta pachka?" so'raydi.
- Brend → model → razmer → rang → juft → kelish narxi → sotuv narxi → ✅ Tasdiqlash.
- Tovar saytga tushadi (Tovarlar, Kirimlar: "Telegram bot"), har rasm kanalga chiqadi (kod bilan).
- Saytda sotilsa: hammasi sotilgan post "Sotilganlar"ga (kun, sana, vaqt, narx, chek) o'tadi va
  asosiy kanaldan o'chadi; bir postda bir necha pachka bo'lsa — "Mavjud: N pachka" kamayadi.
- Buyruqlar: /bekor — joriy kirimni bekor qilish, /sync — kanalni qo'lda yangilash.

## 📊 Boss panel (Telegram mini app) va 👥 Loginlar

- **Boss panel** — botdagi "📊 Boss panel" tugmasi (yoki chat pastidagi "📊 Boss") saytni `?boss` rejimida ochadi:
  sotuv/foyda (istalgan kun — `kk.oo.yyyy`), ombor, nasiyalar. Faqat ko'rish uchun, hech narsa o'zgartirilmaydi.
- Kirish: bot adminlari (ADMIN_IDS) — Telegram orqali parolsiz; boshqalar — botda berilgan login/parol.
  Keyin har safar do'kon PIN kodi so'raladi.
- **👥 Loginlar** (faqat ADMIN_IDS dagi birinchi — asosiy admin): login yaratish, parolni almashtirish, o'chirish.
  Login sayt domenidagi email bo'lib saqlanadi (`ali` → `ali@richmen.netlify.app`, xat yuborilmaydi) va saytga ham kiradi.
- Sayt manzili boshqa bo'lsa — Supabase → Edge Functions → Secrets ga `SITE_URL` qo'shing (masalan `https://richmen.netlify.app`).
- Bot kodi yangilangach, `...functions/v1/bot?setup=<WEBHOOK_SECRET>` ni bir marta oching — chat pastida "📊 Boss" tugmasi paydo bo'ladi.

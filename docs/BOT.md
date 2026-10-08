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

## 🔐 Hisob turlari va botga kirish

- **👥 Loginlar → ➕ Yangi login**: avval tur tanlanadi — 👔 Boss (sotuv, foyda, ombor, nasiya) yoki 🛒 Sotuvchi (narx, qoldiq, cheklar).
- Boshqa odam botga /start bosadi → **🔐 Kirish** → login → parol (xabar darhol o'chiriladi).
  Kirgach, chatdagi ko'k tugma va pastki tugma panelni ochadi — mini app login so'ramaydi. **🚪 Chiqish** yoki /logout.
- Xavfsizlik: 5 marta noto'g'ri parol — 15 daqiqa (keyin 30, 60… 24 soatgacha) to'xtatiladi va asosiy adminga xabar boradi;
  bitta login faqat bitta Telegramda ochiq bo'ladi; parol kamida 8 belgi (harf + raqam);
  parol almashtirilsa — eski parol bilan ochilgan hamma joydan (sayt, mini app) chiqariladi; hisob turi `app_metadata` da (foydalanuvchi o'zi o'zgartira olmaydi).
- Bot kodi yangilangach `...functions/v1/bot?setup=<WEBHOOK_SECRET>` ni yana bir marta oching.

## Yangilanish: 🛠 Admin va 📊 Kuzatuvchi

- Hisob turlari: **🛠 Admin** — mini app'da to'liq sayt (kassa, tovarlar, kirim, etiketka) telefon ko'rinishida;
  **📊 Kuzatuvchi** — faqat statistika (PIN bilan). Kuzatuvchi saytga kirsa ham faqat statistikani ko'radi.
  Eski turlar: Boss → Kuzatuvchi, Sotuvchi → Admin.
- Bot egasi (ADMIN_IDS) mini app'da statistikani ko'radi, "🛠 Admin" tugmasi bilan to'liq saytga o'tadi
  (Telegram'ning ← tugmasi bilan qaytadi).
- Botga kirish bitta xabarda: 🔐 Kirish → login → parol (yozilganlari darhol o'chadi). Login yo'q bo'lsa — o'sha xabarda aytiladi.
  3 marta noto'g'ri — 15 daqiqa (keyin 30, 60…) to'xtatiladi.
- Yuk qo'shish savollari bitta kartochkada (javoblar o'chib, kartochkada yig'iladi);
  "✍️ Qo'lda kiritish", "❌ Bekor qilish", "✅ Tasdiqlash" — pastki tugmalar; narxlar uchun oxirgi ishlatilganlar tugmada.

## Yangilanish: pastki tugmalar va bitta "ekran"

- Bot menyulari (Asosiy menyu, ⚙️ Sozlamalar, 👥 Loginlar, login kartasi, kirish oynasi) — pastki tugmalarda, hammasida **⬅️ Orqaga**.
  Tugma bosilganda (yoki javob yozilganda) yozilgan xabar o'chadi, tepadagi bot xabari yangilanadi — chatda bitta "ekran" turadi.
- Kirim savollaridagi variantlar (brend, razmer, rang, narx) — xabar tagida; "✍️ Qo'lda kiritish", "❌ Bekor qilish", "✅ Tasdiqlash" — pastda.
- **📊 Kuzatuvchi PIN kodi** — shaxsiy: birinchi marta panelni ochganda o'zi yaratadi, botda /changepass bilan o'zgartiradi,
  unutsa — asosiy admin 👥 Loginlar → login → 🔢 PIN reset. PIN o'zi saqlanmaydi (maxfiy kalit bilan imzolangan izi), 5 marta xato — 15 daqiqa.

## Yangilanish: hisoblar, qurilmalar, kanallar

- **👥 Loginlar** endi hamma hisoblarni ko'rsatadi: 📧 email hisoblar (masalan egasining gmail'i), 🤖 bot adminlari (Telegram orqali), 👤 loginlar.
  Har hisobda **📱 Qurilmalar**: qayerda ochiq (sayt, Telegram) — tanlab yoki hammasidan chiqarish. Turini almashtirish — tasdiq bilan.
- **📣 Kanallar** (⚙️ Sozlamalar ichida): botni kanalga admin qilib, kanaldan xabar forward qiling yoki @nom yozing.
  Botdan ulangan kanal Secrets'dagi CHANNEL_ID / SOLD_CHANNEL_ID dan ustun turadi.
- Mini app manzili `?boss`siz bo'lsa ham (BotFather "Open" tugmasi) panel hisob turiga qarab ochiladi.
- Telefonda sayt ochilsa — "📱 Telegram botda ochish" taklifi chiqadi.

### Asosiy botga ko'chirish
1. @BotFather'da asosiy bot tokenini oling.
2. Supabase → Edge Functions → Secrets: `BOT_TOKEN` ni yangisiga almashtiring (ADMIN_IDS, WEBHOOK_SECRET o'zgarmaydi).
3. `...functions/v1/bot?setup=<WEBHOOK_SECRET>` ni oching (webhook asosiy botga o'tadi).
4. Asosiy botni kanallarga admin qiling, botda ⚙️ Sozlamalar → 📣 Kanallar orqali ulang.
5. BotFather'da asosiy bot uchun Main Mini App yoqing. Loginlar o'zgarmaydi; foydalanuvchilar yangi botda bir marta 🔐 Kirish qiladi.

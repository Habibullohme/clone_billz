# Loyiha talablari (Billz o'rniga)

Ulgurji oyoq kiyim do'koni uchun sayt + Telegram bot. Maqsad: Billz (oyiga 100 000 so'm)
o'rniga bepul hostingda ishlaydigan, qulayroq tizim.

> Muhim sana: Billz obunasi to'lovi **11.10.2026** gacha. Shungacha asosiy qism ishlashi kerak.

## 1. Asosiy biznes qoidalari

- **Savdo pachkalab.** Bitta pachkada odatda **5 juft**, "Velikan" (katta razmer)da **3 juft**,
  ba'zilarida **6 juft**. Pachka hajmi har bir mahsulotda alohida saqlanadi (standart: 5).
- **Narx juftlik uchun saqlanadi** (so'mda). Masalan: kelish 160 000, sotuv 190 000.
- **Foyda** = (sotuv narxi − kelish narxi) × juftlar soni.
  Misol: (190 000 − 160 000) × 5 = **150 000 so'm** bir pachkadan.
- **Shtrix-kod vitrinadagi namuna poyabzalga** yopishtiriladi (bitta model = bitta shtrix-kod).
  Skaner qilinganda **bitta pachka** savatchaga tushadi.
- Valyuta: asosan **UZS**, lekin to'lovda **dollar** ham qabul qilinadi
  (masalan: 100 $ × 11 850 = 1 185 000 so'm, qolgani so'mda; qaytim hisoblanadi).

## 2. Sotuv (kassa) ekrani

Skaner qilinganda savatchada shunday ko'rinadi:

```
Little 05                         160 000 so'm
  5 juft × 160 000 = 800 000            [−] 1 pachka [+]
---------------------------------------------------
Jami:                                 800 000 so'm
```

- Qidiruv: artikul, shtrix-kod, nom (qidiruvga yozib ham qo'shish mumkin). `/` tugmasi qidiruvga o'tadi.
- Skaner (USB, klaviatura kabi ishlaydi) → avtomatik savatchaga.
- Miqdor pachkada o'zgaradi; kerak bo'lsa donalab ham.
- Mijoz tanlash / yangi mijoz yaratish.
- Chegirma: summa yoki %, tezkor tugmalar (50K, 100K, 500K, 1M).
- Eslatma qo'shish.
- To'lov: naqd so'm, karta, dollar (kurs bilan), aralash, **nasiya (qarz)**.
- Savdoni **kechiktirish** (savatchani saqlab, keyin davom ettirish).
- Chek chop etish.
- Sotuv raqami (#010000030226 kabi).

## 3. Mahsulotlar

- **Katalog**: rasm, brend, nom, artikul, shtrix-kod, toifa, miqdor, kelish narxi, sotuv narxi,
  chegirma narxi, pachka hajmi.
  Tablar: Barchasi / Faollar / Faol emas / Kam qoldiq / Nol qoldiq.
  Qoldiq ham **juftda**, ham **pachkada** ko'rsatiladi.
- **Import (kirim)**: har bir yuk = bitta hujjat. ID, sana, miqdor, kelish/sotuv summasi,
  holat (Yakunlangan / Bekor qilingan), kim yaratdi/yakunladi, turi (Kirim / Qoldiq kirimi / Tuzatish),
  **sotuvlar taraqqiyoti %** (shu yukning qanchasi sotilgan).
- Shtrix-kod: EAN-13, `2` bilan boshlanadi, ketma-ket (Billz'dagilar kabi 2000000011790...).
  Billz'dan ko'chirilgan eski kodlar o'zgarmaydi.
- **Shtrix-kod chop etish bo'limi**: "Bugun qo'shilganlar" / import bo'yicha tanlab, birdaniga chop etish.
- Hisobdan chiqarish, qayta baholash.

## 4. Telegram bot va kanal

1. Yuk kelganda botga rasm + qisqa izoh yoziladi.
2. Bot tushunib, ko'rinishini ko'rsatadi: ✅ Tasdiqlash / ✏️ Tuzatish / ❌.
3. Tasdiqlangach: kanalga post (rasm, nom, narx, razmer; kelish narxi ko'rinmaydi),
   saytga mahsulot, shtrix-kod yaratiladi, Import hujjati ochiladi.
4. Har kuni kechqurun botga kunlik hisobot: savdo, foyda, brendlar bo'yicha.

## 5. Sotuvlar ro'yxati

- Barcha sotuvlar: qidiruv (ID, mijoz, sotuvchi), sana, filtrlar.
- Yon panel: tranzaksiyalar soni (tovarlar, qaytarishlar + summasi, almashtirishlar + summasi),
  tranzaksiyalar summasi, mijozlar balansi. "Hisobotni chop etish".
- Qaytarish va almashtirish.

## 6. Mijozlar

- Ro'yxat: ID, F.I.Sh., telefon, guruh, xaridlar summasi, oxirgi xarid, balans, **joriy qarz**.
- Statistika: jami mijozlar, o'tgan hafta yangilar, qaytib kelmaydiganlar.
- **Qarzlar (nasiya)**: Qarzlar / To'lovlar tablari; Barchasi / Muddati o'tgan / To'lanmagan /
  To'langan / Qisman to'langan. Qarzlar summasi, to'langan, qoldiq, qarzdorlar soni.
  Qarz to'lovini qabul qilish.

## 7. Dashboard va hisobotlar

- Davr: Kecha / Bugun / Hafta / Oy / Yil / sana.
- Sotuvlar grafigi (soatlar/kunlar bo'yicha), to'lovlar summasi, tranzaksiyalar soni.
- **Foyda**, top mahsulotlar, **brendlar bo'yicha sotuv**, top sotuvchilar.
- Hisobotlar: Do'kon (yig'ma), Mahsulotlar, Sotuvchilar, Mijozlar.

## 8. Foydalanuvchilar

- Login bor. Ro'yxatdan o'tish yo'q — akkauntlar egasi tomonidan qo'lda yaratiladi.
- Rollar: **ega** (hamma narsa) va **sotuvchi** (faqat sotuv; kelish narxi va foydani ko'rmaydi).

## 9. Texnik yo'nalish (taklif)

- Sayt: Netlify yoki Cloudflare Pages (bepul, tijorat uchun ruxsat).
- Baza + login + rasmlar: Supabase (bepul tarif).
- Bot: serverless funksiya (webhook), kunlik hisobot — cron.
- Billz'dan ko'chirish: katalogni "Yuklab olish" (Excel) orqali bir martalik import.

## 10. Billz'dan nimani olamiz, nimani olmaymiz

### ✅ Birinchi navbatda (11.10 gacha)
- Login, ega / sotuvchi rollari, parolni o'zgartirish.
- Katalog (pachka hajmi bilan), qidiruv, kam / nol qoldiq.
- Import (kirim) hujjatlari + sotuvlar taraqqiyoti %.
- Shtrix-kod yaratish va etiketka chop etish.
- Kassa: skaner, pachka × juft hisobi, chegirma, so'm/dollar/karta/aralash to'lov, chek.
- Barcha sotuvlar ro'yxati, qaytarish.
- Billz katalogini Excel'dan ko'chirish.

### ✅ Ikkinchi navbatda
- Telegram bot: yuk kiritish, kanalga post, kunlik hisobot.
- Mijozlar va nasiya (qarzlar, qarz to'lovi, muddati o'tganlar).
- Dashboard va hisobotlar:
  - Tovarlar / **brendlar** bo'yicha sotuv va foyda.
  - Importlar (har bir yuk qanchasi sotilgan).
  - Qoldiqlar (miqdor, kelish va sotuv narxida qiymati).
  - Tovarlar samaradorligi (davr boshida bor edi → sotildi → qoldi).
  - ABC-tahlil (qaysi modellar foydaning asosiy qismini beradi).
  - Sotuvchilar bo'yicha.

### ⚙️ Sozlamalardan olinadiganlar
- Erkin narx: sotuvda narxni o'zgartirish (faqat ega yoki ruxsat berilgan sotuvchi).
- Kam qoldiq chegarasi (pachkada).
- Manfiy qoldiq: omborda yo'q bo'lsa ham sotishga ruxsat (yoqish/o'chirish).
- Tezkor chegirma tugmalari (summa yoki %) — o'zgartirsa bo'ladi.
- Chek: do'kon nomi, telefon, pastki matn; chek o'lchami (58/80 mm).
- Dollar kursi.
- Mahsulot maydonlari qat'iy: brend, model, artikul, razmer qatori, rang, toifa, pachka hajmi, rasm.

### ❌ Olmaymiz (keraksiz yoki keyinroq)
- Bir nechta do'kon / filial, bir nechta kassa.
- Xizmatlar, to'plamlar, sovg'a sertifikatlari, bonus/balans tizimi.
- Marketing, SMS-tarqatish, tug'ilgan kunlar, mijoz guruh/teglari.
- Bir mahsulotga bir nechta shtrix-kod, "tez qo'shish" (bot buni almashtiradi).
- O'lchov birliklari jadvali (bizda faqat juft / pachka).
- Inventarizatsiya, yetkazib beruvchilar, buyurtma qaytarishlari — kerak bo'lsa keyin.
- Qurilmalar / seanslar boshqaruvi, avatarlar.

## 11. Telegram bot xabarnomalari (Billz'dagi kabi, o'zimizga moslab)

Botga faqat **ega** (va ruxsat berilganlar) ulanadi. Har bir xabar turini sozlamalardan yoqish/o'chirish mumkin.

1. **Har bir sotuv** (darhol):
   ```
   🧾 Sotuv #0001234 · 03.10.2026 15:40
   Sotuvchi: Ali
   Little 05 — 2 pachka (10 juft) × 160 000 = 1 600 000
   Ezel 18  — 1 pachka (5 juft)  × 110 000 =   550 000
   Jami: 2 150 000 so'm
   💵 Naqd: 965 000 · 💲 100 $ (×11 850) · 💳 Karta: 0
   Foyda: 300 000 so'm   ← faqat egaga
   ```
2. **Qaytarish** — xuddi shu ko'rinishda.
3. **Qarz to'lovi** — mijoz, to'langan summa, qolgan qarz.
4. **Kunlik hisobot** (belgilangan vaqtda, masalan 21:00), **haftalik** (dushanba), **oylik** (1-sana):
   tushum, sof foyda, sotuvlar soni, sotilgan pachka/juft, to'lov turlari (so'm/$/karta/nasiya),
   **brendlar bo'yicha** (tushum, foyda), top-10 model, yangi qarzlar, kam qolgan tovarlar.
5. **So'rov bo'yicha** (bot buyruqlari): `/bugun`, `/hafta`, `/oy`, `/top`, `/brendlar`, `/qoldiq <nom>`, `/qarzlar`.
6. **Tizimga kirish** — kim, qachon kirdi (xavfsizlik uchun).

Billz'dan farqi: xabarlarda pachka × juft ko'rinadi va foyda hisoblanadi; filial bo'yicha bo'linish yo'q.

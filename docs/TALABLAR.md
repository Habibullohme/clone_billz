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
- Shtrix-kod va artikul **o'zimizniki** (Billz'niki ishlatilmaydi):
  shtrix-kod EAN-13, `21` bilan boshlanadi, ketma-ket (2100000000012...); artikul — brendning 3 harfi + raqam (NIK-0007).
- Tovarlar **Excel shablon** orqali kiritiladi (`docs/tovarlar-shablon.xlsx`): Brend, Model nomi, Razmer, Rang,
  Pachkada (juft), Kelish narxi (1 juft), Sotuv narxi (1 juft).
  Har bir qator — bitta pachka, alohida tovar, o'z shtrix-kodi bilan (birlashtirilmaydi).
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
- Billz'dan hech narsa ko'chirilmaydi — tovarlar shablon orqali yangidan kiritiladi.

## 10. Billz'dan nimani olamiz, nimani olmaymiz

### ✅ Birinchi navbatda (11.10 gacha)
- Login, ega / sotuvchi rollari, parolni o'zgartirish.
- Katalog (pachka hajmi bilan), qidiruv, kam / nol qoldiq.
- Import (kirim) hujjatlari + sotuvlar taraqqiyoti %.
- Shtrix-kod yaratish va etiketka chop etish.
- Kassa: skaner, pachka × juft hisobi, chegirma, so'm/dollar/karta/aralash to'lov, chek.
- Barcha sotuvlar ro'yxati, qaytarish.
- Tovarlarni Excel shablondan import qilish.

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

## 12. Foydalanuvchi fikrlari (sinovdan keyin)

- Billz'ning nusxasi emas — zamonaviy, sodda, tez. Ekranda faqat kerakli ma'lumot.
- Qidiruv — **Space** tugmasi (`/` emas).
- To'lovda naqd — "qolgani": karta/dollar/nasiya yozilsa naqd o'zi kamayadi; naqdni qo'lda yozsa qaytim chiqadi.
- Sotuvlar bo'limida juft soni kerak emas.
- Sozlamalar — bo'limlarga ajratilgan to'liq sahifa.
- Kechiktirish funksiyasi yoqdi.

## 13. Kassa rejimi, etiketka shablonlari, login (3-sinovdan keyin)

- Kassa ekranida faqat do'kon logosi/nomi, soat va ☰ menyu. Sotuvlar, Tovarlar, Etiketkalar,
  Sozlamalar — menyuda, egasining PIN kodi bilan.
- Chek oynasi: Space — chop etish, Enter — yangi sotuv.
- Yangi tovar formasi: brend, razmer, pachka hajmi eslab qolinadi; bir modelga bir nechta rang (har biri alohida tovar).
- Etiketka shablonlari (Billz'dagi "narx yorlig'i" kabi): nomi, eni/bo'yi (mm), shtrix-kod formati,
  maydonlar (nom, brend, razmer, rang, pachka, narx, artikul, shtrix-kod) tartibi, shrift, qalin, tekislash.
  Soni: kirim bo'yicha / qoldiq bo'yicha / har biriga 1. Sinov chop etish (1 ta).
- Login (reja): Telegram orqali. Egasi bot ichidagi mini-app'dan parolsiz kiradi; kompyuterda
  "Telegram orqali kirish" — bot tasdiq so'raydi; seans uzoq saqlanadi (Telegram Web kabi).
  "Qurilmalar" bo'limi: qaysi qurilmalar kirgan, oxirgi faollik, chiqarib yuborish; yangi kirish haqida botga xabar.
- Kod (brend harfi + raqam) g'oyasi bekor qilindi — egasi boshqa narsani nazarda tutgan, keyinroq muhokama qilinadi.
- Tovarlar bo'limi brendlar bo'yicha: tepada jami pachka, sotuv va kelish narxidagi qiymat; pastda brend kartalari.
  Brendni bossa — o'sha brendning pachkalari, qiymati va tovarlari ro'yxati.
- Brendlar Sozlamalar → Brendlar'da kiritiladi, yangi tovar formasida ro'yxatdan tanlanadi.
- Chek kengligi qo'lda (mm) ham sozlanadi. Mavzu: Avto / Yorug' / Qorong'i (kassa tepasida tezkor tugma).
- PIN to'liq terilishi bilan o'zi ochiladi.

## 14. Har bir qator — bitta pachka (4-sinovdan keyin)

- Har bir pachka bazada alohida qator. "+ Tovar" da 7 pachka kiritilsa — 7 ta qator qo'shiladi.
- Model nomi yoniga brend bo'yicha kod avtomatik qo'shiladi: "Little qalin A20". Har brendning hisobi
  A1 dan boshlanadi, A200 dan keyin B1, C1 … Formada oldindan ko'rsatiladi: "Kodlar: A20 – A26".
  Excel importda ham shunday.
- Tovarlar: brend kartasida faqat pachka soni va qiymati ("model" yozuvi yo'q); sotilgan pachka "sotilgan"
  deb turadi, kartada "Bugun N ta sotildi".
- Jadvalda har qatorda tahrirlash / o'chirish; belgilab bir nechtasini birdaniga o'chirish.
  Sotilgan tovar o'chirilmaydi (hisobot buzilmasligi uchun).
- "Kirimlar" ro'yxati: raqam, sana-vaqt, manba, brendlar, pachka, summa, sotilish foizi; etiketka va kirimni o'chirish.
- "Egasi rejimi" yozuvi olib tashlandi; yorug' mavzu kuchaytirildi (aniq chegaralar, soyalar).

## 15. 5-sinovdan keyin

- Bir xil nomli ikki tovar bo'lmaydi: tahrirlashda band nom yozilsa — saqlanmaydi ("Bu nom band").
  Yangi kirimda ham avtomatik kod band nom bilan to'qnashsa, keyingi kod olinadi.
- Artikul ichki raqam edi va hech narsaga ishlatilmasdi — ko'rsatilmaydi. Shtrix-kod — etiketka va skaner uchun.
- Etiketkalar: "Qo'lda tanlash" — barcha tovarlar ro'yxati (qidiruv, brend bo'yicha filtr, belgilash).
- Telefon: menyu va sozlamalar bo'limlari aylantirish chizig'isiz; tovarlar jadvali kartalarga aylanadi;
  KPI 2×2, brendlar 2 ustun; oynalar pastdan chiqadi.

## 16. 6-sinovdan keyin

- Artikul butunlay olib tashlandi (ishlatilmasdi). Tovarni aniqlash: nom + kod (A12) va shtrix-kod.
- Kod brend ichida takrorlanmaydi: ishlatilgan kod (masalan B18) qayta berilmaydi — keyingisi olinadi;
  tahrirlashda band kod yozilsa saqlanmaydi ("B18 kodi band: …"). Formada aniq kodlar oralig'i ko'rsatiladi.
- Shtrix-kod har doim yangi tartib raqamidan yaratiladi — takrorlanmaydi.
- Etiketka rasmchasini bosganda katta ko'rinadi (← → bilan almashadi, Esc yopadi).
- PIN oynasi telefonda ham ekran o'rtasida.
- Matn maydonlarida sichqoncha ko'rsatkichi ikki mavzuda ham ko'rinadi.
- Ranglar: har brendga o'z rangi (avatar, grafik), ko'rsatkichlar o'z rangida, to'lov usullari rangli
  (naqd — yashil, karta — ko'k, dollar — sariq, nasiya — qizil).
- Bot (redux-counter repo, poyabzal-bot): Python/aiogram, SQLite yoki Supabase sxemasi; narxlar 1 pachka uchun
  (saytda — 1 juft uchun) — birlashtirishda moslashtirish kerak.

## 17. Baza (Supabase)

- Loyiha: `kvotnpqbktrroxmtylrw.supabase.co` (Frankfurt). Sxema: `supabase/schema.sql` — SQL Editor'da ishga tushiriladi.
- `.env` da faqat ochiq (publishable) kalit. Maxfiy service_role kaliti hech qayerga yozilmaydi.
- Kirish: email + parol. Hisoblar Supabase'da qo'lda yaratiladi (Authentication → Users → Add user),
  ochiq ro'yxatdan o'tish o'chiriladi. Faqat `staff` jadvalidagilar ma'lumotni ko'radi (RLS).
  Sessiya uzoq saqlanadi; Telegram orqali kirish va "Qurilmalar" — bot ulanganda.
- Sayt kirishda hamma ma'lumotni yuklaydi, har o'zgarishni bazaga yozadi; oynaga qaytganda va bo'lim
  almashganda bazadan yangilanadi (boshqa kassa / telefondagi o'zgarishlar ko'rinadi).
- Ikki kassa bir vaqtda ishlasa ham takrorlanmaydi: shtrix-kod, chek raqami, brend kodlari bazadagi
  hisoblagichdan (`take_seq`) olinadi; sotuv `apply_sale` bilan bitta amalda yoziladi va qoldiqni kamaytiradi.
- Internet yo'q bo'lsa: sotuv saqlanmaydi va bu aniq aytiladi; boshqa o'zgarishlarda ogohlantirish chiqadi.
- Mavzu (yorug'/qorong'i) har qurilmaning o'zida; qolgan sozlamalar umumiy.
- `.env` siz yig'ilsa (VITE_SUPABASE_URL bo'sh) — eski sinov rejimi: brauzer xotirasida, namunaviy tovarlar bilan.

## 18. Etiketka chop etish va muharrir (Billz kabi)

- Chop: sayt sahifa o'lchamini yubormaydi — qog'oz o'lchami printer drayveridan olinadi (Xprinter XP-365B:
  USER 60×40, Portrait). Etiketka shu qog'ozga nisbatini saqlab cho'ziladi; har etiketka — alohida sahifa.
  Chrome'da: Paper size = USER, Layout = Portrait, Margins = None, Scale = Default.
- Shablon muharriri: har maydonning joyi (x, y, eni, bo'yi, mm) — sichqoncha bilan suriladi, burchakdagi
  nuqtadan tortib kattalashtiriladi, strelkalar bilan 0.5 mm aniq suriladi. Matn: shrift (pt), qalin, tekislash.
  Shtrix-kod o'z qutisini to'liq egallaydi, raqamlar alohida (cho'zilmaydi). "Asl joylashuv" — avtomatik tartib.

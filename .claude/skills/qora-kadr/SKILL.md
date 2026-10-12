---
name: qora-kadr
description: "Qora Kadr" — bizning reels uslubimiz (house style). Use for EVERY reel / Reels / Shorts / TikTok / vertical video this team makes, and whenever the user says "qora kadr", "bizning stil", "reels qil", "montaj qil" or asks for a vertical video. Black 9:16 canvas, one square rounded footage card in the center, hard cuts, minimal two-line caption (bold word + italic word) in the middle, word-by-word with the voiceover, ending on a single word on pure black. Ready HyperFrames template in template/. Load together with /hyperframes.
---

# Qora Kadr — reels uslubi

Hamma reelslarimiz shu uslubda bo'ladi. Referens: 26 soniyalik, 720×1280 vertikal video
(`reference/kadrlar.jpg` — har 0.5s dagi kadrlar, `reference/namuna.jpg` — yaqin kadrlar,
`reference/matn.jpg` — sarlavha shrifti yaqindan).

Har doim avval `/hyperframes` skillini yuklang (u kirish nuqtasi), keyin shu uslub
qoidalarini qo'llang va `template/` dan boshlang.

## Kompozitsiya (1080×1920)

| Element | Qiymat |
|---|---|
| Kanvas | 1080×1920, 25 yoki 30 fps, fon **sof qora** `#000` |
| Kartochka | kvadrat **950×950**, chapdan 65px, tepadan 485px (markazda), burchak radiusi **72px**, `object-fit: cover` |
| Kartochka atrofi | faqat qora — ramka, soya, logo, progress bar yo'q |
| Kadr rangi | biroz to'q, kinematografik (`brightness .82`); ochiq kadrlarda markazda juda yumshoq soya |

Kartochka hech qachon harakatlanmaydi (zoom, slide, scale yo'q). Kadr ichidagi footage o'zi harakatlanadi.

## Montaj ritmi

- Faqat **keskin kesish** (hard cut). Crossfade, whoosh-o'tish, glitch yo'q.
- Har kadr **1.5–4 soniya**, odatda bitta ibora = bitta kadr.
- Kadrlar almashinuvi: gapiruvchi odam (talking head) ↔ ma'noni ko'rsatuvchi b-roll
  (metafora: zinapoya, olov, tog', dala...). Gap savol bo'lsa — b-roll, javob — gapiruvchi.
- Boshida qoradan **0.4s** ochilish (fade-in). Boshqa fade yo'q.

## Sarlavha (eng muhim qism)

- Joyi: kanvas markazi (kartochka markazi), ikki qator, **blok markazda, qatorlar chapga tekislangan**.
- 1-qator: **Inter SemiBold 600, 46px**, oq.
- 2-qator: *Inter Italic 400, 44px*, oq 88% shaffoflik.
- Qator oralig'i 1.08, yumshoq qora soya (`0 0 14px rgba(0,0,0,.55)`) — fon tusmaydi, plashka yo'q.
- Har sahnada **maksimum 2 so'z**: 1-qator asosiy so'z, 2-qator davomi
  (masalan: **Qaysini** / *qilay?*, **Qalbdan** / *qiling.*, **Qolganini** / *qiling.*).
- So'zlar ovozga mos **birma-bir** chiqadi: 0.18s shaffoflik bilan, siljish/kattalashish yo'q.
- Tinish belgilari saqlanadi (`?` va `.`) — ular uslubning bir qismi.
- Hamma harf kichik, faqat 1-qatordagi so'z bosh harf bilan.

## Final

Oxirgi gapdan keyin kartochka keskin yo'qoladi, **faqat oxirgi so'z** (2-qator, kursiv)
qora fonda o'z joyida qoladi, musiqa yana **3–5 soniya** davom etadi. Logo yoki CTA kartasi qo'yilmaydi.

## Ovoz

- Asosiy: ovozli matn (voiceover), qisqa iboralar, orasida pauzalar.
- Fon: tinch pianino / ambient, ovozdan ~15–20 dB past; finalda musiqa ochiladi (balandroq, to'liqroq).
- SFX ishlatilmaydi (kesishlarda ham).
- Umumiy balandlik: ~-14 LUFS, cho'qqi -1 dB.

## Template ishlatish

```bash
cp -r .claude/skills/qora-kadr/template reels/<nom>
cd reels/<nom>
# assets/ ga kadrlar (mp4/jpg) va ovoz.mp3 qo'ying, index.html dagi sahnalarni tahrirlang
npx hyperframes check
npx hyperframes snapshot --at 1,4,8
npx hyperframes render -o <nom>.mp4
```

`index.html` tuzilishi:
- `#card` ichida har kadr — `<video class="media clip" muted ...>` yoki `<img class="media clip">`, `data-start` / `data-duration` bilan.
- Har sahna sarlavhasi — `.cap.clip` ichida `.l1` va `.l2`; `data-in` = so'z sahna boshidan necha soniyada chiqishi.
- Final sarlavha `data-in="hold"` — oldingi sahnadan qayta chiqmasdan davom etadi.
- Root `data-duration` = oxirgi sahna + 3–5s final.
- GSAP va Inter shrifti lokal (`lib/`, `fonts/`) — internetsiz ham render bo'ladi.

So'z vaqtlarini ovozdan olish: `npx hyperframes transcribe ovoz.mp3 --model small --language uz`
(whisper modeli kerak; huggingface.co bloklangan bo'lsa — vaqtlarni qo'lda yozing).

## Tekshiruv ro'yxati

- [ ] Fon sof qora, kartochka 950×950 markazda, radius 72px
- [ ] Faqat keskin kesishlar, kartochka harakatsiz
- [ ] Har sahnada ≤ 2 so'z, 1-qator qalin, 2-qator kursiv, so'zlar ovoz bilan birga
- [ ] Final: faqat oxirgi so'z qora fonda, musiqa 3–5s
- [ ] `npx hyperframes check` — 0 xato

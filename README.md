# web-genmail

Versi web dari `telegram-genmail-bot` — alur & cara kerja sama persis
(generate random/custom + reserve + saran nama, riwayat, hapus dengan
konfirmasi), tapi UI-nya halaman web dan dijalankan sebagai Vercel
Functions.

## Kenapa strukturnya beda dari bot

- Bot Telegram jalan terus-menerus (polling) di 1 proses Node, jadi
  bisa nyimpen `history.json` & cooldown di memory/file lokal.
- Vercel Functions itu serverless: tiap request bisa kena instance
  yang beda, dan filesystem-nya gak persisten. Jadi riwayat &
  cooldown dititip di **cookie httpOnly yang di-sign HMAC**
  (`lib/signedCookie.js`) — gak bisa dipalsuin dari browser karena
  signature-nya divalidasi tiap request pakai `COOKIE_SECRET`.
- Semua secret (`LINK_SIGNING_SECRET`, `WORKER_DELETE_URL`,
  `COOKIE_SECRET`) diambil dari **Environment Variables Vercel**, gak
  ada yang di-hardcode di kode. Endpoint `/api/public-config` cuma
  expose `EMAIL_DOMAIN` (non-sensitif) buat ditampilin di UI.

## Struktur

```
api/
  generate.js       -> POST, generate email (random/custom+reserve)
  history.js        -> GET, baca riwayat dari cookie
  delete.js         -> POST, hapus email (panggil Worker /delete)
  public-config.js  -> GET, expose EMAIL_DOMAIN doang ke frontend
lib/
  config.js         -> baca semua config dari process.env
  genmail.js         -> logic generate/signature/reserve (sama kayak bot)
  signedCookie.js    -> sign/verify payload cookie (HMAC)
  http.js            -> helper cookie & response JSON
public/
  index.html, style.css, app.js  -> SPA niru alur menu bot
```

## Deploy ke Vercel

1. Push folder ini ke repo GitHub (jangan ikut commit `.env`).
2. Import project di [vercel.com/new](https://vercel.com/new).
3. Sebelum/pas deploy pertama, isi **Environment Variables** di
   Project Settings (untuk Production, dan Preview kalau perlu):
   - `LINK_SIGNING_SECRET` — sama persis dengan punya
     `generator-hiyorimail`
   - `WORKER_DELETE_URL` — URL endpoint `/delete` Worker `am-gen-mail`
   - `COOKIE_SECRET` — random string sendiri, generate contoh:
     `openssl rand -hex 32`
   - (opsional, ada default) `EMAIL_DOMAIN`, `GENERATOR_BASE_URL`,
     `LOCAL_PART_LENGTH`, `COOLDOWN_SECONDS`, `HISTORY_LIMIT`,
     `SESSION_MAX_AGE_DAYS`
4. Deploy. Vercel otomatis detect folder `api/` jadi Functions dan
   `public/` jadi static hosting.

## Coba lokal

```bash
npm install -g vercel
cp .env.example .env   # isi nilainya
npm install
vercel dev
```

## Catatan keamanan

- Cookie riwayat (`gm_history`) & cooldown (`gm_cooldown`) itu
  `httpOnly` + `secure` + di-sign HMAC — gak kebaca/gak bisa diedit
  dari JS browser.
- `COOKIE_SECRET` HARUS beda dari `LINK_SIGNING_SECRET` — kalau sama
  dan salah satu bocor, dua-duanya ikut kebobol.
- Cooldown ini tetap cuma proteksi ringan (sama seperti bot) — bukan
  pengganti rate limit di level Cloudflare.

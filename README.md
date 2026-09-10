# generator-hiyorimail

Halaman inbox buat 1 alamat GENMAIL (`*@hiyorimail.biz.id`) — nampilin
**daftar pesan** (bukan cuma 1 link kayak versi sebelumnya), mirip
generator.email: baris hijau tua = belum dibaca, klik barisnya buat buka
isinya dan otomatis jadi biru tua (sudah dibaca). BUKAN generator publik
seperti generator.email — gak ada tombol "generate email baru", gak ada
dropdown domain, cuma nampilin 1 alamat yang dikasih lewat URL.

## Worker `am-gen-mail`

Sumber Worker-nya ada di `worker/worker-am-gen-mail.js` (bukan file yang
dideploy otomatis lewat Vercel — ini kode terpisah yang di-deploy manual
ke Cloudflare Workers, cuma disertain di sini biar 1 repo lengkap).

Sudah diupdate supaya:

- **Nyimpen SEMUA email yang masuk**, bukan cuma yang ada link
  verifikasinya. `link` cuma diisi kalau ketemu URL yang keliatan kayak
  link aksi/verifikasi (bukan syarat buat nyimpen emailnya).
- **Nambahin (append)** tiap email baru ke depan sebuah array riwayat
  pesan per alamat, bukan nimpa (`overwrite`) 1 pesan doang kayak
  sebelumnya. Array dipotong ke 20 pesan terakhir (`MAX_MESSAGES_PER_INBOX`)
  biar KV value-nya gak membengkak.
- Nyimpen `subject`, `snippet` (ringkasan singkat), dan `body` (isi
  lengkap, HTML sudah di-strip jadi teks polos) — bukan cuma `link` —
  biar inbox bisa nampilin isi emailnya, bukan cuma tombol link.

Bentuk 1 pesan yang disimpen di KV:
```json
{
  "id": "1798675629000-a1b2c3d4",
  "from": "...",
  "to": "...",
  "subject": "...",
  "snippet": "...",
  "body": "...",
  "link": "..." ,
  "receivedAt": 1798675629000
}
```
Dan 1 key di KV = array berisi banyak objek kayak gitu, terbaru di depan.

`api/inbox.js` tetap backward-compatible: kalau suatu saat KV masih ada
sisa data format lama (1 objek polos, bukan array), otomatis dibungkus
jadi array 1 elemen, gak error.

**Cara deploy ulang Worker setelah diedit:** lewat dashboard Cloudflare
Workers (paste kode barunya ke editor Worker yang sudah ada), atau lewat
`wrangler deploy` kalau kamu pakai Wrangler CLI. Binding KV (`AM_KV`)
gak perlu diubah, tetap sama kayak sebelumnya.

## Status baca (unread/read)

Status "sudah dibaca" disimpan di `localStorage` browser (per alamat
email), BUKAN di server/KV — jadi ringan dan gak butuh endpoint baru.
Konsekuensinya: status baca itu spesifik per browser/perangkat yang
dipakai buka link-nya, bukan status global yang keliatan sama di semua
tempat.

Cara pakainya: buka
`https://generator.hiyorimail.biz.id/?email=xxxxxxxxxxxx@hiyorimail.biz.id&sig=<tanda-tangan>`
— halaman otomatis polling tiap 4 detik, dan begitu Worker `am-gen-mail`
nyimpen link verifikasinya ke KV, halaman ini langsung nampilin tombol
"Buka Link Verifikasi".

Parameter `sig` WAJIB ada dan harus cocok, kalau enggak request langsung
ditolak (403) tanpa sempat nge-hit Cloudflare API. Ini nyegah orang
asal-asalan nebak/ketik alamat email buat ngintip inbox orang lain, dan
nyegah request ngasal ngabisin kuota rate limit Cloudflare (lihat bagian
"Keamanan" di bawah).

## Arsitektur

```
Browser (index.html)
   │  fetch("/api/inbox?email=<email>&sig=<hmac>") tiap 4 detik
   ▼
Vercel Serverless Function (api/inbox.js)
   │  1. cek sig cocok apa nggak (HMAC pakai LINK_SIGNING_SECRET) -- kalau
   │     enggak, langsung tolak 403 di sini, TIDAK nyentuh Cloudflare sama sekali
   │  2. kalau valid, baca Cloudflare KV pakai CF_ACCOUNT_ID / CF_NAMESPACE_ID
   │     / CF_API_TOKEN (disimpan sebagai Environment Variable, TIDAK ada di kode)
   ▼
Cloudflare KV (namespace yang sama dipakai Worker am-gen-mail)
```

Kredensial Cloudflare cuma disentuh di server (serverless function), gak
pernah dikirim ke browser. Browser cuma nerima hasil akhirnya (from,
subject, link, receivedAt).

## Deploy ke Vercel

1. Push folder ini ke repo GitHub baru (atau upload manual lewat
   `vercel` CLI: `npx vercel`).
2. Di dashboard Vercel: **Add New → Project**, import repo itu.
   Gak perlu setting build command apa-apa (ini static + serverless function,
   Vercel otomatis detect).
3. Sebelum deploy pertama (atau setelahnya lewat **Settings → Environment
   Variables**), isi 4 variable ini:
   - `CF_ACCOUNT_ID` — samain persis sama `GENMAIL.cfAccountId` di `config.js` bot
   - `CF_NAMESPACE_ID` — samain persis sama `GENMAIL.cfNamespaceId` di `config.js` bot
   - `CF_API_TOKEN` — samain persis sama `GENMAIL.cfApiToken` di `config.js` bot
   - `LINK_SIGNING_SECRET` — string rahasia BEBAS bikin sendiri (generate sekali
     pakai `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`,
     contoh hasilnya: `4b03a253802b13e0f94004970de82f7d6a171f92c343fcd1`).
     **Simpen baik-baik, nanti dibutuhin lagi di bot buat bikin link yang valid.**
4. Deploy.

### Cara bot bikin link yang valid (buat dipasang nanti pas wiring ke bot)

Bot butuh hitung `sig` yang SAMA PERSIS kayak yang dihitung `api/inbox.js`,
pakai `LINK_SIGNING_SECRET` yang sama. Di Node.js:

```js
const crypto = require("crypto");

function buildInboxLink(email) {
  const secret = config.GENMAIL.linkSigningSecret; // taruh LINK_SIGNING_SECRET yang sama di sini
  const sig = crypto.createHmac("sha256", secret).update(email).digest("hex").slice(0, 24);
  return `https://generator.hiyorimail.biz.id/?email=${encodeURIComponent(email)}&sig=${sig}`;
}
```

## Sambungin domain `generator.hiyorimail.biz.id`

1. Di project Vercel → **Settings → Domains** → tambahin
   `generator.hiyorimail.biz.id`.
2. Vercel bakal kasih tau record yang perlu ditambahin (biasanya CNAME ke
   `cname.vercel-dns.com`).
3. Domain `hiyorimail.biz.id` udah ada di Cloudflare DNS — tinggal tambahin
   record CNAME itu di sana buat subdomain `generator`.
   ⚠️ Kalau proxy Cloudflare (awan oranye) nyala buat record ini, pastiin
   itu gak ganggu validasi SSL Vercel. Kalau ada masalah SSL, coba matiin
   proxy dulu (DNS only / awan abu-abu) pas awal setup, nyalain lagi
   setelah sertifikatnya aktif.

## Ngetes lokal

```bash
npm i -g vercel
vercel dev
```

Buat URL tes yang valid (soalnya sekarang wajib ada `sig` yang cocok):

```bash
node -e "
const crypto = require('crypto');
const secret = 'ISI_LINK_SIGNING_SECRET_YANG_SAMA_DI_.ENV.LOCAL';
const email = 'xxxxxxxxxxxx@hiyorimail.biz.id';
const sig = crypto.createHmac('sha256', secret).update(email).digest('hex').slice(0, 24);
console.log('http://localhost:3000/?email=' + encodeURIComponent(email) + '&sig=' + sig);
"
```

Pastiin udah bikin file `.env.local` isinya `CF_ACCOUNT_ID=...` dst (JANGAN
di-commit ke git).

## Keamanan

- **Signed link (HMAC)** — setiap request ke `/api/inbox` wajib nyertain
  `sig` yang valid. Tanpa itu, ditolak 403 sebelum sempat nyentuh Cloudflare
  API sama sekali. Jadi walau local-part-nya ketebak/kesebar, tetep gak
  bisa dibuka tanpa link ASLI yang dibikinin bot.
- **Format email divalidasi ketat** — cuma domain `hiyorimail.biz.id` dan
  local-part huruf/angka yang diterima, sisanya ditolak (400) secepatnya.
- **Frontend berhenti nge-retry** kalau server bilang error-nya "terminal"
  (format salah / signature gak valid) — gak nge-spam request ke API buat
  hal yang emang gak akan pernah berhasil.
- Jangan pernah nge-commit `LINK_SIGNING_SECRET` atau kredensial Cloudflare
  ke git — semuanya lewat Environment Variables Vercel / `.env.local` (yang
  di-gitignore).


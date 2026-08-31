/**
 * POST /api/mark-read
 * Body (JSON): { "email": "<alamat-lengkap>", "sig": "<hmac>", "id": "<id-pesan>" }
 *
 * Tandain 1 pesan sebagai "sudah dibaca" LANGSUNG DI KV (bukan di
 * localStorage HP/browser), supaya status baca itu SYNC ke device manapun
 * yang buka inbox yang sama -- HP, laptop, browser lain, dll.
 *
 * Alurnya: GET value lama dari KV -> cari pesan dengan id yang cocok ->
 * set read:true -> PUT lagi array yang udah diupdate itu balik ke KV.
 *
 * PENTING: beda sama /api/inbox (yang cuma GET / baca doang), endpoint ini
 * NULIS ke KV. Jadi CF_API_TOKEN yang dipakai di Environment Variables
 * Vercel WAJIB punya izin "Workers KV Storage: Edit" (bukan cuma "Read").
 * Kalau token-nya cuma read-only, request ke sini bakal kena 401/403 dari
 * Cloudflare -- tinggal update permission token-nya di Cloudflare dashboard
 * (My Profile > API Tokens), gak perlu ganti kode.
 *
 * Environment variables yang dipakai (sama persis kayak api/inbox.js):
 *   CF_ACCOUNT_ID, CF_NAMESPACE_ID, CF_API_TOKEN, LINK_SIGNING_SECRET
 */

const crypto = require("crypto");

const EMAIL_DOMAIN = "hiyorimail.biz.id";

function computeSignature(email, secret) {
  return crypto.createHmac("sha256", secret).update(email).digest("hex").slice(0, 24);
}

function safeEqual(a, b) {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method tidak didukung, pakai POST." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch (e) {
      body = {};
    }
  }
  body = body || {};

  const email = String(body.email || "").trim().toLowerCase();
  const sig = String(body.sig || "").trim();
  const id = String(body.id || "").trim();

  if (!email || !email.endsWith("@" + EMAIL_DOMAIN)) {
    res.status(400).json({ error: "Parameter 'email' gak valid." });
    return;
  }

  const localPart = email.slice(0, email.length - (EMAIL_DOMAIN.length + 1));
  if (!/^[a-z0-9]{1,64}$/.test(localPart)) {
    res.status(400).json({ error: "Parameter 'email' gak valid." });
    return;
  }

  if (!id) {
    res.status(400).json({ error: "Parameter 'id' wajib diisi." });
    return;
  }

  const { CF_ACCOUNT_ID, CF_NAMESPACE_ID, CF_API_TOKEN, LINK_SIGNING_SECRET } = process.env;
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN || !LINK_SIGNING_SECRET) {
    res.status(500).json({ error: "Server belum dikonfigurasi. Isi CF_ACCOUNT_ID/CF_NAMESPACE_ID/CF_API_TOKEN/LINK_SIGNING_SECRET di Environment Variables Vercel." });
    return;
  }

  const expectedSig = computeSignature(email, LINK_SIGNING_SECRET);
  if (!sig || !safeEqual(sig, expectedSig)) {
    res.status(403).json({ error: "Tautan tidak valid atau sudah kedaluwarsa." });
    return;
  }

  const key = localPart;
  const kvUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;

  // 1) Ambil isi KV yang sekarang.
  let getRes;
  try {
    getRes = await fetch(kvUrl, { headers: { Authorization: `Bearer ${CF_API_TOKEN}` } });
  } catch (e) {
    res.status(502).json({ error: `Gagal konek ke Cloudflare: ${e.message}` });
    return;
  }

  if (getRes.status === 404) {
    // Gak ada apa-apa buat ditandain -- anggap sukses aja (gak ada efek).
    res.status(200).json({ ok: true, found: false });
    return;
  }

  if (getRes.status === 401 || getRes.status === 403) {
    res.status(500).json({ error: "Auth ke Cloudflare ditolak. Pastikan CF_API_TOKEN punya izin 'Workers KV Storage: Edit', bukan cuma 'Read'." });
    return;
  }

  if (!getRes.ok) {
    res.status(502).json({ error: `Cloudflare KV error (HTTP ${getRes.status}) pas ambil data.` });
    return;
  }

  let raw;
  try {
    raw = JSON.parse(await getRes.text());
  } catch (e) {
    res.status(502).json({ error: "Isi KV gak kebaca sebagai JSON." });
    return;
  }

  const list = Array.isArray(raw) ? raw : raw && typeof raw === "object" ? [raw] : [];

  let changed = false;
  const updated = list.map((m) => {
    if (m && typeof m === "object" && String(m.id) === id && !m.read) {
      changed = true;
      return { ...m, read: true };
    }
    return m;
  });

  if (!changed) {
    // Pesan gak ketemu, atau udah kebaca sebelumnya -- gak perlu nulis ulang.
    res.status(200).json({ ok: true, found: false });
    return;
  }

  // 2) Tulis balik array yang udah diupdate ke KV. Dipakai method PUT ke
  // endpoint value yang sama (bukan bulk endpoint), TANPA expirationTtl
  // (biar konsisten sama Worker yang udah gak pasang TTL lagi -- pesan
  // tetap disimpen permanen, cuma flag "read"-nya yang diupdate).
  let putRes;
  try {
    putRes = await fetch(kvUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${CF_API_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updated),
    });
  } catch (e) {
    res.status(502).json({ error: `Gagal konek ke Cloudflare: ${e.message}` });
    return;
  }

  if (putRes.status === 401 || putRes.status === 403) {
    res.status(500).json({ error: "Auth ke Cloudflare ditolak pas nulis. Pastikan CF_API_TOKEN punya izin 'Workers KV Storage: Edit'." });
    return;
  }

  if (!putRes.ok) {
    res.status(502).json({ error: `Cloudflare KV error (HTTP ${putRes.status}) pas nulis data.` });
    return;
  }

  res.status(200).json({ ok: true, found: true });
};

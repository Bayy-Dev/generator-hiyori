/**
 * GET /api/inbox?email=<alamat-lengkap>&sig=<tanda-tangan-hmac>
 *
 * Proxy tipis ke Cloudflare KV (namespace yang sama dipakai Worker
 * "am-gen-mail"). Kredensial Cloudflare TIDAK pernah nyampe ke browser --
 * cuma diinject sebagai Environment Variable di Vercel (Settings > Environment
 * Variables), dibaca di sini lewat process.env, dan yang dibalikin ke client
 * cuma data emailnya (from/subject/link/receivedAt), bukan token apapun.
 *
 * PROTEKSI "SIGNED LINK": biar orang gak bisa asal ketik/tebak alamat email
 * buat ngintip inbox orang lain, tiap request WAJIB nyertain `sig` --
 * HMAC-SHA256(LINK_SIGNING_SECRET, email) yang cuma bisa dibikin sama pihak
 * yang tau secret-nya (bot). Tanpa sig yang cocok, request ditolak 403
 * SEBELUM sempat nge-hit Cloudflare API sama sekali (jadi gak makan kuota
 * rate limit walau di-spam).
 *
 * Environment variables yang wajib diisi di Vercel:
 *   CF_ACCOUNT_ID        -> sama kayak GENMAIL.cfAccountId di bot
 *   CF_NAMESPACE_ID      -> sama kayak GENMAIL.cfNamespaceId di bot
 *   CF_API_TOKEN         -> sama kayak GENMAIL.cfApiToken di bot
 *   LINK_SIGNING_SECRET  -> string rahasia bebas (generate sekali, taruh di
 *                           sini DAN di config.js bot -- harus SAMA PERSIS)
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
  // Cuma perlu GET, tolak method lain biar jelas.
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method tidak didukung, pakai GET." });
    return;
  }

  const email = String(req.query.email || "").trim().toLowerCase();
  const sig = String(req.query.sig || "").trim();

  if (!email || !email.endsWith("@" + EMAIL_DOMAIN)) {
    res.status(400).json({ error: "Parameter 'email' gak valid.", terminal: true });
    return;
  }

  const localPart = email.slice(0, email.length - (EMAIL_DOMAIN.length + 1));
  if (!/^[a-z0-9]{1,64}$/.test(localPart)) {
    res.status(400).json({ error: "Parameter 'email' gak valid.", terminal: true });
    return;
  }

  const { CF_ACCOUNT_ID, CF_NAMESPACE_ID, CF_API_TOKEN, LINK_SIGNING_SECRET } = process.env;
  if (!CF_ACCOUNT_ID || !CF_NAMESPACE_ID || !CF_API_TOKEN || !LINK_SIGNING_SECRET) {
    res.status(500).json({ error: "Server belum dikonfigurasi. Isi CF_ACCOUNT_ID/CF_NAMESPACE_ID/CF_API_TOKEN/LINK_SIGNING_SECRET di Environment Variables Vercel." });
    return;
  }

  // Verifikasi tanda tangan DULU, sebelum sentuh Cloudflare API sama sekali --
  // jadi request yang di-tebak/di-tempel ngasal langsung mental di sini, gak
  // ikut makan kuota rate limit Cloudflare.
  const expectedSig = computeSignature(email, LINK_SIGNING_SECRET);
  if (!sig || !safeEqual(sig, expectedSig)) {
    res.status(403).json({ error: "Tautan tidak valid atau sudah kedaluwarsa.", terminal: true });
    return;
  }

  const key = localPart;

  const url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;

  let cfRes;
  try {
    cfRes = await fetch(url, {
      headers: { Authorization: `Bearer ${CF_API_TOKEN}` },
    });
  } catch (e) {
    res.status(502).json({ error: `Gagal konek ke Cloudflare: ${e.message}` });
    return;
  }

  if (cfRes.status === 404) {
    // Belum ada email masuk buat key ini -- ini kondisi NORMAL, bukan error.
    res.status(200).json({ found: false });
    return;
  }

  if (cfRes.status === 401 || cfRes.status === 403) {
    res.status(500).json({ error: "Auth ke Cloudflare ditolak. Cek lagi CF_API_TOKEN di Environment Variables." });
    return;
  }

  if (!cfRes.ok) {
    res.status(502).json({ error: `Cloudflare KV error (HTTP ${cfRes.status}).` });
    return;
  }

  let data;
  try {
    const text = await cfRes.text();
    data = JSON.parse(text);
  } catch (e) {
    res.status(502).json({ error: "Isi KV gak kebaca sebagai JSON." });
    return;
  }

  res.status(200).json({
    found: true,
    from: data.from || null,
    subject: data.subject || null,
    link: data.link || null,
    receivedAt: data.receivedAt || null,
  });
};

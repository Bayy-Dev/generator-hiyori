/**
 * Semua nilai sensitif diambil dari Environment Variables Vercel
 * (Project Settings > Environment Variables), BUKAN di-hardcode di
 * repo. Kalau ada yang wajib tapi belum diisi, function langsung
 * error jelas daripada diam-diam salah generate sig.
 *
 * Env var yang wajib diisi di Vercel:
 *   LINK_SIGNING_SECRET  -> HARUS SAMA PERSIS dengan yang di-set di
 *                           project generator-hiyorimail (api/inbox.js)
 *   WORKER_DELETE_URL    -> https://am-gen-mail.<subdomain>.workers.dev/delete
 *   COOKIE_SECRET        -> secret bebas (random panjang) khusus buat
 *                           nge-sign cookie sesi login di sini,
 *                           BEDA dari LINK_SIGNING_SECRET
 *   CF_ACCOUNT_ID         -> sama persis dengan punya project
 *   CF_NAMESPACE_ID       -> generator-hiyorimail (dipakai bareng
 *   CF_API_TOKEN          -> supaya riwayat kebaca lintas device,
 *                            bukan lagi disimpan di cookie browser).
 *                            Token butuh izin "Workers KV Storage: Edit".
 *
 * Env var opsional (ada default):
 *   EMAIL_DOMAINS (comma-separated, contoh: "hiyorimail.biz.id,bayzstore.biz.id"
 *   -> domain pertama jadi default), GENERATOR_BASE_URL, LOCAL_PART_LENGTH,
 *   COOLDOWN_SECONDS, HISTORY_LIMIT, SESSION_MAX_AGE_DAYS
 *   AUTH_USERNAME (default "yori"), AUTH_PASSWORD (default "owner")
 *   -> satu akun doang, gak ada register. Ganti lewat env var kalau
 *      mau beda dari default, gak wajib diisi.
 */
function required(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `[CONFIG] Env var "${name}" belum diisi. Set di Vercel > Project Settings > Environment Variables.`
    );
  }
  return v;
}

module.exports = {
  // Domain pertama di list = default. Tambah domain baru cukup nambah
  // di sini (comma-separated di env var), gak perlu ubah kode lain.
  EMAIL_DOMAINS: (process.env.EMAIL_DOMAINS || "hiyorimail.biz.id,bayzstore.biz.id")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  LINK_SIGNING_SECRET: required("LINK_SIGNING_SECRET"),
  GENERATOR_BASE_URL: process.env.GENERATOR_BASE_URL || "https://generator.hiyorimail.biz.id",
  WORKER_DELETE_URL: required("WORKER_DELETE_URL"),
  COOKIE_SECRET: required("COOKIE_SECRET"),

  CF_ACCOUNT_ID: required("CF_ACCOUNT_ID"),
  CF_NAMESPACE_ID: required("CF_NAMESPACE_ID"),
  CF_API_TOKEN: required("CF_API_TOKEN"),

  AUTH_USERNAME: process.env.AUTH_USERNAME || "yori",
  AUTH_PASSWORD: process.env.AUTH_PASSWORD || "owner",

  LOCAL_PART_LENGTH: parseInt(process.env.LOCAL_PART_LENGTH || "12", 10),
  COOLDOWN_SECONDS: parseInt(process.env.COOLDOWN_SECONDS || "5", 10),
  HISTORY_LIMIT: parseInt(process.env.HISTORY_LIMIT || "5", 10),
  SESSION_MAX_AGE_DAYS: parseInt(process.env.SESSION_MAX_AGE_DAYS || "365", 10),
};

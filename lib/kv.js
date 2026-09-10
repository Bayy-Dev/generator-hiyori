/**
 * Riwayat email sekarang disimpan di Cloudflare KV (namespace AM_KV
 * yang sama dengan worker am-gen-mail / project generator-hiyorimail),
 * bukan lagi di cookie browser. Karena cuma 1 akun (single login),
 * riwayat dipakai bareng di key tetap KV_HISTORY_KEY -- jadi generate
 * di laptop, login di HP, riwayatnya ada.
 */
const KV_HISTORY_KEY = "webgen:history";

function kvUrl(cfg, key) {
  return `https://api.cloudflare.com/client/v4/accounts/${cfg.CF_ACCOUNT_ID}/storage/kv/namespaces/${cfg.CF_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
}

async function getHistory(cfg) {
  const res = await fetch(kvUrl(cfg, KV_HISTORY_KEY), {
    headers: { Authorization: `Bearer ${cfg.CF_API_TOKEN}` },
  });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Gagal ambil riwayat dari KV (HTTP ${res.status})`);

  const text = await res.text();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

async function putHistory(cfg, history) {
  const res = await fetch(kvUrl(cfg, KV_HISTORY_KEY), {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${cfg.CF_API_TOKEN}`,
      "Content-Type": "text/plain",
    },
    body: JSON.stringify(history),
  });
  if (!res.ok) throw new Error(`Gagal simpan riwayat ke KV (HTTP ${res.status})`);
}

module.exports = { getHistory, putHistory };

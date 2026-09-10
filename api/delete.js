const config = require("../lib/config");
const { computeSignature } = require("../lib/genmail");
const { getCookies, sendJson } = require("../lib/http");
const { isLoggedIn } = require("../lib/auth");
const kv = require("../lib/kv");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  let cfg;
  try {
    cfg = config;
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: e.message });
  }

  const cookies = getCookies(req);
  if (!isLoggedIn(cfg, cookies)) {
    return sendJson(res, 401, { ok: false, error: "Belum login." });
  }

  const { id } = req.body || {};
  if (!id) return sendJson(res, 400, { ok: false, error: "id wajib diisi" });

  let history;
  try {
    history = await kv.getHistory(cfg);
  } catch (e) {
    return sendJson(res, 502, { ok: false, error: e.message });
  }

  const entry = history.find((e) => e.id === id);
  if (!entry) {
    return sendJson(res, 404, { ok: false, error: "Email ini sudah tidak ada di riwayat." });
  }

  const sig = computeSignature(entry.email, cfg.LINK_SIGNING_SECRET);

  let deleted = false;
  let errorMsg = "Gagal hapus, coba lagi.";
  try {
    const workerRes = await fetch(cfg.WORKER_DELETE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: entry.email, sig }),
    });
    const data = await workerRes.json().catch(() => ({}));
    if (workerRes.ok && data.ok) {
      deleted = true;
    } else if (data.error) {
      errorMsg = `Gagal hapus: ${data.error}`;
    }
  } catch (e) {
    errorMsg = "Gak bisa konek ke server delete.";
  }

  if (!deleted) {
    return sendJson(res, 502, { ok: false, error: errorMsg });
  }

  const newHistory = history.filter((e) => e.id !== id);
  try {
    await kv.putHistory(cfg, newHistory);
  } catch (e) {
    return sendJson(res, 502, { ok: false, error: e.message });
  }

  return sendJson(res, 200, { ok: true, entries: newHistory });
};

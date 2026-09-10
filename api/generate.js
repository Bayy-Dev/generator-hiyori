const crypto = require("crypto");
const config = require("../lib/config");
const { generateGenmail, reserveLocalPart, suggestAlternatives } = require("../lib/genmail");
const { getCookies, setCookie, sendJson } = require("../lib/http");
const { sign, verify } = require("../lib/signedCookie");
const { isLoggedIn } = require("../lib/auth");
const kv = require("../lib/kv");

const LOCAL_PART_MIN = 3;
const LOCAL_PART_MAX = 64;
function isValidLocalPart(name) {
  if (typeof name !== "string") return false;
  if (name.length < LOCAL_PART_MIN || name.length > LOCAL_PART_MAX) return false;
  return /^[a-z0-9]+$/.test(name);
}

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
  const maxAgeSeconds = cfg.SESSION_MAX_AGE_DAYS * 24 * 60 * 60;

  const body = req.body || {};
  let customLocalPart = null;
  if (body.customLocalPart) {
    customLocalPart = String(body.customLocalPart).trim().toLowerCase();
  }

  let domain = cfg.EMAIL_DOMAINS[0];
  if (body.domain) {
    const requested = String(body.domain).trim().toLowerCase();
    if (!cfg.EMAIL_DOMAINS.includes(requested)) {
      return sendJson(res, 400, { ok: false, error: `Domain "${requested}" gak valid.` });
    }
    domain = requested;
  }

  // ── Kalau nama custom dikasih: validasi + reserve dulu (SAMA kayak
  // urutan di bot -- reserve terjadi SEBELUM cek cooldown). ──────────
  if (customLocalPart) {
    if (!isValidLocalPart(customLocalPart)) {
      return sendJson(res, 400, {
        ok: false,
        error: `"${customLocalPart}" gak valid (harus huruf kecil/angka aja, 3-64 karakter).`,
      });
    }

    let reserveResult;
    try {
      reserveResult = await reserveLocalPart(cfg, customLocalPart, domain);
    } catch (e) {
      return sendJson(res, 502, { ok: false, error: `Gagal cek ketersediaan nama (${e.message}).` });
    }

    if (!reserveResult.available) {
      const suggestions = suggestAlternatives(customLocalPart, LOCAL_PART_MAX);
      return sendJson(res, 409, {
        ok: false,
        taken: true,
        error: `Nama "${customLocalPart}" udah dipakai.`,
        suggestions,
      });
    }
  }

  // ── Cooldown (soft anti-spam, sama kayak bot -- bukan pengganti
  // rate limit di level Cloudflare). ──────────────────────────────
  const lastGen = verify(cookies.gm_cooldown, cfg.COOKIE_SECRET);
  const now = Date.now();
  const cooldownMs = cfg.COOLDOWN_SECONDS * 1000;
  if (lastGen && now - lastGen.t < cooldownMs) {
    const sisa = Math.ceil((cooldownMs - (now - lastGen.t)) / 1000);
    return sendJson(res, 429, { ok: false, cooldown: true, secondsLeft: sisa });
  }

  // ── Generate + simpan ke riwayat (KV, dipakai bareng lintas
  // device -- gantinya cookie gm_history per-browser). ──────────────
  const { email, link } = generateGenmail(cfg, customLocalPart, domain);
  const entry = { id: crypto.randomUUID().slice(0, 8), email, link, createdAt: now };

  let history;
  try {
    history = await kv.getHistory(cfg);
  } catch (e) {
    return sendJson(res, 502, { ok: false, error: e.message });
  }
  const newHistory = [entry, ...history];

  try {
    await kv.putHistory(cfg, newHistory);
  } catch (e) {
    return sendJson(res, 502, { ok: false, error: e.message });
  }

  setCookie(res, "gm_cooldown", sign({ t: now }, cfg.COOKIE_SECRET), { maxAgeSeconds });

  return sendJson(res, 200, { ok: true, entry });
};

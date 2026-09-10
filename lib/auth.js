const { sign, verify } = require("./signedCookie");

// Cuma 1 akun, gak ada register. Username/password dicek langsung
// dari config (default "yori" / "owner", bisa dioverride via env var
// AUTH_USERNAME / AUTH_PASSWORD kalau suatu saat mau ganti).
const SESSION_COOKIE = "gm_session";

function checkLogin(cfg, username, password) {
  return username === cfg.AUTH_USERNAME && password === cfg.AUTH_PASSWORD;
}

// Session cookie di-sign HMAC pakai COOKIE_SECRET yang sama kayak
// dulu dipakai buat gm_history -- jadi gak bisa dipalsuin dari
// browser, dan berlaku di device manapun selama cookie-nya kebawa.
function createSessionValue(cfg) {
  return sign({ u: cfg.AUTH_USERNAME, t: Date.now() }, cfg.COOKIE_SECRET);
}

function isLoggedIn(cfg, cookies) {
  const session = verify(cookies[SESSION_COOKIE], cfg.COOKIE_SECRET);
  return !!(session && session.u === cfg.AUTH_USERNAME);
}

module.exports = { SESSION_COOKIE, checkLogin, createSessionValue, isLoggedIn };

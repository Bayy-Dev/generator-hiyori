const config = require("../lib/config");
const { setCookie, sendJson } = require("../lib/http");
const { checkLogin, createSessionValue } = require("../lib/auth");

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

  const body = req.body || {};
  const username = String(body.username || "").trim();
  const password = String(body.password || "");

  if (!checkLogin(cfg, username, password)) {
    return sendJson(res, 401, { ok: false, error: "Username atau password salah." });
  }

  const maxAgeSeconds = cfg.SESSION_MAX_AGE_DAYS * 24 * 60 * 60;
  setCookie(res, "gm_session", createSessionValue(cfg), { maxAgeSeconds });

  return sendJson(res, 200, { ok: true });
};

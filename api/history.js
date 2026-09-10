const config = require("../lib/config");
const { getCookies, sendJson } = require("../lib/http");
const { isLoggedIn } = require("../lib/auth");
const kv = require("../lib/kv");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
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

  let history;
  try {
    history = await kv.getHistory(cfg);
  } catch (e) {
    return sendJson(res, 502, { ok: false, error: e.message });
  }

  return sendJson(res, 200, { ok: true, entries: history });
};

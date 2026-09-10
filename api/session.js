const config = require("../lib/config");
const { getCookies, sendJson } = require("../lib/http");
const { isLoggedIn } = require("../lib/auth");

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
  return sendJson(res, 200, { ok: true, loggedIn: isLoggedIn(cfg, cookies) });
};

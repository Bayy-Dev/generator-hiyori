const config = require("../lib/config");
const { setCookie, sendJson } = require("../lib/http");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }

  try {
    config;
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: e.message });
  }

  setCookie(res, "gm_session", "", { maxAgeSeconds: 0 });
  return sendJson(res, 200, { ok: true });
};

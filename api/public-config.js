const config = require("../lib/config");
const { sendJson } = require("../lib/http");

module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, error: "Method not allowed" });
  }
  // HANYA field non-sensitif yang boleh keluar sini. Jangan pernah
  // masukkan LINK_SIGNING_SECRET, COOKIE_SECRET, atau WORKER_DELETE_URL.
  return sendJson(res, 200, { ok: true, emailDomains: config.EMAIL_DOMAINS });
};

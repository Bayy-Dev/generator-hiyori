const crypto = require("crypto");

/**
 * Nyimpen data (riwayat email / timestamp cooldown) di cookie
 * httpOnly yang di-sign HMAC, biar gak bisa dipalsuin dari browser.
 * Ini pengganti history.json di versi bot -- karena filesystem Vercel
 * Functions gak persisten antar-request, jadi state-nya dititip di
 * cookie sisi client (tapi tetap gak bisa diedit user, karena sig-nya
 * divalidasi tiap request).
 */
function sign(payload, secret) {
  const json = JSON.stringify(payload);
  const b64 = Buffer.from(json, "utf8").toString("base64url");
  const h = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${h}`;
}

function verify(value, secret) {
  if (!value || typeof value !== "string") return null;
  const dot = value.lastIndexOf(".");
  if (dot === -1) return null;
  const b64 = value.slice(0, dot);
  const h = value.slice(dot + 1);
  const expected = crypto.createHmac("sha256", secret).update(b64).digest("base64url");

  const hBuf = Buffer.from(h);
  const eBuf = Buffer.from(expected);
  if (hBuf.length !== eBuf.length || !crypto.timingSafeEqual(hBuf, eBuf)) return null;

  try {
    return JSON.parse(Buffer.from(b64, "base64url").toString("utf8"));
  } catch (e) {
    return null;
  }
}

module.exports = { sign, verify };

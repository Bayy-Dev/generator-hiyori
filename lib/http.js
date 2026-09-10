const cookie = require("cookie");

function getCookies(req) {
  return cookie.parse(req.headers.cookie || "");
}

// Menumpuk beberapa Set-Cookie sekaligus dalam 1 response (Vercel Node
// functions butuh array di header Set-Cookie kalau lebih dari 1).
function appendSetCookie(res, value) {
  const prev = res.getHeader("Set-Cookie");
  if (!prev) {
    res.setHeader("Set-Cookie", [value]);
  } else if (Array.isArray(prev)) {
    res.setHeader("Set-Cookie", [...prev, value]);
  } else {
    res.setHeader("Set-Cookie", [prev, value]);
  }
}

function setCookie(res, name, value, { maxAgeSeconds } = {}) {
  appendSetCookie(
    res,
    cookie.serialize(name, value, {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    })
  );
}

function sendJson(res, status, obj) {
  res.status(status).setHeader("Content-Type", "application/json").end(JSON.stringify(obj));
}

module.exports = { getCookies, setCookie, sendJson };

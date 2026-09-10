const crypto = require("crypto");

const CHARSET = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * SAMA PERSIS dengan versi bot Telegram: local-part random huruf
 * kecil + angka, cocok regex /^[a-z0-9]{1,64}$/ di api/inbox.js.
 */
function randomLocalPart(length) {
  const bytes = crypto.randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += CHARSET[bytes[i] % CHARSET.length];
  }
  return out;
}

/**
 * HMAC-SHA256(secret, email), dipotong 24 karakter hex -- HARUS SAMA
 * PERSIS dengan computeSignature() di api/inbox.js situs generator.
 */
function computeSignature(email, secret) {
  return crypto.createHmac("sha256", secret).update(email).digest("hex").slice(0, 24);
}

function generateGenmail(config, customLocalPart, domain) {
  const localPart = customLocalPart || randomLocalPart(config.LOCAL_PART_LENGTH);
  const emailDomain = domain || config.EMAIL_DOMAINS[0];
  const email = `${localPart}@${emailDomain}`;
  const sig = computeSignature(email, config.LINK_SIGNING_SECRET);
  const link = `${config.GENERATOR_BASE_URL}/?email=${encodeURIComponent(email)}&sig=${sig}`;
  return { email, sig, link };
}

/**
 * Cek + kunci 1 local-part custom lewat endpoint /reserve di Worker
 * am-gen-mail (diturunin dari WORKER_DELETE_URL), sama seperti bot.
 */
async function reserveLocalPart(config, localPart, domain) {
  const emailDomain = domain || config.EMAIL_DOMAINS[0];
  const email = `${localPart}@${emailDomain}`;
  const sig = computeSignature(email, config.LINK_SIGNING_SECRET);
  const reserveUrl = config.WORKER_DELETE_URL.replace(/\/delete$/, "/reserve");

  let res;
  try {
    res = await fetch(reserveUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, sig }),
    });
  } catch (e) {
    throw new Error(`Gak bisa konek ke server: ${e.message}`);
  }

  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`Respons server gak kebaca (HTTP ${res.status})`);
  }

  if (!res.ok || !data.ok) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }

  return { available: !!data.available };
}

function suggestAlternatives(base, max, count = 3) {
  const maxBaseLen = max - 2;
  const trimmedBase = base.slice(0, maxBaseLen);
  const suggestions = new Set();
  let attempts = 0;
  while (suggestions.size < count && attempts < 20) {
    attempts++;
    const suffix = Math.floor(10 + Math.random() * 90);
    suggestions.add(`${trimmedBase}${suffix}`);
  }
  return [...suggestions];
}

module.exports = {
  randomLocalPart,
  computeSignature,
  generateGenmail,
  reserveLocalPart,
  suggestAlternatives,
};

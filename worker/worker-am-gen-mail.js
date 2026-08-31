/**
 * Worker: am-gen-mail
 * Dipicu tiap ada email masuk ke *@hiyorimail.biz.id (lewat Email Routing).
 * Tugasnya: parse SEMUA email yang masuk (bukan cuma yang ada link
 * verifikasinya) -- ambil pengirim/subjek/isi/link (kalau ketemu), lalu
 * DITAMBAHKAN (append) ke daftar pesan yang tersimpan di KV dengan key =
 * local-part alamat tujuan (bagian sebelum @). Jadi 1 key di KV = 1 array
 * berisi riwayat semua email yang masuk ke alamat itu, terbaru di depan.
 *
 * Halaman inbox (generator.hiyorimail.biz.id) baca array ini lewat
 * /api/inbox dan nampilin semuanya sebagai daftar pesan -- bukan cuma
 * nunggu 1 link doang.
 *
 * SETUP YANG DIBUTUHIN (Settings -> Bindings di dashboard Worker ini):
 *   - KV namespace di-bind dengan nama variable: AM_KV
 *
 * Opsional buat testing/debug: isi DEBUG_FORWARD_TO dengan email pribadi
 * (harus destination address yang UDAH VERIFIED di Email Routing) biar
 * email asli tetep keforward ke situ juga selain disimpen ke KV. Kosongin
 * ("") kalau udah gak perlu debug lagi.
 */

const DEBUG_FORWARD_TO = "akuntiktokku1225@gmail.com";

// TTL DIHILANGKAN -- pesan di KV DISIMPEN SELAMANYA, gak ada auto-expire
// sama sekali. Kalau nanti mau batesin lagi, tinggal isi ulang
// KV_TTL_SECONDS dan pasang balik opsi expirationTtl di env.AM_KV.put()
// di bawah.

// Maksimal berapa pesan yang disimpen per alamat. Pesan paling lama
// otomatis kebuang kalau udah kelebihan, biar value KV gak membengkak.
const MAX_MESSAGES_PER_INBOX = 20;

// Batas panjang snippet (ringkasan singkat) yang ditampilin di daftar inbox.
const SNIPPET_MAX_LENGTH = 160;

export default {
  async email(message, env, ctx) {
    try {
      const rawText = await new Response(message.raw).text();
      const localPart = (message.to || "").split("@")[0].toLowerCase();

      if (!localPart) {
        console.log("Gak ada local-part di message.to, skip.");
        return;
      }

      const decodedBody = extractReadableBody(rawText);
      const link = extractBestLink(decodedBody);
      const cleanBody = decodedBody.trim();

      const newMessage = {
        id: `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`,
        from: message.from,
        to: message.to,
        subject: getHeader(rawText, "Subject") || "(tanpa subjek)",
        snippet: buildSnippet(cleanBody),
        body: cleanBody,
        link: link || null,
        receivedAt: Date.now(),
        read: false, // status baca disimpen di KV juga, biar sync antar device (lihat api/mark-read.js)
      };

      // Ambil riwayat pesan lama di key ini (kalau ada), lalu tambahin
      // pesan baru di depan. SETIAP email disimpen -- gak ada filter
      // "cuma yang ada link verifikasinya doang", jadi email apapun
      // (dari layanan manapun) bakal ikut muncul di inbox.
      const existing = await getExistingMessages(env, localPart);
      const updated = [newMessage, ...existing].slice(0, MAX_MESSAGES_PER_INBOX);

      // Tanpa expirationTtl = value ini gak akan pernah ke-expire otomatis.
      await env.AM_KV.put(localPart, JSON.stringify(updated));

      console.log(
        `Tersimpan ke KV[${localPart}]: total ${updated.length} pesan, ${newMessage.link ? "link ketemu" : "tanpa link"}`
      );

      if (DEBUG_FORWARD_TO) {
        try {
          await message.forward(DEBUG_FORWARD_TO);
        } catch (e) {
          console.log("Forward debug gagal (mungkin destination belum verified):", e.message);
        }
      }
    } catch (err) {
      console.error("Worker email handler error:", err.stack || err.message);
    }
  },
};

// Baca array pesan lama dari KV. Kalau kosong, atau formatnya masih
// peninggalan versi lama (1 objek polos, bukan array), tetep dihandle
// dengan aman -- riwayat lama (kalau ada) dianggap 1 pesan pertama.
async function getExistingMessages(env, localPart) {
  const raw = await env.AM_KV.get(localPart);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === "object") return [parsed];
    return [];
  } catch {
    return [];
  }
}

// Buang penanda "{{LINK|teks|href}}" jadi "teks" polos aja -- dipakai
// buat snippet (ringkasan daftar inbox), yang gak butuh link beneran,
// cuma butuh teksnya biar gampang dibaca sekilas.
function stripLinkMarkers(text) {
  return text.replace(/\{\{LINK\|([^|]*)\|[^}]*\}\}/g, "$1");
}

// Bikin ringkasan singkat 1 baris dari body (buang baris kosong berlebih,
// potong ke panjang tertentu) buat ditampilin di daftar inbox.
function buildSnippet(body) {
  const oneLine = stripLinkMarkers(body).replace(/\s+/g, " ").trim();
  if (oneLine.length <= SNIPPET_MAX_LENGTH) return oneLine;
  return oneLine.slice(0, SNIPPET_MAX_LENGTH).trim() + "…";
}

// Ambil isi 1 header dari raw email (simple, cukup buat header pendek kayak Subject).
function getHeader(rawText, name) {
  const re = new RegExp(`^${name}:\\s*(.+)$`, "im");
  const match = rawText.match(re);
  return match ? match[1].trim() : null;
}

// Decode quoted-printable (=XX jadi byte, =\r\n / =\n jadi soft line break dihapus).
function decodeQuotedPrintable(str) {
  return str
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function decodeBase64Safe(str) {
  try {
    const cleaned = str.replace(/[\r\n\s]/g, "");
    return atob(cleaned);
  } catch {
    return "";
  }
}

// Buang tag HTML kasar-kasaran biar jadi teks polos yang enak dibaca di
// inbox (bukan buat parsing serius, cukup buat tampilan snippet/body).
// SEBELUM tag lain dibuang, link <a href="..">teks</a> diubah dulu jadi
// format penanda "{{LINK|teks|href}}" (lihat linkifyAnchors) supaya
// halaman inbox nanti bisa render ulang sebagai link yang BENERAN bisa
// diklik + disalin, bukan jadi teks polos "teks" doang yang kehilangan
// href-nya.
function stripHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Beberapa template email nulis "&" di URL (misal query string yang ada
// beberapa parameter) sebagai entity HTML "&amp;" di source-nya. Kalau
// gak di-decode dulu di sini, nanti pas index.html nge-escape ulang teks
// buat ditampilin, "&amp;" itu bakal keescape lagi jadi "&amp;amp;" dan
// URL-nya jadi rusak. Jadi href di-decode ke bentuk polos dulu sebelum
// dibungkus ke penanda "{{LINK|...}}".
function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&#x27;/gi, "'");
}

// Ubah tiap <a href="URL">teks</a> di HTML jadi penanda teks
// "{{LINK|teks|URL}}" -- dijalankan SEBELUM stripHtml supaya href-nya
// gak ilang pas tag <a> dibuang. Penanda ini nanti di-parse lagi sama
// index.html jadi <a> yang beneran bisa diklik + ada tombol salin di
// sebelahnya.
function linkifyAnchors(html) {
  return html.replace(
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (match, hrefRaw, inner) => {
      const href = decodeHtmlEntities(hrefRaw);
      const text = stripHtml(inner).replace(/\s+/g, " ").trim() || href;
      // Pipe "|" atau kurung kurawal di teks link (jarang, tapi jaga-jaga)
      // diganti biar gak bentrok sama format penanda.
      const safeText = text.replace(/[{}|]/g, " ");
      return `{{LINK|${safeText}|${href}}}`;
    }
  );
}

// Pisahin raw email jadi bagian-bagian (kalau multipart), decode tiap
// bagian sesuai Content-Transfer-Encoding-nya. Kalau ada bagian text/plain,
// itu yang dipakai (paling enak dibaca apa adanya); kalau cuma ada
// text/html, tag-nya dibuang dulu jadi teks polos. Ini dipakai buat SEMUA
// email yang masuk, dari layanan/provider manapun -- gak spesifik ke
// template email tertentu.
function extractReadableBody(rawText) {
  const boundaryMatch = rawText.match(/boundary="?([^"\r\n;]+)"?/i);

  if (!boundaryMatch) {
    // Bukan multipart -- cek Content-Transfer-Encoding & Content-Type di header utama aja.
    const encoding = (getHeader(rawText, "Content-Transfer-Encoding") || "").toLowerCase();
    const contentType = (getHeader(rawText, "Content-Type") || "").toLowerCase();
    const bodyStart = rawText.indexOf("\r\n\r\n");
    let body = bodyStart >= 0 ? rawText.slice(bodyStart + 4) : rawText;
    if (encoding.includes("base64")) body = decodeBase64Safe(body);
    else if (encoding.includes("quoted-printable")) body = decodeQuotedPrintable(body);
    return contentType.includes("text/html") ? stripHtml(linkifyAnchors(body)) : body;
  }

  const boundary = boundaryMatch[1];
  const parts = rawText.split(`--${boundary}`);
  let plainText = "";
  let htmlText = "";

  for (const part of parts) {
    if (!part || part.startsWith("--")) continue;
    const headerEnd = part.indexOf("\r\n\r\n");
    if (headerEnd < 0) continue;

    const partHeaders = part.slice(0, headerEnd);
    const partBody = part.slice(headerEnd + 4);
    const encoding = (partHeaders.match(/Content-Transfer-Encoding:\s*(.+)/i)?.[1] || "").trim().toLowerCase();
    const contentType = (partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i)?.[1] || "").trim().toLowerCase();

    if (!contentType.startsWith("text/")) continue; // skip attachment/gambar

    let decoded = partBody;
    if (encoding.includes("base64")) decoded = decodeBase64Safe(partBody);
    else if (encoding.includes("quoted-printable")) decoded = decodeQuotedPrintable(partBody);

    if (contentType.startsWith("text/plain")) plainText += "\n" + decoded;
    else if (contentType.startsWith("text/html")) htmlText += "\n" + decoded;
  }

  // PENTING: utamain versi HTML (kalau ada) walaupun email-nya multipart
  // dan juga punya versi plain-text. Ini karena cuma versi HTML yang
  // ngelewatin linkifyAnchors() -- versi plain-text cuma teks polos,
  // link-nya (kalau ada) keluar sebagai URL mentah tanpa markup, jadi
  // gak akan pernah jadi link "berlabel" yang bisa diklik+disalin.
  // Plain-text cuma dipakai kalau emailnya EMANG gak punya versi HTML
  // sama sekali.
  if (htmlText.trim()) return stripHtml(linkifyAnchors(htmlText));
  if (plainText.trim()) return plainText.trim();
  return rawText;
}

// Cari kandidat link https:// terbaik dari isi email (teks yang udah
// didecode). Filter kasar buang link yang jelas-jelas bukan link
// aksi/verifikasi (social media, unsubscribe, gambar/tracking pixel,
// dsb). Ini cuma buat ngisi tombol "buka link" kalau ada -- SEMUA email
// tetap disimpen & ditampilin walau gak ketemu link sama sekali.
function extractBestLink(body) {
  const urlRegex = /https?:\/\/[^\s"'<>\]\)\{\}]+/gi;
  const found = body.match(urlRegex) || [];

  const blacklist = [
    "unsubscribe",
    "facebook.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "linkedin.com",
    "youtube.com",
    "privacy",
    "cloudflare.com",
    ".png",
    ".jpg",
    ".jpeg",
    ".gif",
    ".css",
  ];

  const candidates = found
    .map((u) => u.replace(/[.,;:]+$/, "")) // buang tanda baca nyangkut di ujung URL
    .filter((u) => !blacklist.some((b) => u.toLowerCase().includes(b)));

  if (candidates.length === 0) return found[0] || null;

  // Kalau ada beberapa kandidat, ambil yang URL-nya paling panjang -- biasanya
  // link verifikasi (yang ada token/id-nya) lebih panjang dari link generik.
  candidates.sort((a, b) => b.length - a.length);
  return candidates[0];
}

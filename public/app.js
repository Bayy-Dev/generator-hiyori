const titleEl = document.getElementById("screen-title");
const bodyEl = document.getElementById("screen-body");
const btnsEl = document.getElementById("screen-buttons");

function setScreen(title, bodyNodes, buttonRows) {
  titleEl.textContent = title;
  bodyEl.replaceChildren(...bodyNodes);
  btnsEl.replaceChildren();
  for (const row of buttonRows) {
    const rowEl = document.createElement("div");
    rowEl.className = "row";
    for (const btn of row) rowEl.appendChild(btn);
    btnsEl.appendChild(rowEl);
  }
}

function text(str) {
  const p = document.createElement("div");
  p.textContent = str;
  return p;
}

function code(str) {
  const c = document.createElement("code");
  c.textContent = str;
  return c;
}

function btn(label, style, onClick, opts = {}) {
  const b = document.createElement("button");
  b.className = `btn ${style}`;
  b.textContent = label;
  if (opts.disabled) b.disabled = true;
  b.addEventListener("click", onClick);
  return b;
}

function linkBtn(label, url) {
  const a = document.createElement("a");
  a.className = "btn primary";
  a.textContent = label;
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.style.textAlign = "center";
  a.style.textDecoration = "none";
  a.style.display = "block";
  return a;
}

async function api(path, opts) {
  const res = await fetch(path, {
    method: opts?.method || "GET",
    headers: opts?.body ? { "Content-Type": "application/json" } : undefined,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  let data = {};
  try {
    data = await res.json();
  } catch (e) {
    // ignore
  }
  return { status: res.status, data };
}

// ── Login ────────────────────────────────────────────────────────────
function showLogin(errorNote) {
  const nodes = [];
  if (errorNote) {
    const e = text(errorNote);
    e.className = "error";
    nodes.push(e);
  }
  nodes.push(text("Login dulu buat lanjut."));

  const userInput = document.createElement("input");
  userInput.type = "text";
  userInput.placeholder = "Username";
  userInput.autocomplete = "username";

  const passInput = document.createElement("input");
  passInput.type = "password";
  passInput.placeholder = "Password";
  passInput.autocomplete = "current-password";
  passInput.style.marginTop = "0";

  nodes.push(userInput, passInput);

  const doLogin = () => submitLogin(userInput.value.trim(), passInput.value);
  passInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") doLogin();
  });

  setScreen("LOGIN", nodes, [[btn("Login", "success", doLogin)]]);
  userInput.focus();
}

async function submitLogin(username, password) {
  setScreen("LOGIN", [text("⏳ Memproses...")], []);
  const { status, data } = await api("/api/login", { method: "POST", body: { username, password } });

  if (status === 200 && data.ok) {
    return showMain();
  }
  return showLogin(data.error || "Gagal login, coba lagi.");
}

async function doLogout() {
  await api("/api/logout", { method: "POST" });
  showLogin();
}

// ── Main menu ────────────────────────────────────────────────────────
function showMain() {
  const domains = window.EMAIL_DOMAINS || [];
  const domainText =
    domains.length > 1 ? `Generate alamat email sekali pakai (pilihan domain: ${domains.join(", ")}).` : `Generate alamat email sekali pakai di ${domains[0] || "domain ini"}.`;

  setScreen(
    "EMAIL GEN BY YORI",
    [text(domainText), text("Pilih menu di bawah:")],
    [
      [btn("Generate Email", "success", () => showGenChoose())],
      [btn("Riwayat Email", "primary", showRiwayat)],
      [btn("Logout", "neutral", doLogout)],
    ]
  );
}

// ── Generate submenu ─────────────────────────────────────────────────
function showGenChoose(errorNote) {
  const nodes = [];
  if (errorNote) {
    const e = text(errorNote);
    e.className = "error";
    nodes.push(e);
  }
  nodes.push(text("Mau nama custom? Ketik nama yang kamu mau (huruf kecil/angka aja, 3-64 karakter)."));
  nodes.push(text("Atau tap SKIP buat nama random."));

  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = "nama-custom";
  nodes.push(input);

  setScreen("GENERATE EMAIL", nodes, [
    [
      btn("BATAL", "danger", showMain),
      btn("SKIP", "neutral", () => showChooseDomain(null)),
    ],
    [btn("Pakai Nama Ini", "success", () => showChooseDomain(input.value.trim().toLowerCase()))],
  ]);
  input.focus();
}

// ── Pilih domain (muncul setelah nama diisi/skip) ───────────────────
function showChooseDomain(customLocalPart) {
  const domains = window.EMAIL_DOMAINS || [];
  const nameLabel = customLocalPart ? code(customLocalPart) : text("(nama random)");

  if (domains.length <= 1) {
    // Cuma 1 domain tersedia -- gak perlu nanya, langsung generate.
    return submitGenerate(customLocalPart, domains[0]);
  }

  const nodes = [text("Nama:"), nameLabel, text("Mau pakai domain yang mana?")];
  const domainRows = domains.map((d) => [btn(d, "primary", () => submitGenerate(customLocalPart, d))]);

  setScreen("GENERATE EMAIL", nodes, [...domainRows, [btn("BATAL", "danger", () => showGenChoose())]]);
}

function showGenSuggestions(originalName, suggestions, errorNote, domain) {
  const nodes = [];
  const e = text(errorNote || `Nama "${originalName}" udah dipakai.`);
  e.className = "error";
  nodes.push(e);
  nodes.push(text("Pilih salah satu saran di bawah, atau balik ke menu buat coba nama lain:"));

  const suggestionRow = suggestions.map((s) => btn(s, "primary", () => submitGenerate(s, domain)));

  setScreen("GENERATE EMAIL", nodes, [
    suggestionRow,
    [btn("BATAL", "danger", showMain), btn("SKIP", "neutral", () => submitGenerate(null, domain))],
  ]);
}

async function submitGenerate(customLocalPart, domain) {
  setScreen("GENERATE EMAIL", [text("⏳ Memproses...")], []);

  const { status, data } = await api("/api/generate", {
    method: "POST",
    body: { customLocalPart: customLocalPart || null, domain: domain || null },
  });

  if (status === 401) return showLogin("Sesi habis, login lagi ya.");

  if (status === 200 && data.ok) {
    return showResult(data.entry);
  }

  if (status === 409 && data.taken) {
    return showGenSuggestions(customLocalPart, data.suggestions || [], data.error, domain);
  }

  if (status === 429 && data.cooldown) {
    return setScreen(
      "GENERATE EMAIL",
      [text(`⏳ Tunggu ${data.secondsLeft} detik lagi ya sebelum generate lagi.`)],
      [[btn("Menu", "neutral", showMain)]]
    );
  }

  return showGenChoose(data.error || "Terjadi kesalahan, coba lagi.");
}

// ── Result ───────────────────────────────────────────────────────────
function showResult(entry) {
  setScreen(
    "GENERATE EMAIL",
    [
      text("📧 Email baru berhasil dibuat:"),
      code(entry.email),
      text("Tap tombol di bawah buat pantau inbox. Halaman itu auto-cek tiap beberapa detik sampai emailnya masuk."),
    ],
    [
      [linkBtn("Buka Inbox", entry.link)],
      [btn("Generate Lagi", "success", () => showGenChoose())],
      [btn("Menu", "neutral", showMain)],
    ]
  );
}

// ── Riwayat ──────────────────────────────────────────────────────────
async function showRiwayat() {
  setScreen("DAFTAR EMAIL", [text("⏳ Memuat...")], []);
  const { status, data } = await api("/api/history");

  if (status === 401) return showLogin("Sesi habis, login lagi ya.");

  if (status !== 200 || !data.ok) {
    return setScreen("DAFTAR EMAIL", [text("Gagal memuat riwayat.")], [[btn("Menu", "neutral", showMain)]]);
  }

  const entries = data.entries || [];
  if (entries.length === 0) {
    return setScreen(
      "DAFTAR EMAIL",
      [text("Belum ada email yang di-generate. Tap Generate dulu.")],
      [[btn("Generate Email", "success", showGenChoose)], [btn("Menu", "neutral", showMain)]]
    );
  }

  const rows = entries.map((e) => [btn(e.email, "primary", () => showDetail(e))]);
  rows.push([btn("Menu", "neutral", showMain)]);
  setScreen("DAFTAR EMAIL", [text("Pilih email dibawah:")], rows);
}

function formatPembuatan(ts) {
  const d = new Date(ts);
  const tanggal = d.toLocaleDateString("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const jam = d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  return `${tanggal} (${jam})`;
}

function showDetail(entry) {
  setScreen("RIWAYAT EMAIL", [text("📧 EMAIL:"), code(entry.email), text(`🕒 PEMBUATAN: ${formatPembuatan(entry.createdAt)}`)], [
    [linkBtn("WEB INBOX", entry.link)],
    [btn("Hapus Email", "danger", () => showConfirmHapus(entry))],
    [btn("Kembali", "neutral", showRiwayat)],
  ]);
}

function showConfirmHapus(entry) {
  setScreen(
    "RIWAYAT EMAIL",
    [text("📧 EMAIL:"), code(entry.email), text("⚠️ Yakin mau hapus email ini secara permanen?")],
    [
      [btn("Ya, Hapus", "danger", () => doDelete(entry))],
      [btn("Batal", "neutral", () => showDetail(entry))],
    ]
  );
}

async function doDelete(entry) {
  setScreen("RIWAYAT EMAIL", [text("⏳ Menghapus...")], []);
  const { status, data } = await api("/api/delete", { method: "POST", body: { id: entry.id } });

  if (status === 401) return showLogin("Sesi habis, login lagi ya.");

  if (status === 200 && data.ok) {
    return setScreen(
      "RIWAYAT EMAIL",
      [text(`✅ Email ${entry.email} sudah dihapus dari Cloudflare & riwayat.`)],
      [[btn("Kembali ke daftar", "neutral", showRiwayat)]]
    );
  }

  return setScreen(
    "RIWAYAT EMAIL",
    [text(data.error || "Gagal hapus, coba lagi."), text("")],
    [[btn("Kembali", "neutral", () => showDetail(entry))]]
  );
}

(async function init() {
  try {
    const { data } = await api("/api/public-config");
    if (data.ok) window.EMAIL_DOMAINS = data.emailDomains || [];
  } catch (e) {
    // fallback: tetap lanjut meski gagal ambil domain
  }

  let loggedIn = false;
  try {
    const { data } = await api("/api/session");
    loggedIn = !!(data.ok && data.loggedIn);
  } catch (e) {
    // gagal cek sesi -> anggap belum login
  }

  return loggedIn ? showMain() : showLogin();
})();

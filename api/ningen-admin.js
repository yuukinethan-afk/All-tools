// Kode mode-admin ekstensi Ningen: dibuat & dicabut dari admin.html, dicek oleh ekstensi lewat action=verify.
const crypto = require("crypto");
const L = require("./_lib");
const KEY = "alltools:ningenadmins";

function genKey() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.randomBytes(16);
  let s = ""; for (let i = 0; i < 16; i++) s += abc[bytes[i] % abc.length];
  return s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12) + "-" + s.slice(12, 16);
}
async function loadKeys() {
  if (!L.hasStore()) return [];
  try { const raw = await L.redis(["GET", KEY]); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
async function saveKeys(keys) { await L.redis(["SET", KEY, JSON.stringify(keys)]); }

const fails = {};
module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  const body = req.body || {};

  // ---- publik: dipanggil ekstensi untuk cek kode ----
  if (body.action === "verify") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
    const f = fails[ip] || { n: 0, t: 0 };
    if (Date.now() - f.t >= 900000) f.n = 0;
    if (f.n >= 10) return res.status(429).json({ ok: false });
    const key = String(body.key || "").trim();
    if (!key) return res.status(200).json({ ok: false });
    const keys = await loadKeys();
    const found = keys.find((x) => x.key && L.eqStr(key, x.key));
    if (!found || !found.active) {
      fails[ip] = { n: f.n + 1, t: Date.now() };
      await new Promise((r) => setTimeout(r, 300));
      return res.status(200).json({ ok: false });
    }
    delete fails[ip];
    return res.status(200).json({ ok: true });
  }

  // ---- khusus admin (login) ----
  if (!L.isAuthed(req)) return res.status(401).json({ error: "Belum login." });
  if (!L.hasStore()) return res.status(500).json({ error: "Database belum terhubung (Upstash Redis)." });
  let keys = await loadKeys();

  if (body.action === "list") return res.status(200).json(keys);

  if (body.action === "create") {
    if (keys.length >= 100) return res.status(400).json({ error: "Terlalu banyak kode, hapus yang lama dulu." });
    const label = String(body.label || "").trim().slice(0, 40);
    const entry = { id: crypto.randomBytes(6).toString("hex"), key: genKey(), active: true, createdAt: Date.now(), label };
    keys.unshift(entry);
    await saveKeys(keys);
    return res.status(200).json({ ok: true, entry });
  }
  if (body.action === "toggle") {
    const id = String(body.id || ""), k = keys.find((x) => x.id === id);
    if (!k) return res.status(404).json({ error: "Kode tidak ditemukan." });
    k.active = !k.active;
    await saveKeys(keys);
    return res.status(200).json({ ok: true, active: k.active });
  }
  if (body.action === "delete") {
    const id = String(body.id || ""), before = keys.length;
    keys = keys.filter((x) => x.id !== id);
    if (keys.length === before) return res.status(404).json({ error: "Kode tidak ditemukan." });
    await saveKeys(keys);
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ error: "Aksi tidak dikenal." });
};

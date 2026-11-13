const crypto = require("crypto");
const L = require("./_lib");

function genKey() {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // tanpa karakter mirip (I,O,0,1)
  const bytes = crypto.randomBytes(12);
  let s = "";
  for (let i = 0; i < 12; i++) s += abc[bytes[i] % abc.length];
  return s.slice(0, 4) + "-" + s.slice(4, 8) + "-" + s.slice(8, 12);
}
async function loadKeys() {
  if (!L.hasStore()) return [];
  try { const raw = await L.redis(["GET", L.VIP_KEY]); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}
async function saveKeys(keys) { await L.redis(["SET", L.VIP_KEY, JSON.stringify(keys)]); }

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (!L.isAuthed(req)) return res.status(401).json({ error: "Belum login." });

  if (req.method === "GET") {
    const keys = await loadKeys();
    return res.status(200).json(keys.map((k) => ({ id: k.id, key: k.key, active: k.active, createdAt: k.createdAt, label: k.label || "" })));
  }
  if (req.method !== "POST") return res.status(405).end();
  if (!L.hasStore()) return res.status(500).json({ error: "Database belum terhubung (Upstash Redis)." });

  const body = req.body || {};
  let keys = await loadKeys();

  if (body.action === "create") {
    if (keys.length >= 300) return res.status(400).json({ error: "Terlalu banyak kunci, hapus yang lama dulu." });
    const label = String(body.label || "").trim().slice(0, 40);
    const entry = { id: crypto.randomBytes(6).toString("hex"), key: genKey(), active: true, createdAt: Date.now(), label };
    keys.unshift(entry);
    await saveKeys(keys);
    return res.status(200).json({ ok: true, entry });
  }
  if (body.action === "toggle") {
    const id = String(body.id || ""), k = keys.find((x) => x.id === id);
    if (!k) return res.status(404).json({ error: "Kunci tidak ditemukan." });
    k.active = !k.active;
    await saveKeys(keys);
    return res.status(200).json({ ok: true, active: k.active });
  }
  if (body.action === "delete") {
    const id = String(body.id || ""), before = keys.length;
    keys = keys.filter((x) => x.id !== id);
    if (keys.length === before) return res.status(404).json({ error: "Kunci tidak ditemukan." });
    await saveKeys(keys);
    return res.status(200).json({ ok: true });
  }
  return res.status(400).json({ error: "Aksi tidak dikenal." });
};

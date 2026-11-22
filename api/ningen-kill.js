// Saklar jarak jauh untuk ekstensi Ningen Uploader.
// GET  -> publik, dibaca ekstensi (cache 1x per browser, default ON kalau server/redis tidak terjangkau).
// POST -> hanya admin (login via /api/login), { on: boolean, msg?: string }.
const L = require("./_lib");
const KEY = "alltools:ningenkill";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    if (!L.hasStore()) return res.status(200).json({ on: true, msg: "" });
    try {
      const raw = await L.redis(["GET", KEY]);
      const d = raw ? JSON.parse(raw) : { on: true, msg: "" };
      return res.status(200).json({ on: d.on !== false, msg: String(d.msg || "").slice(0, 200) });
    } catch (e) {
      return res.status(200).json({ on: true, msg: "" });
    }
  }

  if (req.method !== "POST") return res.status(405).end();
  if (!L.isAuthed(req)) return res.status(401).json({ error: "Belum login." });
  if (!/application\/json/i.test(req.headers["content-type"] || ""))
    return res.status(415).json({ error: "Content-Type harus JSON." });
  if (!L.hasStore()) return res.status(500).json({ error: "Database belum terhubung (Upstash Redis)." });

  const body = req.body || {};
  const on = body.on !== false;
  const msg = String(body.msg || "").trim().slice(0, 200);
  try {
    await L.redis(["SET", KEY, JSON.stringify({ on, msg })]);
    res.status(200).json({ ok: true, on, msg });
  } catch (e) {
    res.status(500).json({ error: "Gagal menyimpan." });
  }
};

// Saklar jarak jauh untuk ekstensi Ningen Methodz.
// GET  -> publik, dibaca ekstensi (cache 20 detik di client, default ON kalau server/redis tidak terjangkau).
// POST -> hanya admin (login via /api/login), { on: boolean, msg?: string, latestVersion?: string }.
//
// latestVersion dipakai bersama oleh /api/ningen-admin (action=verify): kode admin HANYA valid
// kalau versi ekstensi yang mengirim >= latestVersion yang diset di sini. Kosongkan/hapus field ini
// (string kosong) untuk menonaktifkan sementara pengecekan versi.
const L = require("./_lib");
const KEY = "alltools:ningenkill";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();

  if (req.method === "GET") {
    if (!L.hasStore()) return res.status(200).json({ on: true, msg: "", latestVersion: "" });
    try {
      const raw = await L.redis(["GET", KEY]);
      const d = raw ? JSON.parse(raw) : { on: true, msg: "", latestVersion: "" };
      return res.status(200).json({
        on: d.on !== false,
        msg: String(d.msg || "").slice(0, 200),
        latestVersion: String(d.latestVersion || "").slice(0, 20),
      });
    } catch (e) {
      return res.status(200).json({ on: true, msg: "", latestVersion: "" });
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
  const latestVersion = String(body.latestVersion || "").trim().slice(0, 20);
  try {
    await L.redis(["SET", KEY, JSON.stringify({ on, msg, latestVersion })]);
    res.status(200).json({ ok: true, on, msg, latestVersion });
  } catch (e) {
    res.status(500).json({ error: "Gagal menyimpan." });
  }
};

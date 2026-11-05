const crypto = require("crypto");
const L = require("./_lib");
const RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/;

module.exports = async (req, res) => {
  if (req.method === "GET") {
    const id = String((req.query && req.query.id) || "");
    if (!/^[a-z0-9]{6,20}$/.test(id) || !L.hasStore()) return res.status(404).end();
    try {
      const raw = await L.redis(["GET", "alltools:img:" + id]);
      const m = raw && RE.exec(raw);
      if (!m) return res.status(404).end();
      res.setHeader("Content-Type", m[1]);
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      res.setHeader("X-Content-Type-Options", "nosniff");
      return res.status(200).send(Buffer.from(m[2], "base64"));
    } catch (e) { return res.status(500).end(); }
  }
  if (req.method !== "POST") return res.status(405).end();
  res.setHeader("Cache-Control", "no-store");
  if (!L.isAuthed(req)) return res.status(401).json({ error: "Belum login." });
  if (!/application\/json/i.test(req.headers["content-type"] || ""))
    return res.status(415).json({ error: "Content-Type harus JSON." });
  if (!L.hasStore()) return res.status(500).json({ error: "Database belum terhubung (Upstash Redis)." });
  const d = req.body && req.body.data;
  if (typeof d !== "string" || d.length > 500000 || !RE.test(d))
    return res.status(400).json({ error: "Gambar tidak valid atau terlalu besar." });
  const id = crypto.randomBytes(8).toString("hex");
  try {
    await L.redis(["SET", "alltools:img:" + id, d]);
    res.status(200).json({ url: "/api/img?id=" + id });
  } catch (e) { res.status(500).json({ error: "Gagal menyimpan gambar." }); }
};

const L = require("./_lib");
const okUrl = (u) => /^https?:\/\/[^\s'"()<>\\]+$/i.test(u);
function cleanBg(b) {
  b = String(b || "").trim().slice(0, 400);
  if (!b) return "";
  if (okUrl(b) || /^\/[^\s'"()<>\\]*$/.test(b)) return b;
  if (/^(linear|radial)-gradient\([a-zA-Z0-9#%.,()\s-]+\)$/.test(b)) return b;
  return null;
}
const str = (v, n) => String(v == null ? "" : v).trim().slice(0, n);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    if (!L.hasStore()) return res.status(200).json([]);
    try {
      const raw = await L.redis(["GET", L.KEY]);
      return res.status(200).json(raw ? JSON.parse(raw) : []);
    } catch (e) { return res.status(200).json([]); }
  }
  if (req.method !== "POST") return res.status(405).end();
  if (!L.isAuthed(req)) return res.status(401).json({ error: "Belum login." });
  if (!/application\/json/i.test(req.headers["content-type"] || ""))
    return res.status(415).json({ error: "Content-Type harus JSON." });

  const a = req.body;
  if (!Array.isArray(a) || a.length > 200) return res.status(400).json({ error: "Data tidak valid." });
  const out = [];
  for (const x of a) {
    const n = str(x && x.n, 60), u = str(x && x.u, 500), bg = cleanBg(x && x.bg);
    if (!n) return res.status(400).json({ error: "Judul wajib diisi." });
    if (!okUrl(u)) return res.status(400).json({ error: "URL harus diawali http:// atau https:// (" + n + ")." });
    if (bg === null) return res.status(400).json({ error: "Format gambar/background tidak valid (" + n + ")." });
    out.push({
      id: str(x.id, 40).toLowerCase().replace(/[^a-z0-9-]/g, "") || Math.random().toString(36).slice(2, 10),
      n, u, bg, c: str(x.c, 20) || "Tools", b: str(x.b, 12).toUpperCase() || "LINK", d: str(x.d, 140),
    });
  }
  if (!L.hasStore()) return res.status(500).json({ error: "Database belum terhubung (Upstash Redis)." });
  try {
    await L.redis(["SET", L.KEY, JSON.stringify(out)]);
    res.status(200).json({ ok: true, count: out.length });
  } catch (e) { res.status(500).json({ error: "Gagal menyimpan." }); }
};

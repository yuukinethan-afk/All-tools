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
const slug = (v, n) => str(v, n).toLowerCase().replace(/[^a-z0-9-]/g, "");
const okHash = (v) => typeof v === "string" && /^[0-9a-f]{64}$/i.test(v);

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") {
    if (!L.hasStore()) return res.status(200).json({ tools: [], over: {}, vipHash: "" });
    try {
      const raw = await L.redis(["GET", L.KEY]);
      const d = raw ? JSON.parse(raw) : [];
      if (Array.isArray(d)) return res.status(200).json({ tools: d, over: {}, vipHash: "" });
      return res.status(200).json({ tools: d.tools || [], over: d.over || {}, vipHash: okHash(d.vipHash) ? d.vipHash : "" });
    } catch (e) { return res.status(200).json({ tools: [], over: {}, vipHash: "" }); }
  }
  if (req.method !== "POST") return res.status(405).end();
  if (!L.isAuthed(req)) return res.status(401).json({ error: "Belum login." });
  if (!/application\/json/i.test(req.headers["content-type"] || ""))
    return res.status(415).json({ error: "Content-Type harus JSON." });

  const body = req.body;
  const a = Array.isArray(body) ? body : body && body.tools;
  const ov = (body && !Array.isArray(body) && body.over) || {};
  if (!Array.isArray(a) || a.length > 200 || typeof ov !== "object") return res.status(400).json({ error: "Data tidak valid." });

  const out = [];
  for (const x of a) {
    const n = str(x && x.n, 60), u = str(x && x.u, 500), bg = cleanBg(x && x.bg);
    if (!n) return res.status(400).json({ error: "Judul wajib diisi." });
    if (!okUrl(u)) return res.status(400).json({ error: "URL harus diawali http:// atau https:// (" + n + ")." });
    if (bg === null) return res.status(400).json({ error: "Format gambar/background tidak valid (" + n + ")." });
    out.push({
      id: slug(x.id, 40) || Math.random().toString(36).slice(2, 10),
      n, u, bg, c: str(x.c, 20) || "Tools", b: str(x.b, 12).toUpperCase() || "LINK", d: str(x.d, 140),
      vip: (x && x.vip) === true,
    });
  }
  const over = {};
  const ks = Object.keys(ov);
  if (ks.length > 100) return res.status(400).json({ error: "Terlalu banyak pengaturan." });
  for (const k of ks) {
    const id = slug(k, 40), o = ov[k] || {};
    if (!id) continue;
    const bg = cleanBg(o.bg);
    if (bg === null) return res.status(400).json({ error: "Format gambar tidak valid (" + id + ")." });
    const n = str(o.n, 60), hide = o.hide === true, vip = o.vip === true;
    if (n || bg || hide || vip) over[id] = { n, bg, hide, vip };
  }

  let vipHash = "";
  if (!Array.isArray(body) && typeof body.vipHash === "string") {
    if (body.vipHash === "") vipHash = "";
    else if (okHash(body.vipHash)) vipHash = body.vipHash.toLowerCase();
    else return res.status(400).json({ error: "Format kode VIP tidak valid." });
  }

  if (!L.hasStore()) return res.status(500).json({ error: "Database belum terhubung (Upstash Redis)." });
  try {
    await L.redis(["SET", L.KEY, JSON.stringify({ tools: out, over, vipHash })]);
    res.status(200).json({ ok: true, count: out.length });
  } catch (e) { res.status(500).json({ error: "Gagal menyimpan." }); }
};

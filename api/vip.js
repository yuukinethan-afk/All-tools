const L = require("./_lib");
const COOKIE = "; Path=/; HttpOnly; Secure; SameSite=Strict";
const fails = {};

async function loadKeys() {
  if (!L.hasStore()) return [];
  try { const raw = await L.redis(["GET", L.VIP_KEY]); return raw ? JSON.parse(raw) : []; } catch (e) { return []; }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    const id = L.vipIdFromReq(req);
    if (!id) return res.status(200).json({ ok: false });
    const keys = await loadKeys();
    const k = keys.find((x) => x.id === id);
    return res.status(200).json({ ok: !!(k && k.active) });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", "nx_vip=" + COOKIE + "; Max-Age=0");
    return res.status(200).json({ ok: true });
  }

  if (req.method !== "POST") return res.status(405).end();
  if ((process.env.SESSION_SECRET || "").length < 16)
    return res.status(500).json({ error: "Server belum dikonfigurasi (SESSION_SECRET)." });

  const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
  const f = fails[ip] || { n: 0, t: 0 };
  if (Date.now() - f.t >= 900000) f.n = 0;
  if (f.n >= 8) return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi 15 menit lagi." });

  const key = String((req.body && req.body.key) || "").trim();
  if (!key) return res.status(400).json({ error: "Masukkan kunci VIP." });

  const keys = await loadKeys();
  const found = keys.find((x) => x.key && L.eqStr(key, x.key));
  if (!found || !found.active) {
    fails[ip] = { n: f.n + 1, t: Date.now() };
    await new Promise((r) => setTimeout(r, 500));
    return res.status(401).json({ error: "Kunci salah atau sudah tidak aktif." });
  }
  delete fails[ip];
  res.setHeader("Set-Cookie", "nx_vip=" + encodeURIComponent(L.vipToken(found.id)) + COOKIE + "; Max-Age=15552000");
  res.status(200).json({ ok: true });
};

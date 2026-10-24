const L = require("./_lib");
const fails = {};
const COOKIE = "; Path=/; HttpOnly; Secure; SameSite=Strict";

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "GET") return res.status(200).json({ ok: L.isAuthed(req) });
  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", "nx_session=" + COOKIE + "; Max-Age=0");
    return res.status(200).json({ ok: true });
  }
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.ADMIN_PASSWORD || (process.env.SESSION_SECRET || "").length < 16)
    return res.status(500).json({ error: "Server belum dikonfigurasi (ADMIN_PASSWORD / SESSION_SECRET)." });

  const ip = String(req.headers["x-forwarded-for"] || "x").split(",")[0].trim();
  const f = fails[ip] || { n: 0, t: 0 };
  if (Date.now() - f.t >= 900000) f.n = 0;
  if (f.n >= 5) return res.status(429).json({ error: "Terlalu banyak percobaan. Coba lagi 15 menit lagi." });

  const pw = (req.body && req.body.password) || "";
  if (!L.eqStr(pw, process.env.ADMIN_PASSWORD)) {
    fails[ip] = { n: f.n + 1, t: Date.now() };
    await new Promise((r) => setTimeout(r, 700));
    return res.status(401).json({ error: "Sandi salah." });
  }
  delete fails[ip];
  res.setHeader("Set-Cookie", "nx_session=" + encodeURIComponent(L.makeToken()) + COOKIE + "; Max-Age=86400");
  res.status(200).json({ ok: true });
};

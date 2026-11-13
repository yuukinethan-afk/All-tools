const crypto = require("crypto");
const KEY = "alltools:custom";
const secret = () => process.env.SESSION_SECRET || "";
const sign = (p) => crypto.createHmac("sha256", secret()).update(p).digest("base64url");

exports.KEY = KEY;
exports.makeToken = () => { const p = String(Date.now() + 86400000); return p + "." + sign(p); };
exports.isAuthed = (req) => {
  if (secret().length < 16) return false;
  const c = {};
  (req.headers.cookie || "").split(";").forEach((x) => {
    const i = x.indexOf("="); if (i > 0) c[x.slice(0, i).trim()] = decodeURIComponent(x.slice(i + 1).trim());
  });
  const t = c.nx_session; if (!t) return false;
  const [p, s] = t.split("."); if (!p || !s) return false;
  const a = Buffer.from(s), b = Buffer.from(sign(p));
  return a.length === b.length && crypto.timingSafeEqual(a, b) && Number(p) > Date.now();
};
exports.eqStr = (a, b) => {
  const h = (v) => crypto.createHash("sha256").update(String(v)).digest();
  return crypto.timingSafeEqual(h(a), h(b));
};
exports.VIP_KEY = "alltools:vipkeys";
exports.vipToken = (id) => id + "." + sign("vip:" + id);
exports.vipIdFromReq = (req) => {
  if (secret().length < 16) return null;
  const c = {};
  (req.headers.cookie || "").split(";").forEach((x) => {
    const i = x.indexOf("="); if (i > 0) c[x.slice(0, i).trim()] = decodeURIComponent(x.slice(i + 1).trim());
  });
  const t = c.nx_vip; if (!t) return null;
  const idx = t.lastIndexOf("."); if (idx < 0) return null;
  const id = t.slice(0, idx), sig = t.slice(idx + 1);
  const expect = sign("vip:" + id);
  const a = Buffer.from(sig), b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id;
};
const base = () => process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const tok = () => process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
exports.hasStore = () => !!(base() && tok());
exports.redis = async (cmd) => {
  const r = await fetch(base(), {
    method: "POST",
    headers: { Authorization: "Bearer " + tok(), "Content-Type": "application/json" },
    body: JSON.stringify(cmd),
  });
  if (!r.ok) throw new Error("Storage error " + r.status);
  return (await r.json()).result;
};

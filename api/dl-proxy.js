const { Readable } = require("stream");

// Hanya domain CDN TikTok/Pinterest yang boleh disalurkan lewat sini — mencegah
// proxy ini disalahgunakan jadi "open proxy" buat alamat sembarang (SSRF).
const ALLOWED_SUFFIX = [
  ".tiktokcdn.com", ".tiktokcdn-us.com", ".tiktokcdn-eu.com", ".tiktokcdn-in.com",
  ".tiktokv.com", ".tiktokv.us", ".tiktok.com",
  ".muscdn.com", ".ibyteimg.com", ".ibytedtos.com", ".byteoversea.com",
  ".pinimg.com",
];
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";

function okHost(u) {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return ALLOWED_SUFFIX.some((suf) => h === suf.slice(1) || h.endsWith(suf));
  } catch (e) { return false; }
}
function safeName(n, fallback) {
  n = String(n || "").trim().replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").slice(0, 80);
  return n || fallback;
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).end();

  const src = String((req.query && req.query.url) || "");
  if (!src || !/^https:\/\//i.test(src) || !okHost(src))
    return res.status(400).json({ error: "URL sumber tidak diizinkan." });

  const ct = String((req.query && req.query.ct) || "").trim();
  const isAudio = /audio|mp3/i.test(ct);
  const name = safeName(req.query && req.query.name, isAudio ? "audio.mp3" : "video.mp4");

  try {
    const up = await fetch(src, { headers: { "User-Agent": UA, Referer: "https://www.tiktok.com/" } });
    if (!up.ok || !up.body) return res.status(502).json({ error: "Gagal mengambil file dari sumbernya (HTTP " + up.status + ")." });

    res.status(200);
    res.setHeader("Content-Type", ct || up.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Content-Disposition", 'attachment; filename="' + name.replace(/"/g, "") + '"');
    const len = up.headers.get("content-length");
    if (len) res.setHeader("Content-Length", len);

    await new Promise((resolve, reject) => {
      const node = Readable.fromWeb(up.body);
      node.pipe(res);
      node.on("error", reject);
      res.on("finish", resolve);
      res.on("close", resolve);
    });
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: "Gagal menyalurkan file." });
  }
};
                               

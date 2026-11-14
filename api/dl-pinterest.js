const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";

function firstMatch(html, patterns) {
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) return m[1].replace(/\\\//g, "/");
  }
  return "";
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  if (!/application\/json/i.test(req.headers["content-type"] || ""))
    return res.status(415).json({ error: "Content-Type harus JSON." });

  const url = String((req.body && req.body.url) || "").trim();
  if (!/^https?:\/\/([a-z0-9-]+\.)?(pinterest\.[a-z.]+|pin\.it)\//i.test(url))
    return res.status(400).json({ error: "Tempel link Pinterest yang valid." });

  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, redirect: "follow" });
    if (!r.ok) return res.status(502).json({ error: "Pinterest tidak bisa diakses (HTTP " + r.status + ")." });
    const html = await r.text();

    const video = firstMatch(html, [
      /"V_720P"\s*:\s*\{\s*"url"\s*:\s*"([^"]+)"/,
      /"V_EXPANDED_LARGE"\s*:\s*\{\s*"url"\s*:\s*"([^"]+)"/,
      /"V_HLSV4"\s*:\s*\{\s*"url"\s*:\s*"([^"]+)"/,
      /<meta property="og:video:secure_url" content="([^"]+)"/,
      /<meta property="og:video" content="([^"]+)"/,
      /"contentUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/,
    ]);
    if (!video) return res.status(404).json({ error: "Video tidak ditemukan. Mungkin pin ini bukan video, atau Pinterest mengubah formatnya." });

    const title = firstMatch(html, [/<meta property="og:title" content="([^"]*)"/]);
    const cover = firstMatch(html, [/<meta property="og:image" content="([^"]*)"/]);

    res.status(200).json({ ok: true, title: title || "", cover: cover || "", video });
  } catch (e) {
    res.status(500).json({ error: "Gagal mengambil video. Coba lagi sebentar lagi." });
  }
};

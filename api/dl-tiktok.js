const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";

function pick(obj, path) {
  try { return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); } catch (e) { return undefined; }
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();
  if (!/application\/json/i.test(req.headers["content-type"] || ""))
    return res.status(415).json({ error: "Content-Type harus JSON." });

  const url = String((req.body && req.body.url) || "").trim();
  if (!/^https?:\/\/(www\.|vt\.|vm\.|m\.)?tiktok\.com\//i.test(url))
    return res.status(400).json({ error: "Tempel link TikTok yang valid." });

  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" }, redirect: "follow" });
    if (!r.ok) return res.status(502).json({ error: "TikTok tidak bisa diakses (HTTP " + r.status + ")." });
    const html = await r.text();

    const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) return res.status(502).json({ error: "Data video tidak ditemukan di halaman. Coba link lain atau coba lagi nanti." });

    let data;
    try { data = JSON.parse(m[1]); } catch (e) { return res.status(502).json({ error: "Gagal membaca data video." }); }

    const scope = pick(data, "__DEFAULT_SCOPE__");
    const detail = scope && (scope["webapp.video-detail"] || scope["webapp.a-b"]);
    const item = pick(detail, "itemInfo.itemStruct");
    if (!item || !item.video) return res.status(404).json({ error: "Video tidak ditemukan. Mungkin privat atau sudah dihapus." });

    const video = item.video;
    const playUrl = (video.playAddr) || (video.downloadAddr) || (Array.isArray(video.bitrateInfo) && video.bitrateInfo[0] && pick(video.bitrateInfo[0], "PlayAddr.UrlList.0"));
    if (!playUrl) return res.status(404).json({ error: "Link video tidak ditemukan." });

    const music = item.music || {};
    const audioUrl = music.playUrl || pick(music, "playUrl.url") || "";

    res.status(200).json({
      ok: true,
      title: String(item.desc || "").slice(0, 200),
      author: pick(item, "author.nickname") || pick(item, "author.uniqueId") || "",
      cover: video.cover || video.originCover || "",
      video: playUrl,
      audio: audioUrl,
      audioTitle: String(music.title || "").slice(0, 120),
    });
  } catch (e) {
    res.status(500).json({ error: "Gagal mengambil video. Coba lagi sebentar lagi." });
  }
};

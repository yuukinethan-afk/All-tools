const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1";

function pick(obj, path) {
  try { return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj); } catch (e) { return undefined; }
}

function cookieHeaderFrom(r) {
  let raw = [];
  try { raw = typeof r.headers.getSetCookie === "function" ? r.headers.getSetCookie() : []; } catch (e) { raw = []; }
  if (!raw.length) { const one = r.headers.get("set-cookie"); if (one) raw = [one]; }
  return raw.map((c) => c.split(";")[0]).join("; ");
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
    const warm = await fetch("https://www.tiktok.com/", { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9" } });
    const cookie = cookieHeaderFrom(warm);

    const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", Cookie: cookie }, redirect: "follow" });
    const html = await r.text();

    if (!r.ok) {
      return res.status(502).json({
        error: "TikTok tidak bisa diakses (HTTP " + r.status + ").",
        debug: { stage: "fetch_video_page", status: r.status, finalUrl: r.url, warmStatus: warm.status, cookieCount: cookie ? cookie.split(";").length : 0, htmlLength: html.length },
      });
    }

    const m = html.match(/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
    if (!m) {
      return res.status(502).json({
        error: "Skrip data video tidak ketemu di halaman.",
        debug: {
          stage: "script_not_found", status: r.status, finalUrl: r.url, warmStatus: warm.status,
          cookieCount: cookie ? cookie.split(";").length : 0, htmlLength: html.length,
          hasSigiState: html.includes("SIGI_STATE"), hasCaptcha: /captcha|verify|unusual traffic/i.test(html),
          snippet: html.slice(0, 300),
        },
      });
    }

    let data;
    try { data = JSON.parse(m[1]); } catch (e) {
      return res.status(502).json({ error: "Gagal membaca data video (JSON rusak).", debug: { stage: "json_parse", snippetLen: m[1].length } });
    }

    const scope = pick(data, "__DEFAULT_SCOPE__");
    const detail = scope && (scope["webapp.video-detail"] || scope["webapp.a-b"]);
    const item = pick(detail, "itemInfo.itemStruct");
    if (!item || !item.video) {
      return res.status(404).json({
        error: "Video tidak ditemukan di data halaman.",
        debug: {
          stage: "item_not_found", scopeKeys: scope ? Object.keys(scope) : [],
          detailKeys: detail ? Object.keys(detail) : [], statusMsg: pick(detail, "statusMsg") || "",
          statusCode: pick(detail, "statusCode"),
        },
      });
    }

    const video = item.video;
    const playUrl = (video.playAddr) || (video.downloadAddr) || (Array.isArray(video.bitrateInfo) && video.bitrateInfo[0] && pick(video.bitrateInfo[0], "PlayAddr.UrlList.0"));
    if (!playUrl) return res.status(404).json({ error: "Link video tidak ditemukan.", debug: { stage: "no_play_url", videoKeys: Object.keys(video) } });

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
    res.status(500).json({ error: "Gagal mengambil video.", debug: { stage: "exception", message: String(e && e.message || e) } });
  }
};

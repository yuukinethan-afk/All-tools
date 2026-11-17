const BASE = "https://api.guerrillamail.com/ajax.php";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function call(params) {
  const u = new URL(BASE);
  Object.entries(params).forEach(([k, v]) => u.searchParams.set(k, v));
  const r = await fetch(u.toString(), { headers: { "User-Agent": UA, Accept: "application/json" } });
  if (!r.ok) throw new Error("HTTP " + r.status);
  return r.json();
}
const str = (v, n) => String(v == null ? "" : v).slice(0, n);
function stripHtml(h) {
  return String(h || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, "\n\n").trim();
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).end();

  const action = String((req.query && req.query.action) || "");
  try {
    if (action === "new") {
      const d = await call({ f: "get_email_address" });
      if (!d || !d.email_addr) return res.status(502).json({ error: "Gagal membuat alamat email." });
      return res.status(200).json({ ok: true, email: d.email_addr, sid: d.sid_token });
    }

    if (action === "check") {
      const sid = str(req.query.sid, 80);
      if (!sid) return res.status(400).json({ error: "Sesi tidak valid, buat email baru." });
      const d = await call({ f: "check_email", sid_token: sid, seq: "0" });
      const list = Array.isArray(d && d.list) ? d.list : [];
      return res.status(200).json({
        ok: true,
        list: list.map((m) => ({
          id: str(m.mail_id, 20), from: str(m.mail_from, 120), subject: str(m.mail_subject, 200) || "(tanpa subjek)",
          excerpt: str(m.mail_excerpt, 200), date: str(m.mail_date, 40),
        })),
      });
    }

    if (action === "read") {
      const sid = str(req.query.sid, 80), id = str(req.query.id, 20);
      if (!sid || !id) return res.status(400).json({ error: "Data tidak lengkap." });
      const d = await call({ f: "fetch_email", sid_token: sid, email_id: id });
      if (!d) return res.status(404).json({ error: "Pesan tidak ditemukan." });
      return res.status(200).json({
        ok: true,
        subject: str(d.mail_subject, 200) || "(tanpa subjek)", from: str(d.mail_from, 120), date: str(d.mail_date, 40),
        text: stripHtml(d.mail_body).slice(0, 20000),
      });
    }

    return res.status(400).json({ error: "Aksi tidak dikenal." });
  } catch (e) {
    res.status(502).json({ error: "Gagal menghubungi layanan email sementara. Coba lagi sebentar." });
  }
};

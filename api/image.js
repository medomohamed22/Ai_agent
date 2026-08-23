export default async function handler(req, res) {
  try {
    if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
    const url = req.query.url;
    if (!url) return res.status(400).json({ error: "url is required" });

    let u;
    try { u = new URL(url); }
    catch { return res.status(400).json({ error: "Invalid image URL" }); }

    if (!["http:", "https:"].includes(u.protocol)) {
      return res.status(400).json({ error: "Only http/https image URLs are allowed" });
    }

    const upstream = await fetch(u.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; AdPromptAI/1.0)",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
      },
      redirect: "follow"
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({ error: `Image upstream HTTP ${upstream.status}` });
    }

    const ct = upstream.headers.get("content-type") || "application/octet-stream";
    if (!ct.startsWith("image/")) {
      return res.status(415).json({ error: `Upstream is not an image (${ct})` });
    }

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}

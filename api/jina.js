function extractImage(md = "") {
  const m = md.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/i);
  if (m) return m[1];
  const u = md.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpe?g|webp)(?:\?[^\s"'<>]*)?/i);
  return u ? u[0] : "";
}
function extractTitle(md = "") {
  const h = md.match(/^#\s+(.+)$/m);
  if (h) return h[1].trim();
  const t = md.match(/^Title:\s*(.+)$/mi);
  return t ? t[1].trim() : "";
}
function parseSearchJSON(j) {
  const data = j?.data ?? j;
  const arr = Array.isArray(data) ? data : (data?.results || data?.items || []);
  return arr.map(x => ({
    title: x.title || "",
    url: x.url || x.link || "",
    text: x.content || x.text || x.description || "",
    image: x.image || x.image_url || x.thumbnail || ""
  }));
}

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const key = req.headers["x-client-jina-key"];
    if (!key) return res.status(400).json({ error: "Missing Jina API key" });

    const { action, url } = req.body || {};
    const headers = {
      "Authorization": `Bearer ${key}`,
      "Accept": action === "reader" ? "text/plain" : "application/json"
    };

    if (action === "test") {
      const upstream = await fetch("https://s.jina.ai/?q=OpenAI", {
        headers: { ...headers, "Accept": "application/json" }
      });
      const raw = await upstream.text();
      if (!upstream.ok) {
        res.status(upstream.status);
        return res.send(raw);
      }
      return res.status(200).json({ ok: true });
    }

    if (action === "reader") {
      if (!url) return res.status(400).json({ error: "url is required" });
      const upstream = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          ...headers,
          "X-Return-Format": "markdown",
          "X-With-Images-Summary": "true",
          "X-With-Links-Summary": "true"
        }
      });
      const raw = await upstream.text();
      if (!upstream.ok) {
        res.status(upstream.status);
        return res.send(raw);
      }
      return res.status(200).json({
        title: extractTitle(raw),
        text: raw,
        image: extractImage(raw),
        url
      });
    }

    if (action === "search") {
      if (!url) return res.status(400).json({ error: "url is required" });
      const u = new URL(url);
      const q = encodeURIComponent(`site:${u.hostname} exact product details features specifications materials colors appearance brand ${url}`);
      const upstream = await fetch(`https://s.jina.ai/?q=${q}`, {
        headers: { ...headers, "Accept": "application/json" }
      });
      const raw = await upstream.text();
      if (!upstream.ok) {
        res.status(upstream.status);
        return res.send(raw);
      }
      let results = [];
      try { results = parseSearchJSON(JSON.parse(raw)); }
      catch {
        results = [{ title: extractTitle(raw) || "Jina Search result", url, text: raw, image: extractImage(raw) }];
      }
      return res.status(200).json({ results });
    }

    return res.status(400).json({ error: "Invalid Jina action" });
  } catch (e) {
    return res.status(500).json({ error: { message: e?.message || String(e) } });
  }
}

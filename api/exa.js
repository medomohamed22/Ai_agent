export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const key = req.headers["x-client-exa-key"];
    if (!key) return res.status(400).json({ error: "Missing Exa API key" });

    const { endpoint, body } = req.body || {};
    if (!["search", "contents"].includes(endpoint)) return res.status(400).json({ error: "Invalid Exa endpoint" });

    const upstream = await fetch(`https://api.exa.ai/${endpoint}`, {
      method: "POST",
      headers: {
        "x-api-key": key,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(body || {})
    });

    const raw = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    return res.send(raw);
  } catch (e) {
    return res.status(500).json({ error: { message: e?.message || String(e) } });
  }
}

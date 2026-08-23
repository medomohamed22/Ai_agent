export default async function handler(req, res) {
  try {
    const action = req.method === "GET" ? (req.query.action || "models") : (req.body?.action || "chat");

    if (action === "models") {
      const upstream = await fetch("https://opencode.ai/inference/openai/v1/models", {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Cache-Control": "no-cache"
        },
        cache: "no-store"
      });
      const raw = await upstream.text();
      res.status(upstream.status);
      res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
      return res.send(raw);
    }

    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const { model, messages, temperature = 0.55 } = req.body || {};
    if (!model || !Array.isArray(messages)) return res.status(400).json({ error: "model and messages are required" });

    const upstream = await fetch("https://opencode.ai/inference/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ model, messages, temperature })
    });

    const raw = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    return res.send(raw);
  } catch (e) {
    return res.status(500).json({ error: { message: e?.message || String(e) } });
  }
}

const EXA_SEARCH_URL = "https://api.exa.ai/search";
const EXA_CONTENTS_URL = "https://api.exa.ai/contents";

function send(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(payload));
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Allow", "POST, OPTIONS");
    return res.end();
  }
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST, OPTIONS");
    return send(res, 405, { error: "Method not allowed" });
  }

  const keyHeader = req.headers["x-exa-key"];
  const apiKey = Array.isArray(keyHeader) ? keyHeader[0] : keyHeader;
  if (!apiKey || typeof apiKey !== "string" || apiKey.length > 500) {
    return send(res, 401, { error: "Missing Exa API key" });
  }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); }
    catch { return send(res, 400, { error: "Invalid JSON body" }); }
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return send(res, 400, { error: "Invalid request body" });
  }

  const mode = body.mode === "contents" ? "contents" : "search";
  let upstreamUrl, allowed;

  if (mode === "contents") {
    upstreamUrl = EXA_CONTENTS_URL;
    const urls = Array.isArray(body.urls) ? body.urls : [];
    if (urls.length !== 1 || typeof urls[0] !== "string" || urls[0].length > 2048) {
      return send(res, 400, { error: "Exactly one URL is required" });
    }
    let parsed;
    try { parsed = new URL(urls[0]); }
    catch { return send(res, 400, { error: "Invalid URL" }); }
    if (!/^https?:$/.test(parsed.protocol)) return send(res, 400, { error: "Only http/https URLs are allowed" });

    allowed = {
      urls: [parsed.href],
      text: body.text ?? true,
      highlights: body.highlights ?? true,
      summary: body.summary,
      maxAgeHours: body.maxAgeHours ?? 0,
    };
    Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
  } else {
    upstreamUrl = EXA_SEARCH_URL;
    allowed = {
      query: body.query,
      type: body.type,
      numResults: body.numResults,
      includeDomains: body.includeDomains,
      excludeDomains: body.excludeDomains,
      contents: body.contents,
      category: body.category,
      startPublishedDate: body.startPublishedDate,
      endPublishedDate: body.endPublishedDate,
      startCrawlDate: body.startCrawlDate,
      endCrawlDate: body.endCrawlDate,
      userLocation: body.userLocation,
    };
    Object.keys(allowed).forEach((k) => allowed[k] === undefined && delete allowed[k]);
    if (typeof allowed.query !== "string" || !allowed.query.trim() || allowed.query.length > 5000) {
      return send(res, 400, { error: "Invalid search query" });
    }
    if (allowed.numResults != null) {
      const n = Number(allowed.numResults);
      if (!Number.isFinite(n) || n < 1 || n > 20) return send(res, 400, { error: "numResults must be between 1 and 20" });
      allowed.numResults = Math.floor(n);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const upstream = await fetch(upstreamUrl, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify(allowed),
      signal: controller.signal,
    });

    const text = await upstream.text();
    res.statusCode = upstream.status;
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.end(text);
  } catch (error) {
    if (error?.name === "AbortError") return send(res, 504, { error: "Exa request timed out" });
    return send(res, 502, { error: "Unable to reach Exa" });
  } finally {
    clearTimeout(timer);
  }
}

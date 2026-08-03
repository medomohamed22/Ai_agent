import { baseUrl, json, randomString, seal, setCookie, sha256 } from './_lib.js';

export default async function handler(req, res) {
  try {
    const provider = req.query?.provider;
    if (!['vercel', 'supabase'].includes(provider)) return json(res, 400, { error: 'مزود غير مدعوم' });
    const state = randomString(24);
    const verifier = randomString(48);
    setCookie(res, 'oauth_state', seal({ provider, state, verifier, createdAt: Date.now() }), 600);
    const redirectUri = `${baseUrl(req)}/api/oauth-callback?provider=${provider}`;

    if (provider === 'supabase') {
      if (!process.env.SUPABASE_CLIENT_ID) return json(res, 400, { error: 'أضف SUPABASE_CLIENT_ID أولًا' });
      const params = new URLSearchParams({
        client_id: process.env.SUPABASE_CLIENT_ID,
        redirect_uri: redirectUri,
        response_type: 'code', state,
        code_challenge: sha256(verifier), code_challenge_method: 'S256'
      });
      res.writeHead(302, { Location: `https://api.supabase.com/v1/oauth/authorize?${params}` });
      return res.end();
    }

    const slug = process.env.VERCEL_INTEGRATION_SLUG;
    if (!slug) return json(res, 400, { error: 'أضف VERCEL_INTEGRATION_SLUG أولًا' });
    const params = new URLSearchParams({ state, next: redirectUri });
    res.writeHead(302, { Location: `https://vercel.com/integrations/${encodeURIComponent(slug)}/new?${params}` });
    res.end();
  } catch (error) { json(res, 500, { error: error.message }); }
}

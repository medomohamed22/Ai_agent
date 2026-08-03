import { baseUrl, clearCookie, cookie, getConnections, json, saveConnections, unseal } from './_lib.js';

export default async function handler(req, res) {
  try {
    const provider = req.query?.provider;
    const code = req.query?.code;
    const returnedState = req.query?.state;
    const stored = unseal(cookie(req, 'oauth_state') || '');
    if (!code || stored.provider !== provider || stored.state !== returnedState || Date.now() - stored.createdAt > 600000) {
      throw new Error('طلب OAuth غير صالح أو انتهت صلاحيته');
    }
    const redirectUri = `${baseUrl(req)}/api/oauth-callback?provider=${provider}`;
    const connections = getConnections(req);

    if (provider === 'supabase') {
      const basic = Buffer.from(`${process.env.SUPABASE_CLIENT_ID}:${process.env.SUPABASE_CLIENT_SECRET}`).toString('base64');
      const response = await fetch('https://api.supabase.com/v1/oauth/token', {
        method: 'POST',
        headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, code_verifier: stored.verifier })
      });
      const tokens = await response.json();
      if (!response.ok) throw new Error(tokens.message || tokens.error_description || 'فشل ربط Supabase');
      connections.supabase = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token, connectedAt: Date.now() };
    } else {
      const response = await fetch('https://api.vercel.com/v2/oauth/access_token', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: process.env.VERCEL_CLIENT_ID, client_secret: process.env.VERCEL_CLIENT_SECRET, code, redirect_uri: redirectUri })
      });
      const tokens = await response.json();
      if (!response.ok) throw new Error(tokens.error?.message || tokens.message || 'فشل ربط Vercel');
      connections.vercel = { accessToken: tokens.access_token, teamId: tokens.team_id || null, userId: tokens.user_id || null, connectedAt: Date.now() };
    }

    saveConnections(res, connections);
    clearCookie(res, 'oauth_state');
    res.writeHead(302, { Location: `/?connected=${provider}` });
    res.end();
  } catch (error) {
    res.writeHead(302, { Location: `/?oauth_error=${encodeURIComponent(error.message)}` });
    res.end();
  }
}

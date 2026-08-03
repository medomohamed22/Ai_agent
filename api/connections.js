import { getConnections, json, vercelFetch, supabaseFetch } from './_lib.js';

export default async function handler(req, res) {
  try {
    const c = getConnections(req);
    const result = { vercel: false, supabase: false };
    if (c.vercel?.accessToken) {
      try { const u = await vercelFetch('/v2/user', c.vercel.accessToken); result.vercel = true; result.vercelUser = u.user?.username || u.user?.name || 'Connected'; } catch {}
    }
    if (c.supabase?.accessToken) {
      try { const orgs = await supabaseFetch('/v1/organizations', c.supabase.accessToken); result.supabase = true; result.supabaseOrganizations = Array.isArray(orgs) ? orgs.map(o => ({ id: o.id, name: o.name, slug: o.slug })) : []; } catch {}
    }
    json(res, 200, result);
  } catch (error) { json(res, 500, { error: error.message }); }
}

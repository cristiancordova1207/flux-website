/**
 * GET /api/detect?url=…  — Cloudflare Pages Function. Public preview of a video link (title, author, thumbnail).
 *
 * - Only reads PUBLIC metadata from each platform's official oEmbed endpoint. It never downloads media and never
 *   fetches the URL the visitor typed: that URL is only passed as a parameter to a fixed, allow-listed endpoint
 *   (no SSRF). No credentials, no cookies, nothing stored.
 * - Platforms without a public oEmbed (Instagram, Facebook, Twitch) are recognized but get no preview.
 * - Responses are cached for 1 h per URL (Cache API) and limited per IP in this isolate (best effort).
 */
const PLATFORMS = [
  { id: 'youtube', name: 'YouTube', hosts: ['youtube.com', 'youtu.be', 'youtube-nocookie.com'], oembed: (u) => `https://www.youtube.com/oembed?format=json&url=${u}` },
  { id: 'vimeo', name: 'Vimeo', hosts: ['vimeo.com'], oembed: (u) => `https://vimeo.com/api/oembed.json?url=${u}` },
  { id: 'tiktok', name: 'TikTok', hosts: ['tiktok.com'], oembed: (u) => `https://www.tiktok.com/oembed?url=${u}` },
  { id: 'soundcloud', name: 'SoundCloud', hosts: ['soundcloud.com'], oembed: (u) => `https://soundcloud.com/oembed?format=json&url=${u}` },
  { id: 'dailymotion', name: 'Dailymotion', hosts: ['dailymotion.com', 'dai.ly'], oembed: (u) => `https://www.dailymotion.com/services/oembed?format=json&url=${u}` },
  { id: 'x', name: 'X (Twitter)', hosts: ['x.com', 'twitter.com'], oembed: (u) => `https://publish.twitter.com/oembed?omit_script=1&url=${u}` },
  { id: 'reddit', name: 'Reddit', hosts: ['reddit.com', 'redd.it'], oembed: (u) => `https://www.reddit.com/oembed?url=${u}` },
  { id: 'instagram', name: 'Instagram', hosts: ['instagram.com'] },
  { id: 'facebook', name: 'Facebook', hosts: ['facebook.com', 'fb.watch'] },
  { id: 'twitch', name: 'Twitch', hosts: ['twitch.tv'] },
];
const PRIVATE = /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[)/i;
const LIMIT = 20, WINDOW_MS = 60_000; // per IP and isolate; a Cloudflare rate-limiting rule is the real limit
const hits = new Map();

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
});
const clean = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : null);
const httpsUrl = (s) => { try { const u = new URL(s); return u.protocol === 'https:' ? u.href : null; } catch { return null; } };

export async function onRequestGet({ request }) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (h.length >= LIMIT) return json(429, { error: 'Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.' }, { 'Retry-After': '60' });
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();

  const raw = new URL(request.url).searchParams.get('url') || '';
  if (raw.length > 2048) return json(400, { error: 'El enlace es demasiado largo.' });
  let target;
  try { target = new URL(raw.trim()); } catch { return json(400, { error: 'El enlace no es válido.' }); }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || PRIVATE.test(target.hostname)) return json(400, { error: 'El enlace no es válido.' });
  const host = target.hostname.toLowerCase();
  const p = PLATFORMS.find((x) => x.hosts.some((d) => host === d || host.endsWith(`.${d}`)));
  if (!p) return json(422, { error: 'Esta web solo muestra vista previa de plataformas conocidas. FLUX puede intentarlo con este enlace desde la aplicación.', platform: null });
  const base = { platform: { id: p.id, name: p.name }, url: target.href };
  if (!p.oembed) return json(200, { ...base, preview: false, message: `${p.name} no ofrece una vista previa pública. Puedes analizar el enlace en FLUX.` });

  const cache = caches.default;
  const key = new Request(`https://flux-detect.cache/${p.id}?u=${encodeURIComponent(target.href)}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  let res;
  try { res = await fetch(p.oembed(encodeURIComponent(target.href)), { headers: { Accept: 'application/json', 'User-Agent': 'FLUX-website-preview/1.0' }, signal: AbortSignal.timeout(6000), cf: { cacheTtl: 3600 } }); }
  catch { return json(502, { error: `No se pudo contactar con ${p.name}. Inténtalo de nuevo más tarde.` }); }
  if ([400, 401, 403, 404].includes(res.status)) return json(404, { ...base, error: 'No se encontró un video público en este enlace (puede ser privado, estar eliminado o no estar disponible).' });
  if (!res.ok) return json(502, { error: `${p.name} no respondió correctamente. Inténtalo de nuevo más tarde.` });
  let o;
  try { o = await res.json(); } catch { return json(502, { error: `${p.name} devolvió una respuesta no válida.` }); }

  const out = json(200, {
    ...base, preview: true,
    title: clean(o.title, 300), author: clean(o.author_name, 120),
    thumbnail: httpsUrl(o.thumbnail_url), provider: clean(o.provider_name, 60) || p.name,
  }, { 'Cache-Control': 'public, max-age=3600' });
  await cache.put(key, out.clone());
  return out;
}

export const onRequest = () => json(405, { error: 'Método no permitido' }, { Allow: 'GET' });

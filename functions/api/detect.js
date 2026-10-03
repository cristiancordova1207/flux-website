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
const MSG = {
  empty: 'Introduce una URL de vídeo.',
  invalid: 'Introduce una URL válida.',
  unsupported: 'Esta plataforma no es compatible.',
  notFound: 'No se encontró un vídeo público con este enlace.',
  noMeta: 'No fue posible obtener información pública de este vídeo.',
  busy: 'Demasiadas solicitudes. Espera un minuto e inténtalo de nuevo.',
};

const json = (status, body, extra = {}) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra },
});
const clean = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : null);
const httpsUrl = (s) => { try { const u = new URL(s); return u.protocol === 'https:' ? u.href : null; } catch { return null; } };

export async function onRequestGet({ request }) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const now = Date.now(), h = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  if (h.length >= LIMIT) return json(429, { error: MSG.busy }, { 'Retry-After': '60' });
  h.push(now); hits.set(ip, h);
  if (hits.size > 5000) hits.clear();

  const raw = (new URL(request.url).searchParams.get('url') || '').trim();
  if (!raw) return json(400, { error: MSG.empty });
  if (raw.length > 2048) return json(400, { error: MSG.invalid });
  let target;
  try { target = new URL(raw); } catch { return json(400, { error: MSG.invalid }); }
  if (!['http:', 'https:'].includes(target.protocol) || target.username || target.password || PRIVATE.test(target.hostname) || !target.hostname.includes('.')) return json(400, { error: MSG.invalid });
  const host = target.hostname.toLowerCase();
  const p = PLATFORMS.find((x) => x.hosts.some((d) => host === d || host.endsWith(`.${d}`)));
  if (!p) return json(422, { error: MSG.unsupported, platform: null });
  const base = { platform: { id: p.id, name: p.name }, url: target.href };
  if (!p.oembed) return json(200, { ...base, preview: false, message: 'Sin vista previa pública' });

  const cache = caches.default;
  const key = new Request(`https://flux-detect.cache/v2/${p.id}?u=${encodeURIComponent(target.href)}`);
  const hit = await cache.match(key);
  if (hit) return hit;

  let res;
  try { res = await fetch(p.oembed(encodeURIComponent(target.href)), { headers: { Accept: 'application/json', 'User-Agent': 'FLUX-website-preview/1.0' }, signal: AbortSignal.timeout(6000), cf: { cacheTtl: 3600 } }); }
  catch (e) { console.error(`[detect] ${p.id}: ${e.name}`); return json(502, { ...base, error: MSG.noMeta }); }
  // Technical details stay in the Pages Function log; the visitor gets a plain message.
  if ([400, 404].includes(res.status)) return json(404, { ...base, error: MSG.notFound });
  if (!res.ok) { console.error(`[detect] ${p.id}: oEmbed ${res.status}`); return json(502, { ...base, error: MSG.noMeta }); }
  let o;
  try { o = await res.json(); } catch { console.error(`[detect] ${p.id}: JSON no válido`); return json(502, { ...base, error: MSG.noMeta }); }

  const out = json(200, {
    ...base, preview: true, video: o.type === 'video',
    title: clean(o.title, 300), author: clean(o.author_name, 120),
    thumbnail: httpsUrl(o.thumbnail_url), provider: clean(o.provider_name, 60) || p.name,
  }, { 'Cache-Control': 'public, max-age=3600' });
  await cache.put(key, out.clone());
  return out;
}

export const onRequest = () => json(405, { error: 'Método no permitido' }, { Allow: 'GET' });

/** Test-only entrypoint: serve the existing Vite build and the read-only API. */
import api, {RateGate, SourceCache} from './worker.mjs';
import page from './preview.html';
import script from './preview-js.txt';
import stylesheet from './preview-css.txt';

export {RateGate, SourceCache};

const scriptPath = page.match(/<script\b[^>]*\bsrc="(\.\/assets\/[^"]+\.js)"/i)?.[1];
const stylePath = page.match(/<link\b[^>]*\bhref="(\.\/assets\/[^"]+\.css)"/i)?.[1];
if (!scriptPath || !stylePath) throw new Error('Invalid preview assets');
const paths = new Map([
  ['/', {body: page, contentType: 'text/html; charset=utf-8'}],
  [`/${scriptPath.slice(2)}`, {body: script, contentType: 'text/javascript; charset=utf-8'}],
  [`/${stylePath.slice(2)}`, {body: stylesheet, contentType: 'text/css; charset=utf-8'}],
]);

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/vnau/') || url.pathname.startsWith('/api/notifications/') || url.pathname === '/healthz') return api.fetch(request, env, ctx);
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405});
    const asset = paths.get(url.pathname);
    if (!asset) return new Response('Not found', {status: 404});
    return new Response(request.method === 'HEAD' ? null : asset.body, {headers: {
      'Content-Type': asset.contentType,
      'Cache-Control': url.pathname === '/' ? 'no-store' : 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
    }});
  },
  scheduled(event, env, ctx) {return api.scheduled(event, env, ctx)}
};

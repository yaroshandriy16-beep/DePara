/** Package the existing Vite build for a review-only Worker; never deploys it. */
import {copyFile, mkdir, readFile, readdir, writeFile} from 'node:fs/promises';
import path from 'node:path';

const configured = process.env.VITE_VNAU_API_ORIGIN;
let origin;
try {origin = new URL(configured || '')} catch {throw new Error('Set VITE_VNAU_API_ORIGIN to the public HTTPS test server origin.')}
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('VITE_VNAU_API_ORIGIN must be an HTTPS origin, without credentials or a path.');
const root = process.cwd(), dist = path.join(root, 'dist'), out = path.join(root, 'out', 'cloudflare-preview');
const page = await readFile(path.join(dist, 'index.html'), 'utf8');
const script = page.match(/<script\b[^>]*\bsrc="(\.\/assets\/[^"]+\.js)"/i)?.[1];
const style = page.match(/<link\b[^>]*\bhref="(\.\/assets\/[^"]+\.css)"/i)?.[1];
const assets = await readdir(path.join(dist, 'assets'));
if (!script || !style || assets.length !== 2 || !assets.includes(path.basename(script)) || !assets.includes(path.basename(style))) throw new Error('Unexpected build assets; update the preview packager before deploying.');
await mkdir(out, {recursive: true});
await writeFile(path.join(out, 'preview.html'), page);
await copyFile(path.join(dist, script), path.join(out, 'preview-js.txt'));
await copyFile(path.join(dist, style), path.join(out, 'preview-css.txt'));
for (const name of ['preview.mjs', 'worker.mjs', 'upstream.mjs', 'forms.mjs', 'matrix.mjs']) await copyFile(path.join(root, 'integrations', 'vnau', 'cloudflare', name), path.join(out, name));
// Reviewed deployment metadata only: preparing this file does not upload it.
// Migrations are for a new test Worker and must not be reused to overwrite an existing Worker.
const metadata = {
  main_module: 'preview.mjs',
  compatibility_date: '2026-11-04',
  bindings: [
    {type: 'durable_object_namespace', name: 'MKR_CACHE', class_name: 'SourceCache'},
    {type: 'durable_object_namespace', name: 'MKR_GATE', class_name: 'RateGate'},
  ],
  migrations: {new_tag: 'v1', new_sqlite_classes: ['SourceCache', 'RateGate']},
  observability: {
    enabled: true, redact_query_string: true,
    logs: {enabled: true, invocation_logs: true, head_sampling_rate: 0.1},
    traces: {enabled: true, head_sampling_rate: 0.1},
  },
};
await writeFile(path.join(out, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`);
console.log(`Prepared Cloudflare test preview for ${origin.origin} in out/cloudflare-preview/`);

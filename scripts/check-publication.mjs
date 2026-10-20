import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../', import.meta.url));
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const base = new URL('https://daponteautomotores.com.ar/');
const head = git('rev-parse', 'HEAD');
const files = git('ls-files').split('\n').filter(p =>
  !/^(tests|scripts|\.github)\//.test(p) && /\.(html|css|m?js|json)$/.test(p) && p !== 'package.json');
const expected = new Map(await Promise.all(files.map(async p => [p, (await fs.readFile(path.join(root, p), 'utf8')).replaceAll('\r\n', '\n')])));
const stock = JSON.parse(expected.get('cars.json')), content = JSON.parse(expected.get('site-content.json'));
const localPath = p => p?.startsWith('/catalogo-dpa/') ? p.slice('/catalogo-dpa/'.length) : null;
const imagePaths = new Set([
  ...stock.vehiculos.filter(v => ['activo','reservado','reingreso'].includes(v.estadoInventario)).map(v => localPath(v.imagenes[0])),
  localPath(content.teamImage), ...content.flyers.map(f => localPath(f.image)),
  ...[...expected.get('index.html').matchAll(/src="(imagenes\/[^"?]+)"/g)].map(m => m[1]),
].filter(Boolean));
// Every newly uploaded photo is checked, including secondary photos, not only covers.
if (process.env.BEFORE_SHA && !/^0+$/.test(process.env.BEFORE_SHA)) {
  for (const p of git('diff', '--name-only', '--diff-filter=AM', process.env.BEFORE_SHA, head).split('\n')) {
    if (/\.(jpe?g|png|webp)$/i.test(p)) imagePaths.add(p);
  }
}
const failures = [];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function check() {
  for (const [p, text] of expected) {
    const url = new URL(p, base); url.searchParams.set('verify', head);
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    assert.equal(response.status, 200, `${p}: HTTP ${response.status}`);
    assert.equal((await response.text()).replaceAll('\r\n', '\n'), text, `${p}: el sitio sirve una versión diferente de ${head.slice(0,7)}`);
  }
  const images = [...imagePaths];
  for (let i = 0; i < images.length; i += 6) {
    await Promise.all(images.slice(i, i + 6).map(async p => {
      await fs.access(path.join(root, p));
      const response = await fetch(new URL(p, base), { method:'HEAD', cache:'no-store', signal:AbortSignal.timeout(10000) });
      assert(response.ok && response.headers.get('content-type')?.startsWith('image/'), `Foto sin publicar: ${p} (HTTP ${response.status})`);
    }));
  }
}

const started = Date.now();
let confirmed = false;
do {
  // A new push owns the next verification. Never compare the live site to an obsolete commit.
  const current = git('ls-remote', 'origin', 'refs/heads/main').split(/\s/)[0];
  if (current !== head) {
    console.log(`Comprobación reemplazada por el commit más reciente ${current}. Su ejecución comprobará la publicación.`);
    process.exit(0);
  }
  try { await check(); confirmed = true; break; }
  catch (e) { failures.push(e.message.split('\n')[0]); console.log(`Pendiente: ${failures.at(-1)}`); }
  if (Date.now() - started >= 15 * 60000) break;
  await sleep(15000);
} while (true);
assert(confirmed, `PUBLICACIÓN FALLIDA tras 15 minutos: ${failures.at(-1)}`);

// Verify the actual rendered catalog, not just a successful Pages deployment or JSON response.
const { chromium } = await import('playwright');
const browser = await chromium.launch({ headless:true });
await fs.mkdir('publication-artifacts', {recursive:true});
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base.href, {waitUntil:'networkidle',timeout:45000});
  const visible = stock.vehiculos.filter(v => ['activo','reservado','reingreso'].includes(v.estadoInventario));
  const ids = values => values.map(Number).sort((a,b)=>a-b);
  await page.waitForFunction(count => document.querySelectorAll('#catalogoContenido [data-vehicle-id]').length === count, visible.length);
  assert.deepEqual(ids(await page.locator('#catalogoContenido [data-vehicle-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.vehicleId))), ids(visible.map(v=>v.id)));
  assert.deepEqual(ids(await page.locator('#recentTrack [data-vehicle-id]').evaluateAll(nodes=>nodes.map(n=>n.dataset.vehicleId))), ids(visible.filter(v=>v.recienLlegado === true).map(v=>v.id)));
  assert.equal(await page.locator('#dpa-flyers .dpa-flyer').count(), content.flyers.length);
  assert.equal(await page.locator('#dpa-taller .dpa-workshop-gallery img').count(), 3);
  assert((await page.locator('#dpa-hours-title').textContent()).includes('HORARIOS'));
  if (visible.length) {
    await page.locator(`#catalogoContenido [data-vehicle-id="${visible.at(-1).id}"] .ficha`).click();
    await page.locator('#modal.activo').waitFor();
    assert.equal(await page.locator('#modalModelo').textContent(),visible.at(-1).modelo);
    await page.locator('#cerrar').click();
  }
  assert.deepEqual(errors, [], 'Errores de JavaScript en el catálogo público');
  await page.screenshot({path:'publication-artifacts/catalogo.png',fullPage:true});
  console.log(`PUBLICACIÓN COMPROBADA ${head}: ${files.length} archivos, ${imagesCount()} fotos, ${visible.length} vehículos y ${content.flyers.length} flyers; catálogo renderizado sin errores.`);
  function imagesCount() { return imagePaths.size; }
} finally { await browser.close(); }

import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOperation, migrate, monthly, monthOf, validateInventory, visible } from '../admin/inventory.mjs';
import { InventoryStore, encodeText, decodeText } from '../admin/github.mjs';
import { authenticate } from '../admin/auth.mjs';
const baseline = migrate({ vehiculos: Array.from({ length: 63 }, (_, i) => ({ id: i + 1, marca: 'FORD', modelo: `Prueba ${i + 1}`, tipo: 'Hatch', anio: 2020, condicion: 'usado', imagenes: ['/catalogo-dpa/imagenes/vehiculos/prueba.jpg'], kilometros: 1000 })) });
const edit = (db, patch, id = crypto.randomUUID(), at = '2026-09-15T15:00:00.000Z') => applyOperation(db, { id, action: 'guardar', vehiculoId: 1, patch }, at);

test('baseline preserves 63 permanent IDs and starts without invented dates or events', () => {
  validateInventory(baseline); assert.equal(baseline.vehiculos.length, 63); assert.equal(baseline.movimientos.length, 0);
  assert.equal(new Set(baseline.vehiculos.map(v => v.id)).size, 63);
  assert(baseline.vehiculos.every(v => visible(v) && v.fechaAlta === null && v.fechaBaja === null && v.fechaReingreso === null && v.fechaUltimaModificacion === null));
  assert.deepEqual(migrate(baseline), baseline);
});
test('repeated sale and reentry preserve identity, photos and every movement', () => {
  let db = edit(baseline, { estadoInventario: 'vendido' }); assert(!visible(db.vehiculos[0]));
  db = edit(db, { estadoInventario: 'reingreso', kilometros: 125000 }); assert(visible(db.vehiculos[0]));
  db = edit(db, { estadoInventario: 'archivado' });
  db = edit(db, { estadoInventario: 'reingreso' });
  assert.equal(db.vehiculos[0].id, 1); assert.deepEqual(db.vehiculos[0].imagenes, baseline.vehiculos[0].imagenes);
  assert.deepEqual(monthly(db, '2026-09').counts, { alta: 0, baja: 2, reingreso: 2, modificacion: 0 });
  assert.equal(db.vehiculos[0].fechaAlta, null); assert(db.vehiculos[0].fechaBaja && db.vehiculos[0].fechaReingreso);
  assert.deepEqual(baseline.movimientos, []);
});
test('upcoming creation is one alta; activation is one modification; IDs never reused', () => {
  let db = applyOperation(baseline, { id: 'new-1', action: 'crear', patch: { marca: 'FORD', modelo: 'Ranger', tipo: 'Pick-Up', anio: 2026, condicion: '0km', estadoInventario: 'proximo_ingreso' } });
  const car = db.vehiculos.at(-1); assert.equal(car.id, 64); assert(!visible(car)); assert(car.fechaAlta);
  db = applyOperation(db, { id: 'activate-1', action: 'guardar', vehiculoId: 64, patch: { estadoInventario: 'activo' } });
  assert(visible(db.vehiculos.at(-1))); assert.equal(db.movimientos[1].tipo, 'modificacion'); assert.equal(db.nextId, 65);
});
test('no-op and retry do not count; simultaneous data plus status is a single movement', () => {
  assert.deepEqual(edit(baseline, { modelo: baseline.vehiculos[0].modelo }), baseline);
  const db = edit(baseline, { estadoInventario: 'vendido', precio: 'Consultar' }, 'stable-id');
  assert.equal(db.movimientos.length, 1); assert.equal(db.movimientos[0].tipo, 'baja');
  assert.deepEqual(edit(db, { estadoInventario: 'vendido', precio: 'Consultar' }, 'stable-id'), db);
  assert.deepEqual(db.movimientos[0].campos, ['precio','estadoInventario']);
});
test('invalid transitions, deletion, ID/date edits and bad input are rejected', () => {
  for (const patch of [{ id: 999 }, { fechaAlta: '2020-01-01' }, { estadoInventario: 'typo' }, { kilometros: -1 }, { imagenes: ['javascript:alert(1)'] }]) assert.throws(() => edit(baseline, patch));
  const sold = edit(baseline, { estadoInventario: 'vendido' });
  assert.throws(() => edit(sold, { estadoInventario: 'activo' }));
  assert.throws(() => applyOperation(baseline, { id: 'x', action: 'borrar', vehiculoId: 1 }));
  assert.throws(() => edit(baseline, { estadoInventario: 'proximo_ingreso' }));
});
test('sold to archived is not a second baja; photo edits count as modification', () => {
  let db = edit(baseline, { estadoInventario: 'vendido' }); db = edit(db, { estadoInventario: 'archivado' });
  db = edit(db, { imagenes: [...db.vehiculos[0].imagenes, '/catalogo-dpa/imagenes/vehiculos/test.jpg'] });
  assert.deepEqual(monthly(db, '2026-09').counts, { alta: 0, baja: 1, reingreso: 0, modificacion: 2 });
});
test('Argentina month boundaries and empty months', () => {
  assert.equal(monthOf('2026-10-01T02:59:59Z'), '2026-09'); assert.equal(monthOf('2026-10-01T03:00:00Z'), '2026-10');
  assert.equal(monthOf('2027-01-01T02:00:00Z'), '2026-12');
  assert.deepEqual(monthly(baseline, '2026-01').counts, { alta: 0, baja: 0, reingreso: 0, modificacion: 0 });
});
test('unknown legacy fields survive; root array migration is supported', () => {
  const source = [{ ...baseline.vehiculos[0], custom: { useful: true } }];
  for (const key of ['estadoInventario','fechaAlta','fechaBaja','fechaReingreso','fechaUltimaModificacion']) delete source[0][key];
  const imported = migrate(source); assert.deepEqual(edit(imported, { precio: 'Nuevo precio' }).vehiculos[0].custom, { useful: true });
  assert.equal(imported.movimientos.length, 0);
});

function mockGit({ conflict = false, failBlob = false, lostResponse = false } = {}) {
  let head = 'head-1', db = structuredClone(baseline), tree;
  const writes = [];
  const fetcher = async (url, options) => {
    const path = new URL(url).pathname.replace('/repos/dpacatalogodigital/catalogo-dpa', '');
    const body = options.body ? JSON.parse(options.body) : null;
    const ok = content => ({ ok: true, json: async () => content });
    if (options.method === 'GET') {
      if (path.startsWith('/git/ref/')) return ok({ object: { sha: head } });
      if (path === '/contents/cars.json') return ok({ content: encodeText(JSON.stringify(db)) });
      if (path.startsWith('/git/commits/')) return ok({ tree: { sha: 'base-tree' } });
    }
    writes.push({ path, body });
    if (path === '/git/blobs') { if (failBlob) throw new Error('Upload failed'); return ok({ sha: 'photo-blob' }); }
    if (path === '/git/trees') { tree = body; return ok({ sha: 'new-tree' }); }
    if (path === '/git/commits') { assert.deepEqual(body.parents, ['head-1']); return ok({ sha: 'head-2' }); }
    if (path.startsWith('/git/refs/')) {
      assert.equal(body.force, false);
      if (conflict) return { ok: false, status: 422 };
      head = body.sha; db = JSON.parse(tree.tree.find(e => e.path === 'cars.json').content);
      if (lostResponse) throw new Error('Response lost');
      return ok({ object: { sha: head } });
    }
    throw new Error(`Unexpected request ${path}`);
  };
  return { store: new InventoryStore('test-token', fetcher), writes, get db() { return db; } };
}
const op = { id: 'atomic-op', action: 'guardar', vehiculoId: 1, patch: { precio: 'Prueba' } };
test('data + event + photos publish atomically in one non-forced branch update', async () => {
  const git = mockGit(); const snapshot = await git.store.load();
  await git.store.save(snapshot, op, [{ path: 'imagenes/vehiculos/test.jpg', content: 'YQ==' }]);
  assert.equal(git.writes.filter(w => w.path.includes('/git/refs/')).length, 1);
  assert.equal(git.db.movimientos.length, 1); assert.equal(git.db.vehiculos[0].precio, 'Prueba');
  assert(git.writes.at(-1).path.endsWith('/codex/inventario-historial-seguro'));
  const count = git.writes.length; await git.store.save(snapshot, op); assert.equal(git.writes.length, count);
});
test('stale snapshots and racing commits never overwrite newer work', async () => {
  const git = mockGit(); const snapshot = await git.store.load();
  await assert.rejects(git.store.save({ ...snapshot, head: 'stale' }, op), /otra sesión/); assert.equal(git.writes.length, 0);
  const race = mockGit({ conflict: true }); await assert.rejects(race.store.save(await race.store.load(), op), /otra sesión/); assert.equal(race.db.movimientos.length, 0);
});
test('failed image upload cannot publish partial data or history', async () => {
  const git = mockGit({ failBlob: true });
  await assert.rejects(git.store.save(await git.store.load(), op, [{ path: 'imagenes/vehiculos/test.jpg', content: 'YQ==' }]));
  assert(!git.writes.some(w => w.path.includes('/git/refs/'))); assert.equal(git.db.movimientos.length, 0);
});
test('lost save response is recovered without duplicate events', async () => {
  const git = mockGit({ lostResponse: true }); const snapshot = await git.store.load();
  const result = await git.store.save(snapshot, op); assert.equal(result.db.movimientos.length, 1);
  await git.store.save(snapshot, op); assert.equal(git.db.movimientos.length, 1);
});
test('test panel refuses main and unauthenticated writes; UTF-8 survives encoding', async () => {
  const git = mockGit(), snapshot = await git.store.load(); git.store.config = { ...git.store.config, branch: 'main' };
  await assert.rejects(git.store.save(snapshot, op), /main/); git.store.token = '';
  await assert.rejects(git.store.save(snapshot, op), /sesión/);
  assert.equal(decodeText(encodeText('CITROËN · descripción 🚗')), 'CITROËN · descripción 🚗');
});
test('OAuth accepts only messages from the expected origin AND popup', async () => {
  let receiver, closed = false, handshake = false;
  const popup = { closed: false, close() { closed = true; }, postMessage() { handshake = true; } };
  const win = { addEventListener: (_, fn) => receiver = fn, removeEventListener() {}, setInterval: () => 1, clearInterval() {}, open: () => popup };
  const config = { authOrigin: 'https://auth.example', authEndpoint: '/auth', siteId: 'example' };
  const promise = authenticate(win, config);
  receiver({ origin: 'https://evil.example', source: popup, data: 'authorization:github:success:{"token":"wrong-secret-123"}' });
  receiver({ origin: config.authOrigin, source: {}, data: 'authorization:github:success:{"token":"wrong-secret-123"}' }); assert(!closed);
  receiver({ origin: config.authOrigin, source: popup, data: 'authorizing:github' }); assert(handshake);
  receiver({ origin: config.authOrigin, source: popup, data: 'authorization:github:success:{"token":"correct-secret-123"}' });
  assert.equal(await promise, 'correct-secret-123'); assert(closed);
});

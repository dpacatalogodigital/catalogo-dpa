import { settings } from './settings.mjs';
import { applyOperation, validateInventory } from './inventory.mjs';

export function encodeText(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
}
export function decodeText(text) {
  return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g, '')), c => c.charCodeAt(0)));
}
export class InventoryStore {
  constructor(token, fetcher = (...args) => fetch(...args), config = settings) { this.token = token; this.fetcher = fetcher; this.config = config; }
  async api(path, method = 'GET', body) {
    const response = await this.fetcher(`https://api.github.com/repos/${this.config.repository}${path}`, {
      method, cache: 'no-store', headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      if (response.status === 409 || response.status === 422) throw new Error('El inventario cambió en otra sesión. Recargá y revisá tus cambios antes de guardar.');
      if (response.status === 401 || response.status === 403) throw new Error('GitHub no autorizó la operación. Iniciá sesión con una cuenta con acceso al repositorio.');
      throw new Error(`GitHub no pudo completar la operación (${response.status}).`);
    }
    return response.json();
  }
  async load() {
    const ref = await this.api(`/git/ref/heads/${this.config.branch}`);
    const head = ref.object.sha;
    const file = await this.api(`/contents/cars.json?ref=${head}`);
    const db = validateInventory(JSON.parse(decodeText(file.content)));
    return { head, db };
  }
  async save(snapshot, operation, photos = []) {
    if (!this.token) throw new Error('Iniciá sesión para guardar.');
    if (this.config.branch === 'main') throw new Error('Esta versión de prueba no puede guardar en main.');
    const latest = await this.load();
    if (latest.db.movimientos.some(e => e.id === operation.id)) return latest;
    if (latest.head !== snapshot.head) throw new Error('El inventario cambió en otra sesión. Recargá y revisá tus cambios antes de guardar.');
    const db = applyOperation(snapshot.db, operation);
    if (db.movimientos.length === snapshot.db.movimientos.length) return snapshot;
    const commit = await this.api(`/git/commits/${snapshot.head}`);
    const tree = [{ path: 'cars.json', mode: '100644', type: 'blob', content: JSON.stringify(db, null, 2) + '\n' }];
    // Blobs remain unreachable until the single final branch update succeeds.
    for (const photo of photos) {
      if (!/^imagenes\/vehiculos\/[a-zA-Z0-9._-]+$/.test(photo.path)) throw new Error('Ruta de foto inválida.');
      const blob = await this.api('/git/blobs', 'POST', { content: photo.content, encoding: 'base64' });
      tree.push({ path: photo.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const resultTree = await this.api('/git/trees', 'POST', { base_tree: commit.tree.sha, tree });
    const nextCommit = await this.api('/git/commits', 'POST', { message: `Inventario: ${db.movimientos.at(-1).tipo} #${db.movimientos.at(-1).vehiculoId}`, tree: resultTree.sha, parents: [snapshot.head] });
    try {
      await this.api(`/git/refs/heads/${this.config.branch}`, 'PATCH', { sha: nextCommit.sha, force: false });
    } catch (error) {
      // A lost response may still have committed. Read back before reporting failure.
      const recovered = await this.load().catch(() => null);
      if (recovered?.db.movimientos.some(e => e.id === operation.id)) return recovered;
      throw error;
    }
    return { head: nextCommit.sha, db };
  }
}

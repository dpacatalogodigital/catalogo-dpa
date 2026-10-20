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
    let response;
    try { response = await this.fetcher(`https://api.github.com/repos/${this.config.repository}${path}`, {
      method, cache: 'no-store', headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }); } catch {
      throw new Error('No se recibió respuesta de GitHub. Revisá la conexión y volvé a guardar sin cambiar el formulario; se comprobará si la operación ya quedó guardada para evitar duplicados.');
    }
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      const messages = {
        401: 'La sesión de GitHub venció o fue revocada. Iniciá sesión nuevamente sin descartar el formulario.',
        403: 'GitHub rechazó el acceso: revisá permisos de escritura o límites de solicitudes. Si hay un límite temporal, esperá antes de reintentar.',
        404: 'GitHub no encuentra el repositorio, la rama o el archivo, o tu sesión no tiene acceso.',
        409: 'El inventario cambió en otra sesión. Volvé a guardar; el formulario se conserva.',
        422: 'GitHub rechazó los datos o la actualización de la rama (422).',
        413: 'Las fotos superan el tamaño admitido por GitHub. Seleccioná archivos más pequeños.',
        429: 'GitHub limitó temporalmente las solicitudes. Esperá antes de volver a guardar.',
      };
      const error = new Error(`${messages[response.status] || `GitHub no pudo completar la operación (${response.status}).`} ${detail.message || ''}`.trim());
      error.status = response.status;
      error.retryableConflict = method === 'PATCH' && path.startsWith('/git/refs/') &&
        (response.status === 409 || (response.status === 422 && /fast.forward|reference update failed/i.test(detail.message || '')));
      throw error;
    }
    return response.json();
  }
  async authorize() {
    if (!this.token) throw new Error('Iniciá sesión para guardar.');
    const repo = await this.api('');
    if (repo.permissions?.push !== true) throw new Error('Tu cuenta no tiene permiso para modificar el stock. Solicitá acceso al responsable del catálogo.');
  }
  async load() {
    const ref = await this.api(`/git/ref/heads/${this.config.branch}`);
    const head = ref.object.sha;
    const file = await this.api(`/contents/cars.json?ref=${head}`);
    const db = validateInventory(JSON.parse(decodeText(file.content)));
    return { head, db };
  }
  async save(snapshot, operation, photos = [], attempt = 0) {
    if (!this.token) throw new Error('Iniciá sesión para guardar.');
    if (this.config.branch === 'main' && !this.config.production) throw new Error('Esta versión de prueba no puede guardar en main.');
    await this.authorize();
    const latest = await this.load();
    if (latest.db.movimientos.some(e => e.id === operation.id)) return latest;
    if (latest.head !== snapshot.head && operation.action === 'guardar') {
      const before = snapshot.db.vehiculos.find(v => v.id === operation.vehiculoId);
      const current = latest.db.vehiculos.find(v => v.id === operation.vehiculoId);
      if (JSON.stringify(before) !== JSON.stringify(current)) throw new Error('Este vehículo cambió en otra sesión. Conservá una copia de tus datos y comparalos con la ficha actual antes de recargar. No se sobrescribió ningún cambio.');
    }
    // Allocate new IDs and preserve unrelated edits using the latest inventory and tree.
    const db = applyOperation(latest.db, operation);
    if (db.movimientos.length === latest.db.movimientos.length) return latest;
    const commit = await this.api(`/git/commits/${latest.head}`);
    const tree = [{ path: 'cars.json', mode: '100644', type: 'blob', content: JSON.stringify(db, null, 2) + '\n' }];
    // Blobs remain unreachable until the single final branch update succeeds.
    for (const photo of photos) {
      if (!/^imagenes\/vehiculos\/[a-zA-Z0-9._-]+$/.test(photo.path)) throw new Error('Ruta de foto inválida.');
      const blob = await this.api('/git/blobs', 'POST', { content: photo.content, encoding: 'base64' });
      tree.push({ path: photo.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const resultTree = await this.api('/git/trees', 'POST', { base_tree: commit.tree.sha, tree });
    const nextCommit = await this.api('/git/commits', 'POST', { message: `Inventario: ${db.movimientos.at(-1).tipo} #${db.movimientos.at(-1).vehiculoId}`, tree: resultTree.sha, parents: [latest.head] });
    try {
      await this.api(`/git/refs/heads/${this.config.branch}`, 'PATCH', { sha: nextCommit.sha, force: false });
    } catch (error) {
      // A lost response may still have committed. Read back before reporting failure.
      const recovered = await this.load().catch(() => null);
      if (recovered?.db.movimientos.some(e => e.id === operation.id)) return recovered;
      if (error.retryableConflict && attempt < 2) return this.save(snapshot, operation, photos, attempt + 1);
      throw error;
    }
    return { head: nextCommit.sha, db };
  }
}

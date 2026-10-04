import { decodeText } from './github.mjs';
import { validateContent } from '../content-model.mjs';
export async function loadContent(store) {
  const ref = await store.api(`/git/ref/heads/${store.config.branch}`);
  const head = ref.object.sha;
  const file = await store.api(`/contents/site-content.json?ref=${head}`);
  return { head, sha: file.sha, data: validateContent(JSON.parse(decodeText(file.content))) };
}
export async function saveContent(store, snapshot, data, uploads = []) {
  if (!store.token) throw new Error('Iniciá sesión para guardar.');
  if (store.config.branch === 'main' && !store.config.production) throw new Error('Esta vista no puede guardar en producción.');
  validateContent(data);
  await store.authorize();
  const latest = await loadContent(store);
  if (latest.sha !== snapshot.sha) throw new Error('El contenido cambió en otra sesión. Recargá antes de guardar.');
  const commit = await store.api(`/git/commits/${latest.head}`);
  const tree = [{ path: 'site-content.json', mode: '100644', type: 'blob', content: JSON.stringify(data, null, 2) + '\n' }];
  for (const upload of uploads) {
    if (!/^imagenes\/proximos\/[a-zA-Z0-9-]+\.(jpg|png|webp)$/.test(upload.path)) throw new Error('Ruta de flyer inválida.');
    const blob = await store.api('/git/blobs', 'POST', { content: upload.content, encoding: 'base64' });
    tree.push({ path: upload.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const newTree = await store.api('/git/trees', 'POST', { base_tree: commit.tree.sha, tree });
  const next = await store.api('/git/commits', 'POST', { message: 'Contenido: próximos ingresos y enlaces', tree: newTree.sha, parents: [latest.head] });
  await store.api(`/git/refs/heads/${store.config.branch}`, 'PATCH', { sha: next.sha, force: false });
  return loadContent(store);
}

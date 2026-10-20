import { waitForPublication, inventoryPublished, imagesPublished } from './publication.mjs?v=publication-20261020';

export const ACTIONS_URL = 'https://github.com/dpacatalogodigital/catalogo-dpa/actions';

// Only public catalog data is stored; never credentials. Pending checks survive navigation.
export function createPublicationStatus(output, retry, {
  kind, base = new URL('../', globalThis.location?.href), storage = globalThis.localStorage,
  verify = waitForPublication,
} = {}) {
  const key = `dpa-publication-${kind}`;
  let pending, generation = 0;
  const remember = value => { try { value ? storage?.setItem(key, JSON.stringify(value)) : storage?.removeItem(key); } catch { /* Verification still works without storage. */ } };
  const show = (text, state) => { output.textContent = text; output.dataset.state = state; };
  async function check() {
    if (!pending) return;
    const current = pending, run = ++generation;
    retry.hidden = true;
    const label = `Commit ${current.head.slice(0, 7)}. `;
    const waiting = () => { if (run === generation) show(label + 'Guardado en GitHub; publicación PENDIENTE. Comprobando datos y fotos (hasta 15 minutos por despliegue y caché). No repitas la carga.', 'pending'); };
    waiting();
    let published = false;
    try {
      published = await verify(new URL(kind === 'inventory' ? 'cars.json' : 'site-content.json', base), async (data, signal) => {
        const matches = kind === 'inventory'
          ? inventoryPublished(data, current.expected, current.operationId)
          : JSON.stringify(data) === JSON.stringify(current.expected);
        return matches && await imagesPublished(current.images || [], base, signal);
      }, { onProgress: waiting, isCurrent: () => run === generation });
    } catch { /* Never turn a committed save into a retry of the write. */ }
    if (run !== generation) return;
    show(label + (published
      ? 'PUBLICACIÓN COMPROBADA: el sitio público entrega los datos y las fotos de este cambio.'
      : 'PUBLICACIÓN NO CONFIRMADA: los datos están guardados en GitHub, pero no se pudo comprobar el sitio completo. No repitas la carga. Revisá GitHub Actions y volvé a comprobar.'), published ? 'published' : 'error');
    retry.hidden = published;
    if (published) { pending = null; remember(null); }
  }
  retry.onclick = () => void check();
  try { pending = JSON.parse(storage?.getItem(key) || 'null'); } catch { pending = null; }
  if (pending?.head && pending.expected) void check();
  return { start(record) { pending = record; remember(record); return check(); } };
}

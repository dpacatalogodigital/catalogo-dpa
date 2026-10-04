import { loadContent, saveContent } from './content-store.mjs';
import { LINK_KEYS } from '../content-model.mjs';
export function mountContentPanel({ getStore, locked, setBusy, onSaved }) {
  const $ = id => document.getElementById(id);
  let snapshot, working = false, dirty = false, externalLock = false;
  const labels = { instagram:'Instagram', facebook:'Facebook', tiktok:'TikTok', youtube:'YouTube', review:'Reseñas de Google', maps3714:'Google Maps · Sabattini 3714', maps4024:'Google Maps · Sabattini 4024' };
  const message = text => $('content-status').textContent = text;
  for (const key of LINK_KEYS) {
    const label = document.createElement('label'); label.textContent = labels[key];
    const input = document.createElement('input'); input.type = 'url'; input.name = key; input.placeholder = 'https://'; label.append(input); $('content-links').append(label);
  }
  function controls() {
    $('content-fields').disabled = working || externalLock || !getStore().token || !snapshot;
    $('content-reload').disabled = working || externalLock;
  }
  function render() {
    $('flyer-list').replaceChildren();
    for (const flyer of snapshot.data.flyers) {
      const row = document.createElement('div'); row.className = 'content-flyer';
      const img = document.createElement('img'); img.src = flyer.image; img.alt = flyer.title;
      const text = document.createElement('span'); text.textContent = flyer.title;
      const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Eliminar flyer';
      button.onclick = () => {
        if (!confirm(`¿Retirar «${flyer.title}» de Próximos ingresos?`)) return;
        run(data => { data.flyers = data.flyers.filter(f => f.id !== flyer.id); });
      };
      row.append(img, text, button); $('flyer-list').append(row);
    }
    for (const key of LINK_KEYS) $('content-links').querySelector(`[name="${key}"]`).value = snapshot.data.links[key];
    dirty = false;
  }
  async function reload() {
    if (working || locked()) return;
    if (dirty && !confirm('¿Descartar los enlaces sin guardar?')) return;
    working = true; controls(); message('Cargando próximos ingresos y enlaces…');
    try { snapshot = await loadContent(getStore()); render(); message('Los flyers son independientes del stock.'); }
    catch (e) { message(e.message); }
    finally { working = false; controls(); }
  }
  async function run(change, uploads = []) {
    if (working || locked() || !getStore().token || !snapshot) return;
    let saved = false;
    working = true; setBusy(true); controls(); message('Guardando contenido…');
    try {
      const data = structuredClone(snapshot.data);
      for (const key of LINK_KEYS) data.links[key] = $('content-links').querySelector(`[name="${key}"]`).value.trim();
      change(data); snapshot = await saveContent(getStore(), snapshot, data, uploads);
      saved = true; render(); $('flyer-file').value = ''; $('flyer-title').value = ''; message('Guardado. Se publicará con la actualización habitual del catálogo.');
    } catch (e) { message(`${e.message} Si se interrumpió la conexión, recargá para comprobar el resultado antes de repetir.`); }
    finally { working = false; setBusy(false); controls(); }
    if (saved) await onSaved();
  }
  $('content-links').oninput = () => { dirty = true; };
  $('content-save-links').onclick = () => run(() => {});
  $('content-reload').onclick = reload;
  $('flyer-add').onclick = async () => {
    if (working || locked() || !getStore().token) return;
    const file = $('flyer-file').files[0], title = $('flyer-title').value.trim();
    const types = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' };
    if (!file || !types[file.type] || file.size > 8 * 1024 * 1024 || !title) { message('Ingresá un título y elegí un flyer JPG, PNG o WebP de hasta 8 MB.'); return; }
    try {
      const id = crypto.randomUUID(), path = `imagenes/proximos/${id}.${types[file.type]}`;
      const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
      for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
      await run(data => data.flyers.push({ id, title, image: `/catalogo-dpa/${path}` }), [{ path, content:btoa(binary) }]);
    } catch (e) { message(e.message); }
  };
  window.addEventListener('beforeunload', event => { if (dirty || working) { event.preventDefault(); event.returnValue = ''; } });
  reload();
  return { setDisabled(value) { externalLock = value; controls(); } };
}

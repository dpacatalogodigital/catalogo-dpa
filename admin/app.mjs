import { FIELDS, STATES, BRANDS, TYPES, monthly, monthOf, validateInventory } from './inventory.mjs';
import { InventoryStore } from './github.mjs';
import { authenticate } from './auth.mjs';

const $ = id => document.getElementById(id);
const labels = { activo: 'Activo', archivado: 'Archivado', vendido: 'Vendido', reingreso: 'Reingreso', proximo_ingreso: 'Próximo ingreso', alta: 'Alta', baja: 'Baja', modificacion: 'Modificación' };
const dateLabels = { fechaAlta: 'Alta', fechaBaja: 'Última baja', fechaReingreso: 'Último reingreso', fechaUltimaModificacion: 'Última modificación' };
const formatDate = value => value ? new Date(value).toLocaleString('es-AR', { timeZone: 'America/Argentina/Cordoba' }) : 'Sin registro histórico';
let store = new InventoryStore(), snapshot, selected = null, dirty = false, busy = false, pending = null;
const node = (tag, text, className) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; if (className) el.className = className; return el; };
function status(text, error = false) { $('status').textContent = text; $('status').className = error ? 'error' : ''; }
function controls() {
  $('fields').disabled = busy || !store.token;
  $('new').disabled = busy || !snapshot || !store.token;
  for (const id of ['reload','login','logout']) $(id).disabled = busy;
  $('export').disabled = !snapshot;
}
function mayDiscard() { return !dirty || window.confirm('Hay cambios sin guardar. ¿Querés descartarlos?'); }
function buildForm() {
  const definitions = [ ['marca', 'Marca', BRANDS], ['modelo', 'Modelo', 'text'], ['tipo', 'Tipo', TYPES], ['anio', 'Año', 'number'], ['kilometros', 'Kilómetros', 'number'], ['condicion', 'Condición', ['usado','0km']], ['precio', 'Precio', 'text'], ['datos', 'Datos destacados', 'text'], ['estadoInventario', 'Estado', STATES], ['recienLlegado', 'Recién llegado', 'checkbox'], ['sale', 'Oferta / SALE', 'checkbox'] ];
  for (const [name, title, type] of definitions) {
    const label = node('label', title), input = node(Array.isArray(type) ? 'select' : 'input');
    input.name = name;
    if (Array.isArray(type)) for (const value of type) { const option = node('option', labels[value] || value); option.value = value; input.append(option); }
    else { input.type = type; if (type === 'number') { input.min = name === 'anio' ? 1900 : 0; input.step = 1; } }
    if (['marca','modelo','tipo','anio','condicion'].includes(name)) input.required = true;
    if (type === 'checkbox') label.className = 'check';
    label.append(input); $('form-fields').append(label);
  }
}
function renderList() {
  if (!snapshot) return;
  const normalized = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rows = snapshot.db.vehiculos.filter(v => ($('filter').value === 'todos' || v.estadoInventario === $('filter').value) && normalized(`${v.id} ${v.marca} ${v.modelo}`).includes(normalized($('search').value)));
  $('total').textContent = `${rows.length} de ${snapshot.db.vehiculos.length} vehículos`;
  $('vehicles').replaceChildren(...rows.map(v => {
    const button = node('button', `#${v.id} · ${v.marca} ${v.modelo}`, `vehicle${selected === v.id ? ' selected' : ''}`);
    button.type = 'button'; button.disabled = busy;
    button.append(node('span', `${v.anio} · ${labels[v.estadoInventario]}`));
    button.onclick = () => { if (!busy && mayDiscard()) openVehicle(v.id); };
    return button;
  }));
}
function openVehicle(id) {
  selected = id; pending = null; dirty = false;
  const vehicle = snapshot.db.vehiculos.find(v => v.id === id) || { estadoInventario: 'proximo_ingreso', condicion: 'usado', imagenes: [], tipo: 'Hatch' };
  $('editor').hidden = false;
  $('editor-title').textContent = id === null ? 'Nuevo vehículo' : `${vehicle.marca} ${vehicle.modelo}`;
  $('identity').textContent = id === null ? 'El ID permanente se asignará al guardar.' : `ID permanente: ${id}`;
  for (const name of [...FIELDS, 'estadoInventario']) {
    const input = $('editor').elements.namedItem(name); if (!input) continue;
    if (input.type === 'checkbox') input.checked = Boolean(vehicle[name]);
    else input.value = name === 'imagenes' ? vehicle.imagenes.join('\n') : vehicle[name] ?? '';
  }
  $('photos').value = ''; $('first-cover').checked = true;
  $('dates').replaceChildren(...Object.entries(dateLabels).flatMap(([key, label]) => [node('dt', label), node('dd', formatDate(vehicle[key]))]));
  $('history-section').hidden = id === null;
  $('history').replaceChildren(...snapshot.db.movimientos.filter(e => e.vehiculoId === id).slice().reverse().map(e => node('li', `${formatDate(e.fecha)} · ${labels[e.tipo]} · ${labels[e.estadoAnterior] || 'Nuevo'} → ${labels[e.estadoPosterior]} · ${e.campos.join(', ')}`)));
  renderList(); controls();
}
function renderMonthly() {
  if (!snapshot || !$('month').value) return;
  const { rows, counts } = monthly(snapshot.db, $('month').value);
  $('counts').replaceChildren(...Object.entries(counts).map(([key, count]) => { const box = node('div', labels[key], 'count'); box.append(node('strong', String(count))); return box; }));
  $('movements').replaceChildren(...rows.map(e => { const tr = node('tr'); for (const text of [formatDate(e.fecha),String(e.vehiculoId),labels[e.tipo],e.campos.join(', ')]) tr.append(node('td', text)); return tr; }));
}
async function reload() {
  busy = true; controls(); status('Cargando la versión de prueba…');
  try { const next = await store.load(); validateInventory(next.db); snapshot = next; dirty = false; pending = null; renderList(); renderMonthly(); if (!$('editor').hidden) openVehicle(selected); status(store.token ? 'Sesión iniciada. Podés editar la versión de prueba.' : 'Inventario en modo consulta. Iniciá sesión para guardar.'); }
  catch (e) { status(e.message, true); }
  finally { busy = false; controls(); renderList(); }
}
async function prepare() {
  const files = [...$('photos').files], types = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (files.length > 25 || files.some(f => !types[f.type] || f.size > 8 * 1024 * 1024) || files.reduce((n, f) => n + f.size, 0) > 40 * 1024 * 1024) throw new Error('Revisá el formato o tamaño de las fotos (JPG, PNG o WebP).');
  const patch = {}, previous = snapshot.db.vehiculos.find(v => v.id === selected);
  for (const key of [...FIELDS, 'estadoInventario']) {
    const input = $('editor').elements.namedItem(key); if (!input) continue;
    let value;
    if (input.type === 'checkbox') value = input.checked;
    else if (input.type === 'number') value = input.value === '' ? null : Number(input.value);
    else value = key === 'imagenes' ? input.value.split('\n').map(x => x.trim()).filter(Boolean) : input.value;
    // Missing optional values remain missing, so opening and saving is a no-op.
    if (previous && previous[key] === undefined && (value === '' || value === null || value === false)) continue;
    patch[key] = value;
  }
  const photosChanged = JSON.stringify(previous?.imagenes || []) !== JSON.stringify(patch.imagenes);
  const photos = [];
  for (const file of files) {
    const path = `imagenes/vehiculos/${crypto.randomUUID()}.${types[file.type]}`;
    const bytes = new Uint8Array(await file.arrayBuffer()); let binary = '';
    for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
    photos.push({ path, content: btoa(binary) });
  }
  const urls = photos.map(p => `/catalogo-dpa/${p.path}`);
  if (urls.length) patch.imagenes = $('first-cover').checked ? [...urls, ...patch.imagenes] : [...patch.imagenes, ...urls];
  if (photosChanged || urls.length || !previous) patch.portada = patch.imagenes[0] || '';
  return { operation: { id: crypto.randomUUID(), action: selected === null ? 'crear' : 'guardar', vehiculoId: selected, patch }, photos };
}
$('editor').onsubmit = async event => {
  event.preventDefault(); if (busy || !store.token) return;
  busy = true; controls(); renderList(); status('Guardando la ficha, las fotos y el movimiento…');
  try {
    pending ||= await prepare();
    const operationId = pending.operation.id;
    const next = await store.save(snapshot, pending.operation, pending.photos);
    const movement = next.db.movimientos.find(e => e.id === operationId);
    snapshot = next; openVehicle(movement?.vehiculoId ?? selected); renderMonthly();
    status(movement ? 'Guardado en la versión de prueba. El catálogo público sigue igual.' : 'No había cambios; no se registró ningún movimiento.');
  } catch (e) { status(`${e.message} Los datos del formulario se conservan.`, true); }
  finally { busy = false; controls(); renderList(); }
};
$('editor').oninput = () => { dirty = true; pending = null; };
$('editor').onchange = () => { dirty = true; pending = null; };
$('login').onclick = async () => {
  if (busy || !mayDiscard()) return; busy = true; controls(); status('Completá el inicio de sesión en la ventana de GitHub…');
  try { store = new InventoryStore(await authenticate()); $('login').hidden = true; $('logout').hidden = false; await reload(); }
  catch (e) { status(e.message, true); }
  finally { busy = false; controls(); }
};
$('logout').onclick = () => { if (busy || !mayDiscard()) return; store = new InventoryStore(); $('login').hidden = false; $('logout').hidden = true; if (snapshot && !$('editor').hidden) openVehicle(selected); controls(); status('Sesión cerrada.'); };
$('new').onclick = () => { if (mayDiscard()) openVehicle(null); };
$('cancel').onclick = () => { if (mayDiscard()) openVehicle(selected); };
$('reload').onclick = () => { if (mayDiscard()) reload(); };
$('search').oninput = renderList; $('filter').onchange = renderList; $('month').onchange = renderMonthly;
$('export').onclick = () => {
  if (!$('month').value) return;
  const rows = monthly(snapshot.db, $('month').value).rows;
  const cell = value => `"${String(value).replaceAll('"', '""')}"`;
  const csv = '\uFEFF' + [['fecha','vehiculo_id','tipo','estado_anterior','estado_posterior','campos'], ...rows.map(e => [e.fecha,e.vehiculoId,e.tipo,e.estadoAnterior || '',e.estadoPosterior,e.campos.join(' | ')])].map(row => row.map(cell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); const a = node('a'); a.href = url; a.download = `movimientos-${$('month').value}.csv`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
};
window.addEventListener('beforeunload', event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ''; } });
buildForm(); $('month').value = monthOf(new Date().toISOString()); reload();

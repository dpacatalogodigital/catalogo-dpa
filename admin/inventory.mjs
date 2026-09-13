export const STATES = Object.freeze(['activo', 'archivado', 'vendido', 'reingreso', 'proximo_ingreso']);
export const BRANDS = Object.freeze(['AUDI','BMW','CHEVROLET','CITROËN','FIAT','FORD','JEEP','MERCEDES','MERCEDES BENZ','MINI','NISSAN','PEUGEOT','DODGE-RAM','RENAULT','TOYOTA','VOLKSWAGEN']);
export const TYPES = Object.freeze(['Hatch','Sedán','Rural','SUV','Pick-Up','Furgón-Utilitario','Coupé','Cabriolet']);
export const FIELDS = Object.freeze(['marca', 'modelo', 'tipo', 'anio', 'kilometros', 'condicion', 'datos', 'precio', 'recienLlegado', 'sale', 'descripcion', 'imagenes', 'portada']);
const DATES = ['fechaAlta', 'fechaBaja', 'fechaReingreso', 'fechaUltimaModificacion'];
const transitions = {
  activo: ['archivado', 'vendido'], reingreso: ['activo', 'archivado', 'vendido'],
  archivado: ['vendido', 'reingreso'], vendido: ['archivado', 'reingreso'],
  proximo_ingreso: ['activo', 'archivado', 'vendido'],
};
const clone = value => structuredClone(value);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const assert = (condition, message) => { if (!condition) throw new Error(message); };
export function visible(vehicle) {
  return vehicle.estadoInventario === undefined || ['activo', 'reingreso'].includes(vehicle.estadoInventario);
}
export function monthOf(iso) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Argentina/Cordoba', year: 'numeric', month: '2-digit' }).formatToParts(new Date(iso));
  return `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}`;
}
export function validImage(path) {
  return typeof path === 'string' && (/^\/catalogo-dpa\/(?:imagenes\/vehiculos\/)?[a-zA-Z0-9._%-]+$/.test(path) || /^https:\/\/[^\s<>"'`]+$/i.test(path));
}
export function validateVehicle(v) {
  assert(Number.isSafeInteger(v.id) && v.id > 0, 'El ID debe ser un entero positivo.');
  assert(STATES.includes(v.estadoInventario), 'Estado de inventario inválido.');
  for (const key of ['marca', 'modelo', 'tipo', 'condicion']) assert(typeof v[key] === 'string' && v[key].trim(), `Falta ${key}.`);
  assert(BRANDS.includes(v.marca) && TYPES.includes(v.tipo) && ['usado','0km'].includes(v.condicion), 'Marca, tipo o condición incompatibles con los filtros del catálogo.');
  assert(Number.isSafeInteger(v.anio) && v.anio >= 1900 && v.anio <= 2200, 'Año inválido.');
  assert(v.kilometros === undefined || v.kilometros === null || (Number.isSafeInteger(v.kilometros) && v.kilometros >= 0), 'Kilómetros inválidos.');
  for (const key of ['datos', 'precio', 'descripcion']) assert(v[key] === undefined || typeof v[key] === 'string', `Formato inválido: ${key}.`);
  for (const key of ['recienLlegado', 'sale']) assert(v[key] === undefined || typeof v[key] === 'boolean', `Formato inválido: ${key}.`);
  assert(Array.isArray(v.imagenes) && v.imagenes.every(validImage), 'Las fotos deben ser rutas del catálogo o enlaces HTTPS.');
  assert(!v.portada || (validImage(v.portada) && v.imagenes.includes(v.portada)), 'La portada debe estar en las fotos.');
  for (const key of DATES) assert(v[key] === null || (typeof v[key] === 'string' && Number.isFinite(Date.parse(v[key]))), `Fecha inválida: ${key}.`);
}
export function validateInventory(db) {
  assert(db.schemaVersion === 1 && Array.isArray(db.vehiculos) && Array.isArray(db.movimientos), 'Formato de inventario incompatible.');
  const ids = new Set();
  for (const v of db.vehiculos) { validateVehicle(v); assert(!ids.has(v.id), 'Hay IDs duplicados.'); ids.add(v.id); }
  assert(Number.isSafeInteger(db.nextId) && db.nextId > Math.max(0, ...ids), 'El próximo ID no puede reutilizarse.');
  const events = new Set();
  for (const e of db.movimientos) {
    assert(typeof e.id === 'string' && e.id && !events.has(e.id), 'Movimiento duplicado o sin ID.'); events.add(e.id);
    assert(ids.has(e.vehiculoId), 'Un movimiento perdió su vehículo.');
    assert(['alta', 'baja', 'reingreso', 'modificacion'].includes(e.tipo), 'Tipo de movimiento inválido.');
    assert(typeof e.fecha === 'string' && Number.isFinite(Date.parse(e.fecha)) && e.mes === monthOf(e.fecha), 'Fecha o mes del movimiento inválidos.');
    assert(STATES.includes(e.estadoPosterior) && (e.estadoAnterior === null || STATES.includes(e.estadoAnterior)), 'Estados del movimiento inválidos.');
    assert(Array.isArray(e.campos) && e.campos.every(k => FIELDS.includes(k) || k === 'estadoInventario'), 'Campos del movimiento inválidos.');
  }
  return db;
}
// Baseline import is deliberately NOT an alta. Historical dates are unknown.
export function migrate(input, importedAt = new Date().toISOString()) {
  if (input.schemaVersion === 1) return clone(validateInventory(input));
  assert(input.schemaVersion === undefined, 'Versión futura: no se puede migrar.');
  const db = Array.isArray(input) ? { vehiculos: clone(input) } : clone(input);
  assert(Array.isArray(db.vehiculos) && !db.movimientos, 'La migración requiere el catálogo original sin historial.');
  db.vehiculos = db.vehiculos.map(v => ({ ...v, estadoInventario: 'activo', ...Object.fromEntries(DATES.map(k => [k, null])) }));
  Object.assign(db, { schemaVersion: 1, nextId: Math.max(0, ...db.vehiculos.map(v => v.id)) + 1, movimientos: [],
    migracion: { fecha: importedAt, origen: 'stock-existente', fechasHistoricasDesconocidas: true } });
  return validateInventory(db);
}
export function applyOperation(input, operation, now = new Date().toISOString()) {
  validateInventory(input);
  assert(typeof operation.id === 'string' && operation.id.length > 0, 'Falta el identificador de operación.');
  // Safe retry after a response is lost: one operation can only count once.
  if (input.movimientos.some(e => e.id === operation.id)) return clone(input);
  assert(Number.isFinite(Date.parse(now)), 'Fecha de operación inválida.');
  assert(['crear', 'guardar'].includes(operation.action), 'Operación inválida. No se permite borrar fichas.');
  const patch = operation.patch || {};
  assert(Object.keys(patch).every(k => FIELDS.includes(k) || k === 'estadoInventario'), 'No se permite editar ID, fechas o historial.');
  const db = clone(input), isNew = operation.action === 'crear';
  const previous = isNew ? null : db.vehiculos.find(v => v.id === operation.vehiculoId);
  assert(isNew || previous, 'El vehículo ya no existe; recargá el inventario.');
  const vehicle = isNew ? { id: db.nextId, imagenes: [], recienLlegado: false, sale: false, ...Object.fromEntries(DATES.map(k => [k, null])), ...clone(patch) } : { ...previous, ...clone(patch) };
  vehicle.estadoInventario ||= 'activo';
  const before = previous?.estadoInventario ?? null, after = vehicle.estadoInventario;
  if (isNew) assert(['activo', 'proximo_ingreso'].includes(after), 'Un vehículo nuevo debe ser activo o próximo ingreso.');
  else if (before !== after) assert(transitions[before]?.includes(after), 'Transición inválida. Para recuperar una ficha archivada o vendida, elegí Reingreso.');
  const changed = [...FIELDS, 'estadoInventario'].filter(k => !equal(previous?.[k], vehicle[k]));
  if (!isNew && !changed.length) return db;
  let type = 'modificacion';
  if (isNew) { type = 'alta'; vehicle.fechaAlta = now; }
  else if (before !== after && after === 'reingreso') { type = 'reingreso'; vehicle.fechaReingreso = now; }
  else if (!['archivado', 'vendido'].includes(before) && ['archivado', 'vendido'].includes(after)) { type = 'baja'; vehicle.fechaBaja = now; }
  vehicle.fechaUltimaModificacion = now;
  validateVehicle(vehicle);
  if (isNew) { db.vehiculos.push(vehicle); db.nextId++; }
  else db.vehiculos[db.vehiculos.findIndex(v => v.id === vehicle.id)] = vehicle;
  db.movimientos.push({ id: operation.id, vehiculoId: vehicle.id, tipo: type, fecha: now, mes: monthOf(now), estadoAnterior: before, estadoPosterior: after, campos: changed });
  return validateInventory(db);
}
export function monthly(db, month) {
  assert(/^\d{4}-(0[1-9]|1[0-2])$/.test(month), 'Mes inválido.');
  const rows = db.movimientos.filter(e => e.mes === month);
  return { rows, counts: Object.fromEntries(['alta', 'baja', 'reingreso', 'modificacion'].map(t => [t, rows.filter(e => e.tipo === t).length])) };
}

import fs from 'node:fs';
import assert from 'node:assert/strict';
import { validateInventory } from '../admin/inventory.mjs';
const current = validateInventory(JSON.parse(fs.readFileSync(new URL('../cars.json', import.meta.url))));
if (process.argv[2]) {
  const previous = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const previousCars = Array.isArray(previous) ? previous : previous.vehiculos;
  for (const car of previousCars) assert(current.vehiculos.some(v => v.id === car.id), `Se eliminó el ID permanente ${car.id}. Archivar en lugar de borrar.`);
  if (previous.schemaVersion === 1) {
    assert(current.nextId >= previous.nextId, 'No se puede retroceder el próximo ID.');
    assert.deepEqual(current.movimientos.slice(0, previous.movimientos.length), previous.movimientos, 'El historial existente es inmutable.');
    for (const car of current.vehiculos.filter(v => !previousCars.some(old => old.id === v.id))) {
      assert(car.id >= previous.nextId, 'No se puede reutilizar un ID anterior.');
      assert(current.movimientos.slice(previous.movimientos.length).some(e => e.vehiculoId === car.id && e.tipo === 'alta'), `El ID ${car.id} se creó sin un alta.`);
    }
    for (const old of previousCars) {
      const next = current.vehiculos.find(v => v.id === old.id);
      assert.equal(next.fechaAlta, old.fechaAlta, 'La fecha de alta es permanente.');
      if (JSON.stringify(next) !== JSON.stringify(old)) assert(current.movimientos.slice(previous.movimientos.length).some(e => e.vehiculoId === old.id), `El ID ${old.id} cambió sin movimiento.`);
    }
  }
}
console.log(`Inventario válido: ${current.vehiculos.length} vehículos y ${current.movimientos.length} movimientos.`);

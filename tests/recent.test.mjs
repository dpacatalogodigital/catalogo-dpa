import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { FIELDS } from '../admin/inventory.mjs';
import stock from '../catalog-stock.js';
import { applyOperation } from '../admin/inventory.mjs';
import { inventoryPublished } from '../admin/publication.mjs';
const { acceptStock, publishedVehicles, recentVehicles } = stock;
const db = JSON.parse(fs.readFileSync(new URL('../cars.json', import.meta.url)));

test('actual admin form persists an unchecked arrival flag without rewriting photos or unrelated data', async () => {
  const vehicle = {...db.vehiculos.find(v=>v.id===75),recienLlegado:true};
  const elements = new Map([...FIELDS,'estadoInventario'].map(key=>[key,{
    type:['recienLlegado','sale'].includes(key)?'checkbox':['anio','kilometros'].includes(key)?'number':'text',
    checked:key==='recienLlegado'?false:Boolean(vehicle[key]),
    value:key==='imagenes'?vehicle.imagenes.join('\n'):String(vehicle[key]??''),
  }]));
  const context=vm.createContext({FIELDS,snapshot:{db:{vehiculos:[vehicle]}},selected:75,crypto,
    $:id=>id==='photos'?{files:[]}:id==='first-cover'?{checked:true}:{elements:{namedItem:key=>elements.get(key)}}});
  const source=fs.readFileSync(new URL('../admin/app.mjs',import.meta.url),'utf8');
  vm.runInContext(source.slice(source.indexOf('async function prepare()'),source.indexOf("$('editor').onsubmit")),context);
  const prepared=await vm.runInContext('prepare()',context);
  assert.deepEqual(JSON.parse(JSON.stringify(prepared.operation.patch)),{recienLlegado:false});
  elements.get('recienLlegado').checked=true;
  assert.deepEqual(JSON.parse(JSON.stringify((await vm.runInContext('prepare()',context)).operation.patch)),{});
  elements.get('imagenes').value=vehicle.imagenes.slice(1).join('\n');
  const photoEdit=await vm.runInContext('prepare()',context);
  assert.equal(photoEdit.operation.patch.portada,vehicle.imagenes[1]);
});

test('Amarok 75 stays in inventory with all 16 photos and is excluded from recent arrivals', () => {
  const vehicle = db.vehiculos.find(v => v.id === 75);
  assert.equal(vehicle.anio, 2015);
  assert.equal(vehicle.modelo, '2.0 TDI Highline 4x2 180CV');
  assert.equal(vehicle.imagenes.length, 16);
  assert(publishedVehicles(db).includes(vehicle));
  assert(!recentVehicles(publishedVehicles(db)).includes(vehicle));
});

test('removal survives edits, reload, reentry and later stale CDN reads; deliberate reactivation works', () => {
  const active = applyOperation(db, {id:'enable',action:'guardar',vehiculoId:75,patch:{recienLlegado:true}});
  const removed = applyOperation(active, {id:'remove',action:'guardar',vehiculoId:75,patch:{recienLlegado:false}});
  const edited = applyOperation(removed, {id:'price',action:'guardar',vehiculoId:75,patch:{precio:'Consultar'}});
  const reload = JSON.parse(JSON.stringify(edited));
  assert.equal(acceptStock(reload, active), reload);
  assert.equal(acceptStock(reload, removed), reload);
  assert.equal(acceptStock(reload, active.vehiculos), reload);
  assert(!recentVehicles(publishedVehicles(reload)).some(v=>v.id===75));
  assert.deepEqual(reload.vehiculos.find(v=>v.id===75).imagenes, db.vehiculos.find(v=>v.id===75).imagenes);
  const sold = applyOperation(reload,{id:'sold',action:'guardar',vehiculoId:75,patch:{estadoInventario:'vendido'}});
  const returned = applyOperation(sold,{id:'return',action:'guardar',vehiculoId:75,patch:{estadoInventario:'reingreso'}});
  assert(!recentVehicles(publishedVehicles(returned)).some(v=>v.id===75));
  const enabled = applyOperation(returned,{id:'enable-again',action:'guardar',vehiculoId:75,patch:{recienLlegado:true}});
  assert.equal(acceptStock(returned,enabled),enabled);
  assert(recentVehicles(publishedVehicles(enabled)).some(v=>v.id===75));
});

test('selection requires a boolean true; publication verifies the field as well as the movement', () => {
  assert.deepEqual(recentVehicles([{recienLlegado:'false'},{recienLlegado:false},{recienLlegado:true}]),[{recienLlegado:true}]);
  const id='fix-recent-amarok-75-20261014';
  assert(inventoryPublished(db, db, id));
  const wrong=structuredClone(db);wrong.vehiculos.find(v=>v.id===75).recienLlegado=true;
  assert.equal(inventoryPublished(wrong,db,id),false);
});

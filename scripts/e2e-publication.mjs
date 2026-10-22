// All requests are intercepted. This test cannot write to GitHub or the real inventory.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { migrate } from '../admin/inventory.mjs';

const root = fileURLToPath(new URL('../',import.meta.url));
const origin = 'https://daponteautomotores.com.ar';
const before = migrate([{id:1,marca:'FORD',modelo:'Ficha sintética E2E',tipo:'SUV',anio:2020,condicion:'usado',
  imagenes:['/catalogo-dpa/imagenes/vehiculos/fixture.png'],precio:'Antes',recienLlegado:true,sale:false}]);
let db = structuredClone(before), head = 'fixture-before', tree, writes = 0, published = false, photosReady = false;
let expired = false, loseNextResponse = false;
const content = {version:1,teamImage:'',flyers:[],links:Object.fromEntries(['instagram','facebook','tiktok','youtube','review','maps3714','maps4024'].map(k=>[k,'']))};
const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64');
const browser = await chromium.launch({headless:true});
const context = await browser.newContext();
await context.route('**/*',async route => {
  const req=route.request(), url=new URL(req.url());
  const cors = {'access-control-allow-origin':origin,'access-control-allow-headers':'authorization,content-type,x-github-api-version','access-control-allow-methods':'GET,POST,PATCH,OPTIONS'};
  const json = value => route.fulfill({status:200,headers:cors,contentType:'application/json',body:JSON.stringify(value)});
  if(url.origin === 'https://api.github.com') {
    if(req.method()==='OPTIONS') return route.fulfill({status:204,headers:cors});
    assert(url.pathname.startsWith('/repos/dpacatalogodigital/catalogo-dpa'));
    const p=url.pathname.slice('/repos/dpacatalogodigital/catalogo-dpa'.length);
    if(req.method()==='GET') {
      if(p==='') {
        if(expired) return route.fulfill({status:401,headers:cors,contentType:'application/json',body:JSON.stringify({message:'Bad credentials'})});
        return json({permissions:{push:true}});
      }
      if(p.startsWith('/git/ref/')) return json({object:{sha:head}});
      if(p==='/contents/cars.json') return json({content:Buffer.from(JSON.stringify(db)).toString('base64')});
      if(p==='/contents/site-content.json') return json({sha:'fixture-content',content:Buffer.from(JSON.stringify(content)).toString('base64')});
      if(p.startsWith('/git/commits/')) return json({tree:{sha:'fixture-tree'}});
    }
    assert.equal(req.headers().authorization,'Bearer synthetic-token-for-e2e-only');
    const body=req.postDataJSON();
    if(p==='/git/blobs') return json({sha:'fixture-photo'});
    if(p==='/git/trees') { tree=body; return json({sha:'fixture-new-tree'}); }
    if(p==='/git/commits') return json({sha:'fixture-after'});
    if(p==='/git/refs/heads/main') {
      assert.equal(body.force,false); writes++;
      db=JSON.parse(tree.tree.find(f=>f.path==='cars.json').content); head=body.sha;
      if(loseNextResponse) {loseNextResponse=false; return route.abort();}
      return json({object:{sha:head}});
    }
    throw Error(`Unexpected fixture Git request ${req.method()} ${p}`);
  }
  if(url.origin === 'https://raw.githubusercontent.com' && url.pathname.endsWith('/cars.json')) return json(published?db:before);
  if(url.origin !== origin) return route.abort();
  if(url.pathname==='/cars.json') return json(published?db:before);
  if(url.pathname==='/site-content.json') return json(content);
  if(/\.(png|jpe?g|webp)$/i.test(url.pathname)) return route.fulfill({status:photosReady?200:503,contentType:'image/png',body:pixel});
  const relative=decodeURIComponent(url.pathname).replace(/^\//,'') || 'index.html';
  const file=path.resolve(root,relative.endsWith('/')?relative+'index.html':relative);
  assert(file.startsWith(root), 'Fixture path must remain in checkout');
  const mime=file.endsWith('.html')?'text/html':/\.m?js$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':'text/plain';
  try { return route.fulfill({status:200,contentType:mime,body:await fs.readFile(file)}); }
  catch { return route.fulfill({status:404,body:'fixture: file absent'}); }
});
await context.addInitScript(() => {
  // A synthetic OAuth response; the popup and GitHub requests never leave this context.
  window.close=()=>{};
  window.open=()=>{
    setTimeout(()=>window.dispatchEvent(new MessageEvent('message',{
      origin:'https://dpa-decap-auth.redesdpa2023.workers.dev',source:window,
      data:'authorization:github:success:{"token":"synthetic-token-for-e2e-only"}',
    })),10);
    return window;
  };
});
const page=await context.newPage(),errors=[];
page.setDefaultTimeout(15000);
page.on('pageerror', e=>errors.push(e.message));
await fs.mkdir('publication-artifacts',{recursive:true});
try {
  await page.goto(origin+'/admin/');
  await page.getByRole('button',{name:'Iniciar sesión con GitHub'}).click();
  await page.getByRole('button',{name:'#1 · FORD Ficha sintética E2E'}).click();
  await page.getByLabel('Precio',{exact:true}).fill('Después E2E');
  await page.getByLabel('Recién llegado',{exact:true}).uncheck();
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await page.locator('#publication-status[data-state="pending"]').waitFor();
  assert((await page.locator('#save-status').textContent()).includes('Guardado en GitHub'));
  assert(await page.locator('#save-notice').isVisible());
  assert.equal(await page.locator('.vehicle-thumbnail img').count(),1);
  assert.equal(writes,1); assert.equal(db.vehiculos[0].precio,'Después E2E');
  assert.equal(db.vehiculos[0].recienLlegado,false);
  assert.deepEqual(db.vehiculos[0].imagenes,before.vehiculos[0].imagenes);
  assert.equal(db.movimientos.length,1);
  assert(!(await page.locator('#status').textContent()).includes('se actualizará'));
  // Closing/reopening resumes verification; it never repeats the save.
  published=true;
  await page.reload();
  await page.locator('#publication-status[data-state="pending"]').waitFor();
  assert.equal(writes,1);
  // JSON alone cannot confirm publication while the photo is missing.
  assert.equal(await page.locator('#publication-status').getAttribute('data-state'),'pending');
  photosReady=true;
  await page.reload();
  await page.locator('#publication-status[data-state="published"]').waitFor();
  assert.equal(writes,1);
  const catalog=await context.newPage();
  catalog.on('pageerror',e=>errors.push(e.message));
  await catalog.goto(origin+'/');
  await catalog.locator('#catalogoContenido [data-vehicle-id="1"]').waitFor();
  assert.equal(await catalog.locator('#recentTrack [data-vehicle-id="1"]').count(),0);
  await catalog.locator('#catalogoContenido .ficha').click();
  await catalog.locator('#modal.activo').waitFor();
  assert.equal(await catalog.locator('#modalPrecio').textContent(),'Después E2E');
  assert.deepEqual(errors,[]);
  // Sold -> active uses the real state picker and records one reentry, preserving photos.
  await page.getByRole('button',{name:'Iniciar sesión con GitHub'}).click();
  await page.getByRole('button',{name:'#1 · FORD Ficha sintética E2E'}).click();
  const originalImages = structuredClone(db.vehiculos[0].imagenes);
  for (const state of ['Vendido', 'Activo']) {
    await page.getByLabel('Estado del vehículo',{exact:true}).click();
    await page.getByRole('button',{name:state,exact:true}).click();
    await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
    await page.locator('#status').filter({hasText:'Guardado en GitHub'}).waitFor();
  }
  assert.equal(db.vehiculos[0].estadoInventario,'activo');
  assert.equal(db.movimientos.at(-1).tipo,'reingreso');
  assert.deepEqual(db.vehiculos[0].imagenes,originalImages);
  const writesBeforeCreation = writes;
  // New vehicle from a stale form, expired session, retained photo and lost save response.
  await page.getByRole('button',{name:'Nuevo vehículo',exact:true}).click();
  await page.locator('[name=marca]').selectOption('FORD');
  await page.getByLabel('Modelo',{exact:true}).fill('Alta sintética sin inventario real');
  await page.getByLabel('Año',{exact:true}).fill('2026');
  await page.getByLabel('Descripción',{exact:true}).fill('Borrador que debe conservarse');
  await page.locator('#photos').setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:pixel});
  head='concurrent-code-update'; expired=true;
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await page.locator('#status.error').filter({hasText:'sesión'}).waitFor();
  assert.equal(writes,writesBeforeCreation);
  assert.equal(await page.locator('#save-notice').getAttribute('data-state'),'error');
  expired=false;
  await page.getByRole('button',{name:'Iniciar sesión con GitHub'}).click();
  await page.locator('#status').filter({hasText:'Sesión renovada'}).waitFor();
  assert.equal(await page.getByLabel('Modelo',{exact:true}).inputValue(),'Alta sintética sin inventario real');
  assert.equal(await page.getByLabel('Descripción',{exact:true}).inputValue(),'Borrador que debe conservarse');
  assert.equal(await page.locator('#photos').evaluate(el=>el.files.length),1);
  loseNextResponse=true;
  await page.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await page.locator('#status').filter({hasText:'Guardado en GitHub'}).waitFor();
  assert.equal(writes,writesBeforeCreation+1); assert.equal(db.vehiculos.length,2);
  assert.equal(db.movimientos.filter(e=>e.tipo==='alta').length,1);
  assert.equal(db.vehiculos.at(-1).imagenes.length,1);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:'publication-artifacts/admin-aislado.png',fullPage:true});
  console.log('E2E OK: edición y publicación; alta con foto desde formulario desactualizado; sesión vencida y renovación sin perder borrador/foto; respuesta perdida recuperada sin duplicados. Cero escrituras reales.');
} catch(e) {
  await page.screenshot({path:'publication-artifacts/error-aislado.png',fullPage:true});
  throw e;
} finally { await browser.close(); }

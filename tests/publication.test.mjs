import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForPublication } from '../admin/publication.mjs';
import { imagesPublished, imagePublished, imageBytes } from '../admin/publication.mjs';
import { createPublicationStatus } from '../admin/publication-status.mjs';
test('public verification retries stale CDN and failures, without issuing writes', async () => {
  const replies = [null, { movimientos: [] }, { movimientos: [{ id: 'saved' }] }];
  let reads = 0, sleeps = 0;
  assert.equal(await waitForPublication('https://example.com/cars.json', d => d.movimientos.some(e => e.id === 'saved'), {
    attempts: 3, sleep: async () => sleeps++, fetcher: async (url, options) => {
      assert.equal(options.cache, 'no-store'); assert(!options.method); assert(url.includes('publication='));
      const value = replies[reads++]; if (!value) throw Error('offline');
      return { ok: true, json: async () => value };
    },
  }), true);
  assert.equal(reads, 3); assert.equal(sleeps, 2);
});

test('verification outlasts the actual 600-second Pages cache instead of giving up at 180 seconds', async () => {
  let clock=0,reads=0;
  assert.equal(await waitForPublication('https://example.com/cars.json', d=>d.fresh, {
    now:()=>clock,sleep:async ms=>{clock+=ms;},
    fetcher:async()=>({ok:true,json:async()=>({fresh:++reads>61})}),
  }),true);
  assert(clock>600000);
});

test('hung requests and asynchronous match failures are bounded; superseded checks stop', async () => {
  assert.equal(await waitForPublication('https://example.com/cars.json',()=>true, {
    attempts:1,timeout:5,fetcher:()=>new Promise(()=>{}),
  }),false);
  assert.equal(await waitForPublication('https://example.com/cars.json',async()=>{throw Error('photo missing');}, {
    attempts:1,fetcher:async()=>({ok:true,json:async()=>({})}),
  }),false);
  let reads=0;
  assert.equal(await waitForPublication('https://example.com/cars.json',()=>true, {
    isCurrent:()=>false,fetcher:async()=>{reads++;},
  }),false);
  assert.equal(reads,0);
});

test('missing photo and HTML masquerading as a photo cannot confirm publication; both Pages bases resolve correctly',async()=>{
  for(const base of ['https://daponteautomotores.com.ar/','https://dpacatalogodigital.github.io/catalogo-dpa/']) {
    let observed;
    const good=async(url,opts)=>{observed=url;assert.equal(opts.method,'HEAD');return {ok:true,headers:new Headers({'content-type':'image/jpeg'})};};
    assert(await imagesPublished(['/catalogo-dpa/imagenes/vehiculos/photo.jpg'],base,undefined,good));
    assert.equal(observed,new URL('imagenes/vehiculos/photo.jpg',base).href);
    assert.equal(await imagesPublished(['/catalogo-dpa/photo.jpg'],base,undefined,async()=>({ok:false})),false);
    assert.equal(await imagesPublished(['/catalogo-dpa/photo.jpg'],base,undefined,async()=>({ok:true,headers:new Headers({'content-type':'text/html'})})),false);
  }
});

test('pending state survives navigation, failed verification is explicit, and retry never repeats a Git write',async()=>{
  const memory=new Map(),storage={getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
  const output={dataset:{}},retry={};let confirmed=false,checks=0;
  const verify=async()=>{checks++;return confirmed;};
  const options={kind:'content',base:'https://example.com/',storage,verify};
  const controller=createPublicationStatus(output,retry,options);
  await controller.start({head:'abcdefg123',expected:{version:1},images:[]});
  assert.equal(output.dataset.state,'error');assert(output.textContent.includes('NO CONFIRMADA'));assert.equal(retry.hidden,false);
  assert(memory.size===1);
  confirmed=true;
  createPublicationStatus(output,retry,options);
  await new Promise(setImmediate);
  assert.equal(output.dataset.state,'published');assert.equal(memory.size,0);assert.equal(checks,2);
});

test('an older completed verification cannot overwrite the newer save status',async()=>{
  const output={dataset:{}},retry={},resolvers=[];
  const controller=createPublicationStatus(output,retry,{kind:'content',base:'https://example.com/',storage:null,verify:()=>new Promise(resolve=>resolvers.push(resolve))});
  const first=controller.start({head:'first',expected:{}}),second=controller.start({head:'second',expected:{}});
  resolvers[1](false);await second;resolvers[0](true);await first;
  assert.equal(output.dataset.state,'error');assert(output.textContent.includes('second'));
});

test('legacy extensionless JPEGs are verified by bytes; generic 200 HTML is rejected without renaming images',async()=>{
  const jpeg=Uint8Array.from([0xff,0xd8,0xff,0xe0,0,16]);
  let gets=0;
  const fetcher=async(_url,options)=>{
    if(options.method==='HEAD') return {ok:true,headers:new Headers({'content-type':'application/octet-stream'})};
    gets++;assert.equal(options.headers.Range,'bytes=0-31');return {ok:true,arrayBuffer:async()=>jpeg.buffer};
  };
  assert(await imagePublished('https://example.com/legacy-image-0',undefined,fetcher));
  assert.equal(gets,1);
  assert.equal(imageBytes(new TextEncoder().encode('<!doctype html>')),false);
  assert.equal(imageBytes(new Uint8Array([])),false);
  assert(imageBytes(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])));
  assert(imageBytes(new TextEncoder().encode('RIFF0000WEBP')));
});
test('unpublished changes never report success and retries are bounded', async () => {
  let reads = 0;
  assert.equal(await waitForPublication('https://example.com/site-content.json', () => false, {
    attempts: 2, sleep: async () => {}, fetcher: async () => { reads++; return {ok:false}; },
  }), false);
  assert.equal(reads, 2);
});

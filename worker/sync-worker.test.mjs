import test from 'node:test';import assert from 'node:assert/strict';import worker from './sync-worker.mjs';
const realFetch=globalThis.fetch;
test('Worker: short shared cache, no browser cache, methods and errors',async()=>{
let calls=0;const memory=new Map();globalThis.caches={default:{match:async k=>memory.get(k.url)?.clone(),put:async(k,v)=>memory.set(k.url,v)}};
globalThis.fetch=async url=>{calls++;assert(url.startsWith('https://raw.githubusercontent.com/dpacatalogodigital/catalogo-dpa/refs/heads/codex/prueba-sync-worker/'));return new Response(JSON.stringify({vehiculos:[],movimientos:[]}))};
const req=new Request('https://stage.example/inventory');const a=await worker.fetch(req);const b=await worker.fetch(req);assert.equal(calls,1);assert.equal(a.headers.get('Cache-Control'),'no-store');assert.equal(a.headers.get('X-DPA-Version'),b.headers.get('X-DPA-Version'));assert.equal([...memory.values()][0].headers.get('Cache-Control'),'public,max-age=12');
assert.equal((await worker.fetch(new Request('https://stage.example/inventory',{method:'POST'}))).status,405);
assert.equal((await worker.fetch(new Request('https://stage.example/photo/%2e%2e%2fadmin%2fauth.mjs'))).status,400);
globalThis.fetch=async()=>{throw Error('network')};assert.equal((await worker.fetch(new Request('https://stage.example/photo/test.png'))).status,503);globalThis.fetch=realFetch;
});
test('Worker: new photographs, cache expiry, HEAD and invalid inventory',async()=>{
 const memory=new Map();let now=0,calls=0;
 globalThis.caches={default:{match:async k=>{const c=memory.get(k.url);return c&&now<c.expires?c.response.clone():undefined},put:async(k,r)=>memory.set(k.url,{response:r,expires:now+12000})}};
 try{
  globalThis.fetch=async()=>{calls++;return new Response(new Uint8Array([255,216,255,217]))};
  const url='https://stage.example/photo/imagenes/vehiculos/new.jpeg?v=one';
  const first=await worker.fetch(new Request(url));
  assert.equal(first.status,200);assert.equal(first.headers.get('Content-Type'),'image/jpeg');
  assert.equal(first.headers.get('Access-Control-Allow-Origin'),'*');
  const head=await worker.fetch(new Request(url,{method:'HEAD'}));assert.equal(await head.text(),'');assert.equal(calls,1);
  now=12001;await worker.fetch(new Request(url));assert.equal(calls,2);
  globalThis.fetch=async()=>new Response('{}');assert.equal((await worker.fetch(new Request('https://stage.example/inventory'))).status,502);
  globalThis.fetch=async()=>new Response('missing',{status:404});assert.equal((await worker.fetch(new Request(url+'2'))).status,503);
 }finally{globalThis.fetch=realFetch;}
});

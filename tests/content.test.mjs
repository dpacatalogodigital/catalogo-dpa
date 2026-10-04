import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateContent } from '../content-model.mjs';
import { saveContent } from '../admin/content-store.mjs';
import { encodeText } from '../admin/github.mjs';
const original = JSON.parse(fs.readFileSync(new URL('../site-content.json', import.meta.url)));
function mock() {
 const writes=[];
 const store={token:'test-only',config:{branch:'main',production:true},authorize:async()=>{},api:async(path,method,body)=>{
  if(method){writes.push({path,body});if(path==='/git/trees')return {sha:'new-tree'};if(path==='/git/commits')return {sha:'new-commit'};if(path==='/git/blobs')return {sha:'image-blob'};return {};}
  if(path.includes('/git/ref/'))return {object:{sha:'latest-stock-head'}};
  if(path.includes('/contents/'))return {sha:'content-sha',content:encodeText(JSON.stringify(original))};
  if(path.includes('/git/commits/'))return {tree:{sha:'latest-stock-tree'}};
  throw Error(path);
 }};return {store,writes};
}
test('content saves use latest stock tree and touch only their own manifest',async()=>{
 const {store,writes}=mock();await saveContent(store,{sha:'content-sha'},original);
 const tree=writes.find(w=>w.path==='/git/trees').body;
 assert.equal(tree.base_tree,'latest-stock-tree');assert.deepEqual(tree.tree.map(f=>f.path),['site-content.json']);
 assert.equal(writes.at(-1).body.force,false);
 assert.deepEqual(writes.find(w=>w.path==='/git/commits').body.parents,['latest-stock-head']);
});
test('conflicts and unauthorized writes stop before changing anything',async()=>{
 const {store,writes}=mock();await assert.rejects(saveContent(store,{sha:'old'},original),/otra sesión/);assert.equal(writes.length,0);
 store.token='';await assert.rejects(saveContent(store,{sha:'content-sha'},original),/sesión/);assert.equal(writes.length,0);
});
test('unsafe URLs and uploads outside flyer directory are rejected',async()=>{
 const bad=structuredClone(original);bad.links.instagram='javascript:alert(1)';assert.throws(()=>validateContent(bad));
 const {store,writes}=mock();await assert.rejects(saveContent(store,{sha:'content-sha'},original,[{path:'cars.json',content:''}]),/Ruta/);assert.equal(writes.length,0);
});
test('flyer uploads are atomic with their manifest; removing them never deletes stock or images',async()=>{
 const {store,writes}=mock();await saveContent(store,{sha:'content-sha'},original,[{path:'imagenes/proximos/test.jpg',content:'AA=='}]);
 const tree=writes.find(w=>w.path==='/git/trees').body.tree;
 assert.deepEqual(tree.map(f=>f.path),['site-content.json','imagenes/proximos/test.jpg']);assert.equal(tree[1].sha,'image-blob');
 assert(!writes.some(w=>w.body.sha===null));
});

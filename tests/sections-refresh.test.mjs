import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {validateContent} from '../content-model.mjs';
test('open catalog refreshes upcoming content without duplicate flyers and retains last good read on failure',async()=>{
 const nodes=new Map(), events={};
 const make=()=>({children:[],hidden:false,open:false,scrollWidth:0,clientWidth:0,addEventListener(){},setAttribute(){},removeAttribute(){},append(n){this.children.push(n);},replaceChildren(){this.children=[];}});
 const get=id=>{if(!nodes.has(id))nodes.set(id,make());return nodes.get(id);};
 let data=JSON.parse(fs.readFileSync(new URL('../site-content.json',import.meta.url))),fail=false;
 const context=vm.createContext({validateContent,URL,JSON,Date,Error,clearTimeout(){},setTimeout(){},setInterval(fn){events.interval=fn;},
  matchMedia:()=>({matches:true,addEventListener(){}}),IntersectionObserver:class{observe(){}},
  window:{addEventListener:(name,fn)=>events[name]=fn},
  document:{hidden:false,getElementById:get,querySelector:()=>make(),querySelectorAll:()=>[],createElement:make,addEventListener:(name,fn)=>events[name]=fn},
  fetch:async()=>{if(fail)throw Error('offline');return {ok:true,json:async()=>structuredClone(data)};},
 });
 const source=fs.readFileSync(new URL('../sections.mjs',import.meta.url),'utf8').replace("import { validateContent } from './content-model.mjs';",'').replaceAll('import.meta.url',"'https://example.com/sections.mjs'");
 vm.runInContext(source,context);await new Promise(setImmediate);
 assert.equal(get('dpa-flyers').children.length,data.flyers.length);
 const old=get('dpa-flyers').children[0];events.focus();await new Promise(setImmediate);assert.equal(get('dpa-flyers').children[0],old);
 data.flyers=data.flyers.slice(0,1);events.interval();await new Promise(setImmediate);assert.equal(get('dpa-flyers').children.length,1);
 fail=true;events.focus();await new Promise(setImmediate);assert.equal(get('dpa-flyers').children.length,1);
});

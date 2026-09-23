import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {createVehicleGallery}=createRequire(import.meta.url)('../gallery.js');
function setup(count=3){
 let time=0,serial=0;const jobs=new Map();
 const clock={Date:{now:()=>time},setTimeout(fn,ms){jobs.set(++serial,{at:time+ms,fn});return serial},clearTimeout(id){jobs.delete(id)}};
 const tick=ms=>{const end=time+ms;for(;;){const next=[...jobs].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>end)break;time=next[1].at;jobs.delete(next[0]);next[1].fn()}time=end};
 const classes=(...initial)=>{const s=new Set(initial);return {contains:k=>s.has(k),remove:k=>s.delete(k),toggle(k,on){on?s.add(k):s.delete(k)}}};
 const image={classList:classes(),src:'',animate:()=>({cancel(){}})};
 const thumbs=new EventTarget();thumbs.children=Array.from({length:count},()=>({classList:classes()}));
 const doc=new EventTarget();doc.hidden=false;
 const reduced=new EventTarget();reduced.matches=false;
 const viewport=new EventTarget(),modal={classList:classes('activo')};
 class Photo{set src(value){this.onload()}}
 const gallery=createVehicleGallery({image,thumbs,viewport,modal,document:doc,clock,Image:Photo,reduced});
 gallery.open(Array.from({length:count},(_,i)=>'photo-'+i));
 return {gallery,image,tick,jobs,doc,reduced,viewport};
}
test('photos advance every four seconds, wrap, pause after selection and stop on close',()=>{
 const s=setup();assert.equal(s.image.src,'photo-0');s.tick(3999);assert.equal(s.image.src,'photo-0');s.tick(1);assert.equal(s.image.src,'photo-1');
 s.tick(8000);assert.equal(s.image.src,'photo-0');
 s.gallery.select(2);s.tick(11999);assert.equal(s.image.src,'photo-2');s.tick(1);assert.equal(s.image.src,'photo-0');
 s.gallery.close();assert.equal(s.jobs.size,0);s.tick(20000);assert.equal(s.image.src,'photo-0');
});
test('hidden tabs, zoom and reduced motion suspend automatic advancement; single photo stays still',()=>{
 const s=setup();s.doc.hidden=true;s.doc.dispatchEvent(new Event('visibilitychange'));s.tick(10000);assert.equal(s.image.src,'photo-0');
 s.doc.hidden=false;s.doc.dispatchEvent(new Event('visibilitychange'));s.tick(4000);assert.equal(s.image.src,'photo-1');
 s.image.classList.toggle('zoom',true);s.tick(8000);assert.equal(s.image.src,'photo-1');
 s.image.classList.remove('zoom');s.reduced.matches=true;s.reduced.dispatchEvent(new Event('change'));s.tick(10000);assert.equal(s.image.src,'photo-1');
 s.gallery.select(2);assert.equal(s.image.src,'photo-2');assert.equal(s.jobs.size,0);
 const single=setup(1);single.tick(20000);assert.equal(single.jobs.size,0);
});

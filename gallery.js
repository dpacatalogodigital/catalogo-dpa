/* Vehicle photos only; no inventory writes or network synchronization. */
(function(root){
  function createVehicleGallery({image,thumbs,viewport,modal,document:doc=root.document,clock=root,Image:Photo=root.Image,reduced=root.matchMedia('(prefers-reduced-motion: reduce)')}){
    let photos=[],index=0,opened=false,timer,pausedUntil=0,generation=0,animation,pointer,suppressClickUntil=0;
    const now=()=>clock.Date.now();
    function cancel(){clock.clearTimeout(timer);timer=null;generation++;animation?.cancel();animation=null;}
    function schedule(){
      clock.clearTimeout(timer);
      if(!opened||photos.length<2||doc.hidden||reduced.matches)return;
      timer=clock.setTimeout(()=>{
        if(image.classList.contains('zoom')){schedule();return;}
        show(index+1,false);
      },Math.max(4000,pausedUntil-now()));
    }
    function pause(){cancel();pausedUntil=now()+12000;schedule();}
    function show(next,manual){
      if(!opened||!photos.length)return;
      cancel();if(manual)pausedUntil=now()+12000;
      const target=(next+photos.length)%photos.length,run=generation;
      image.classList.remove('zoom');
      const pending=new Photo();
      pending.onload=()=>{
        if(!opened||generation!==run)return;
        index=target;image.src=photos[index];
        Array.from(thumbs.children).forEach((thumb,i)=>thumb.classList.toggle('activa',i===index));
        if(!reduced.matches&&image.animate)animation=image.animate([{opacity:.25},{opacity:1}],{duration:320,easing:'ease-out'});
        schedule();
      };
      pending.onerror=()=>{if(opened&&generation===run)schedule();};
      pending.src=photos[target];
    }
    function open(list){cancel();photos=list.slice();index=0;opened=true;pausedUntil=0;image.classList.remove('zoom');image.src=photos[0];schedule();}
    function close(){opened=false;cancel();photos=[];pointer=null;}
    viewport.addEventListener('pointerdown',e=>{
      if(!opened||e.isPrimary===false||e.button>0)return;
      pause();pointer={id:e.pointerId,x:e.clientX,y:e.clientY};
    },{passive:true});
    doc.addEventListener('pointerup',e=>{
      if(!pointer||pointer.id!==e.pointerId)return;
      const dx=e.clientX-pointer.x,dy=e.clientY-pointer.y;pointer=null;
      if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.25&&!image.classList.contains('zoom')){
        suppressClickUntil=now()+500;show(index+(dx<0?1:-1),true);
      }
    },{passive:true});
    doc.addEventListener('pointercancel',()=>{pointer=null;});
    viewport.addEventListener('click',e=>{if(now()<suppressClickUntil){e.preventDefault();e.stopImmediatePropagation();}},true);
    viewport.addEventListener('dragstart',e=>e.preventDefault());
    thumbs.addEventListener('pointerdown',()=>{if(opened)pause();},{passive:true});
    thumbs.addEventListener('wheel',()=>{if(opened)pause();},{passive:true});
    doc.addEventListener('keydown',e=>{
      if(!opened||!modal.classList.contains('activo'))return;
      if(e.target?.matches?.('input,textarea,select,[contenteditable="true"]'))return;
      if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();show(index+(e.key==='ArrowLeft'?-1:1),true);}
    });
    doc.addEventListener('visibilitychange',()=>{cancel();if(!doc.hidden)schedule();});
    reduced.addEventListener('change',()=>{cancel();schedule();});
    return {open,close,pause,select:i=>{if(Number.isInteger(i)&&i>=0&&i<photos.length)show(i,true);}};
  }
  if(typeof module==='object'&&module.exports)module.exports={createVehicleGallery};
  else root.createVehicleGallery=createVehicleGallery;
})(globalThis);

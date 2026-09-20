// Staging only: no credentials, arbitrary upstream URLs or production writes.
const ROOT='https://raw.githubusercontent.com/dpacatalogodigital/catalogo-dpa/refs/heads/codex/prueba-sync-worker/';
const TTL=12;
export default {
 async fetch(request,env,ctx){
  try {
  const url=new URL(request.url);
  const headers={'Access-Control-Allow-Origin':'*','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Access-Control-Expose-Headers':'X-DPA-Version,X-DPA-Fetched-At'};
  if(request.method!=='GET'&&request.method!=='HEAD')return new Response('Method not allowed',{status:405,headers});
  let path;
  if(url.pathname==='/inventory')path='cars.json';
  else if(url.pathname.startsWith('/photo/')){
   try{path=decodeURIComponent(url.pathname.slice(7))}catch{return new Response('Invalid path',{status:400,headers})}
   if(!/^(?:imagenes\/vehiculos\/)?[a-zA-Z0-9._%-]+$/.test(path)||path.includes('..')||path==='cars.json')return new Response('Invalid photo',{status:400,headers});
  }else return new Response('Not found',{status:404,headers});
  const key=new Request(url.origin+url.pathname+(path==='cars.json'?'':'?v='+encodeURIComponent(url.searchParams.get('v')||'')));
  let cached=await caches.default.match(key);
  if(!cached){
   // Upstream branch URLs also have a CDN: use a new query and bypass intermediary cache.
   const upstream=await fetch(ROOT+path.split('/').map(encodeURIComponent).join('/')+'?fresh='+Date.now(),{cache:'no-store',redirect:'manual'});
   if(!upstream.ok)return new Response('Source temporarily unavailable',{status:503,headers});
   const body=await upstream.arrayBuffer();
   let type=upstream.headers.get('Content-Type')||'application/octet-stream';
   const meta={'Cache-Control':'public,max-age='+TTL,'X-DPA-Fetched-At':new Date().toISOString()};
   if(path==='cars.json'){
    const db=JSON.parse(new TextDecoder().decode(body));
    if(!Array.isArray(db.vehiculos)||!Array.isArray(db.movimientos))return new Response('Invalid inventory',{status:502,headers});
    type='application/json;charset=utf-8';
    meta['X-DPA-Version']=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',body)),n=>n.toString(16).padStart(2,'0')).join('');
   }else{
    const b=new Uint8Array(body);
    type=b[0]===255&&b[1]===216?'image/jpeg':b[0]===137&&b[1]===80?'image/png':b[0]===82&&b[8]===87?'image/webp':type;
    if(!type.startsWith('image/'))return new Response('Not an image',{status:415,headers});
   }
   cached=new Response(body,{headers:{...meta,'Content-Type':type}});
   await caches.default.put(key,cached.clone());
  }
  const response=new Response(request.method==='HEAD'?null:cached.body,cached);
  for(const [k,v]of Object.entries(headers))response.headers.set(k,v);
  return response;
  } catch {
   return new Response('Source temporarily unavailable',{status:503,headers:{'Cache-Control':'no-store','Access-Control-Allow-Origin':'*'}});
  }
 }
};


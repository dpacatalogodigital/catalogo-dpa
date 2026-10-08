import { validateContent } from './content-model.mjs';
const $ = id => document.getElementById(id), reduced = matchMedia('(prefers-reduced-motion: reduce)');
const track = $('dpa-flyers'), dialog = $('flyer-dialog');
let timer, hovered = false, visible = false, paused = false, pauseUntil = 0;
function schedule() {
  clearTimeout(timer);
  if (document.hidden || !visible || hovered || paused || reduced.matches || dialog.open || track.children.length < 2 || track.scrollWidth <= track.clientWidth + 2) return;
  timer = setTimeout(() => { move(1); schedule(); }, Math.max(5000, pauseUntil - Date.now()));
}
function move(direction) {
  if (!track.firstElementChild) return;
  const step = track.firstElementChild.getBoundingClientRect().width + parseFloat(getComputedStyle(track).gap);
  const max = track.scrollWidth - track.clientWidth;
  const next = direction > 0 && track.scrollLeft >= max - 3 ? 0 : direction < 0 && track.scrollLeft <= 3 ? max : Math.max(0, Math.min(max, track.scrollLeft + step * direction));
  track.scrollTo({ left: next, behavior: reduced.matches ? 'instant' : 'smooth' });
}
function manual() { pauseUntil = Date.now() + 12000; schedule(); }
$('flyer-prev').onclick = () => { manual(); move(-1); };
$('flyer-next').onclick = () => { manual(); move(1); };
$('flyer-pause').onclick = () => { paused = !paused; $('flyer-pause').textContent = paused ? 'Reanudar movimiento' : 'Pausar movimiento'; schedule(); };
track.addEventListener('pointerdown', manual, { passive:true });
track.addEventListener('wheel', manual, { passive:true });
track.addEventListener('keydown', manual);
track.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') { hovered = true; schedule(); } });
track.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { hovered = false; schedule(); } });
new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); }).observe(track);
document.addEventListener('visibilitychange', schedule); reduced.addEventListener('change', schedule); window.addEventListener('resize', schedule);
$('flyer-close').onclick = () => dialog.close(); dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); }); dialog.addEventListener('close', schedule);
document.querySelector('#modal a.contacto').addEventListener('click', () => { cerrar(); $('contacto').focus({ preventScroll:true }); });
try {
  const response = await fetch('site-content.json', { cache:'no-store' });
  if (!response.ok) throw Error('Contenido no disponible');
  const data = validateContent(await response.json());
  if (data.teamImage) { $('dpa-team').src = data.teamImage; $('dpa-team').hidden = false; }
  document.querySelectorAll('[data-dpa-link]').forEach(link => {
    const url = data.links[link.dataset.dpaLink];
    if (url) { link.href = url; link.removeAttribute('aria-disabled'); link.removeAttribute('title'); }
    else { link.removeAttribute('href'); link.setAttribute('aria-disabled','true'); link.title = 'Enlace próximamente disponible'; }
  });
  for (const flyer of data.flyers) {
    // Resolve legacy repository paths against this module on either Pages URL.
    const image = new URL(flyer.image.replace(/^\/catalogo-dpa\//, './'), import.meta.url).href;
    const button = document.createElement('button'); button.className = 'dpa-flyer'; button.type = 'button'; button.setAttribute('aria-label', `Ampliar ${flyer.title}`);
    const img = document.createElement('img'); img.src = image; img.alt = flyer.title; img.loading = 'lazy'; img.onload = schedule; button.append(img);
    button.onclick = () => { $('flyer-large').src = image; $('flyer-large').alt = flyer.title; dialog.showModal(); schedule(); };
    track.append(button);
  }
  $('flyers-empty').hidden = data.flyers.length > 0; $('flyer-controls').hidden = data.flyers.length < 2; schedule();
} catch { $('flyers-empty').textContent = 'Las novedades no están disponibles en este momento.'; }

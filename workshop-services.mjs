const services = document.getElementById('dpa-services');
const track = services.querySelector('.dpa-services-track');
// Only the original group is read by assistive technology.
const copy = track.firstElementChild.cloneNode(true);
copy.setAttribute('aria-hidden', 'true');
track.append(copy);
services.classList.add('dpa-services-ready');
const pause = services.querySelector('button');
pause.hidden = false;
pause.addEventListener('click', () => {
  const paused = services.classList.toggle('dpa-services-paused');
  pause.setAttribute('aria-pressed', String(paused));
  pause.textContent = paused ? 'Reanudar servicios' : 'Pausar servicios';
});

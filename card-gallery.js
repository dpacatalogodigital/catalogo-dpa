/* Autoplay for catalog cards only. The individual vehicle gallery is independent. */
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const cards = new Map();
  const modal = document.getElementById('modal');
  const allowed = state => state.visible && !state.hovered && !document.hidden &&
    !reduced.matches && !modal?.classList.contains('activo') && state.card.isConnected;
  function stop(state) {
    clearTimeout(state.timer);
    state.version++;
    state.animation?.cancel();
  }
  function schedule(state) {
    clearTimeout(state.timer);
    if (!allowed(state)) return;
    state.timer = setTimeout(() => advance(state), state.delay);
  }
  function advance(state) {
    if (!allowed(state)) return;
    const version = ++state.version;
    const next = (state.index + 1) % state.photos.length;
    const photo = new Image();
    photo.onload = () => {
      if (version !== state.version || !allowed(state)) return;
      state.index = next;
      state.image.src = state.photos[next];
      state.animation = state.image.animate?.([{ opacity: .35 }, { opacity: 1 }], { duration: 380, easing: 'ease-out' });
      schedule(state);
    };
    photo.onerror = () => { if (version === state.version) schedule(state); };
    photo.src = state.photos[next];
  }
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) {
      const state = cards.get(entry.target);
      if (!state) continue;
      state.visible = entry.isIntersecting && entry.intersectionRatio >= .2;
      stop(state); schedule(state);
    }
  }, { threshold: [0, .2] });
  function discover() {
    for (const [card, state] of cards) {
      if (!card.isConnected) { stop(state); observer.unobserve(card); cards.delete(card); }
    }
    document.querySelectorAll('.card[data-vehicle-id]').forEach(card => {
      if (cards.has(card)) return;
      const image = card.querySelector('img[data-card-photos]');
      let photos;
      try { photos = JSON.parse(image?.dataset.cardPhotos || '[]'); } catch { return; }
      if (!Array.isArray(photos) || photos.length < 2) return;
      const state = { card, image, photos, index: 0, visible: false, hovered: false, version: 0,
        delay: 4000 + (Number(card.dataset.vehicleId) * 137 % 1000) };
      cards.set(card, state);
      card.addEventListener('pointerenter', event => {
        if (event.pointerType !== 'mouse') return;
        state.hovered = true; stop(state);
      });
      card.addEventListener('pointerleave', event => {
        if (event.pointerType !== 'mouse') return;
        state.hovered = false; schedule(state);
      });
      observer.observe(card);
    });
  }
  const refresh = () => { for (const state of cards.values()) { stop(state); schedule(state); } };
  document.addEventListener('visibilitychange', refresh);
  reduced.addEventListener('change', refresh);
  if (modal) new MutationObserver(refresh).observe(modal, { attributes: true, attributeFilter: ['class'] });
  new MutationObserver(discover).observe(document.body, { childList: true, subtree: true });
  discover();
})();


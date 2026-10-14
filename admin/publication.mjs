export function inventoryPublished(data, expected, operationId) {
  const event = expected.movimientos.find(e => e.id === operationId);
  if (!event || !data.movimientos?.some(e => e.id === operationId)) return false;
  const saved = expected.vehiculos.find(v => v.id === event.vehiculoId);
  const published = data.vehiculos?.find(v => v.id === event.vehiculoId);
  return Boolean(published) && event.campos.every(key =>
    JSON.stringify(published[key]) === JSON.stringify(saved[key]));
}

// Confirm public reads separately from Git persistence. Never repeat a write.
export async function waitForPublication(url, matches, {
  fetcher = globalThis.fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  attempts = 19, interval = 10000,
} = {}) {
  for (let i = 0; i < attempts; i++) {
    try {
      const target = new URL(url);
      target.searchParams.set('publication', `${Date.now()}-${i}`);
      const response = await fetcher(target.href, { cache: 'no-store' });
      if (response.ok && matches(await response.json())) return true;
    } catch { /* A transient read failure does not undo a committed save. */ }
    if (i + 1 < attempts) await sleep(interval);
  }
  return false;
}

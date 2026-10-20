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
  attempts = 91, interval = 10000, timeout = 8000, deadline = 15 * 60000,
  now = Date.now, onProgress = () => {}, isCurrent = () => true,
} = {}) {
  const started = now();
  for (let i = 0; i < attempts; i++) {
    if (!isCurrent() || now() - started >= deadline) break;
    const controller = new AbortController();
    let timer;
    try {
      const target = new URL(url);
      target.searchParams.set('publication', `${Date.now()}-${i}`);
      // Bound the entire attempt, including JSON decoding and asset checks.
      const check = async () => {
        const response = await fetcher(target.href, { cache: 'no-store', signal: controller.signal });
        return response.ok && await matches(await response.json(), controller.signal);
      };
      const expired = new Promise(resolve => {
        timer = setTimeout(() => { controller.abort(); resolve(false); }, Math.min(timeout, deadline - (now() - started)));
      });
      if (await Promise.race([check(), expired])) return true;
    } catch { /* A transient read failure does not undo a committed save. */ }
    finally { clearTimeout(timer); }
    onProgress({ attempt: i + 1, elapsed: now() - started });
    if (i + 1 < attempts && now() - started < deadline) await sleep(Math.min(interval, deadline - (now() - started)));
  }
  return false;
}

// Local images must be served as images, not merely referenced in published JSON.
export async function imagesPublished(paths, base, signal, fetcher = globalThis.fetch) {
  const urls = [...new Set(paths.filter(Boolean).map(path => new URL(path.replace(/^\/catalogo-dpa\//, './'), base)))];
  for (const url of urls) {
    if (url.origin !== new URL(base).origin) continue;
    const response = await fetcher(url.href, { method: 'HEAD', cache: 'no-store', signal });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) return false;
  }
  return true;
}

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

export function imageBytes(bytes) {
  return (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) ||
    [0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a].every((value,i)=>bytes[i]===value) ||
    (String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP');
}

export async function imagePublished(url, signal, fetcher = globalThis.fetch) {
  try {
    const response = await fetcher(url, { method: 'HEAD', cache: 'no-store', signal });
    if (!response.ok) return false;
    if (response.headers.get('content-type')?.startsWith('image/')) return true;
    // Legacy uploads have no extension: Pages serves valid JPEG bytes as octet-stream.
    // Check a byte range instead of renaming assets or accepting arbitrary HTTP 200 pages.
    const content = await fetcher(url, { cache:'no-store', signal, headers:{Range:'bytes=0-31'} });
    return content.ok && imageBytes(new Uint8Array(await content.arrayBuffer()));
  } catch { return false; }
}

// Local images must be available, not merely referenced in published JSON.
export async function imagesPublished(paths, base, signal, fetcher = globalThis.fetch) {
  const urls = [...new Set(paths.filter(Boolean).map(path => new URL(path.replace(/^\/catalogo-dpa\//, './'), base).href))]
    .filter(url => new URL(url).origin === new URL(base).origin);
  for (let i=0; i<urls.length; i+=6) {
    if (!(await Promise.all(urls.slice(i,i+6).map(url=>imagePublished(url,signal,fetcher)))).every(Boolean)) return false;
  }
  return true;
}

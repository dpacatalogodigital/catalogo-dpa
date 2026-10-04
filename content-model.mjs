export const LINK_KEYS = ['instagram','facebook','tiktok','youtube','review','maps3714','maps4024'];
export function safeLink(value) {
  if (value === '') return true;
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
}
export function validateContent(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.flyers) || !value.links) throw new Error('Formato de contenido inválido.');
  const image = s => typeof s === 'string' && (/^\/catalogo-dpa\/imagenes\/[a-zA-Z0-9/._-]+$/.test(s) || (s.startsWith('https://') && safeLink(s)));
  if (value.teamImage !== '' && !image(value.teamImage)) throw new Error('Foto del equipo inválida.');
  const ids = new Set();
  for (const f of value.flyers) {
    if (!f || typeof f.id !== 'string' || !f.id || ids.has(f.id) || !image(f.image) || typeof f.title !== 'string' || !f.title.trim() || f.title.length > 160) throw new Error('Flyer inválido.');
    ids.add(f.id);
  }
  for (const key of LINK_KEYS) if (typeof value.links[key] !== 'string' || !safeLink(value.links[key])) throw new Error('Los enlaces deben comenzar con https:// o quedar vacíos.');
  return value;
}

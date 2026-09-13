// Only the published admin targets production. Local previews stay on the test branch.
export function settingsFor(location) {
const production = location?.origin === 'https://dpacatalogodigital.github.io' && location?.pathname.startsWith('/catalogo-dpa/admin/');
return Object.freeze({
  repository: 'dpacatalogodigital/catalogo-dpa',
  branch: production ? 'main' : 'codex/inventario-historial-seguro',
  production: Boolean(production),
  authOrigin: 'https://dpa-decap-auth.redesdpa2023.workers.dev',
  authEndpoint: '/auth',
  siteId: 'dpacatalogodigital.github.io',
});
}
export const settings = settingsFor(globalThis.location);

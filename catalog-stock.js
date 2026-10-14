function acceptStock(previous, next) {
  // Inventory history is append-only. A later HTTP response can be an older CDN copy.
  if (previous?.schemaVersion === 1) {
    if (next?.schemaVersion !== 1 || !Array.isArray(next.movimientos)) return previous;
    if (next.movimientos.length < previous.movimientos.length ||
        previous.movimientos.some((event, i) => event.id !== next.movimientos[i]?.id)) return previous;
  }
  return next;
}

function publishedVehicles(stock) {
  const vehicles = Array.isArray(stock) ? stock : stock?.vehiculos || [];
  return vehicles.filter(v => Number.isSafeInteger(v.id) && v.id > 0 &&
    (v.estadoInventario === undefined || ['activo', 'reservado', 'reingreso'].includes(v.estadoInventario)));
}

function recentVehicles(vehicles) {
  return vehicles.filter(v => v.recienLlegado === true);
}

if (typeof module !== 'undefined') module.exports = { acceptStock, publishedVehicles, recentVehicles };

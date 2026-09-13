# Administrador DPA

URL: https://dpacatalogodigital.github.io/catalogo-dpa/admin/

El administrador usa el hosting GitHub Pages y el servicio OAuth ya existentes. No requiere contratar un servicio nuevo. Los datos reales están en cars.json de main; las fotos permanecen en el mismo repositorio.

## Acceso

Ingresar con GitHub mediante «Iniciar sesión con GitHub». Solo las cuentas con permiso de escritura en dpacatalogodigital/catalogo-dpa pueden guardar. GitHub comprueba el permiso en cada operación. La sesión permanece en memoria y se cierra al recargar o cerrar la página. No se guardan contraseñas ni tokens en los archivos del sitio.

El sitio y el inventario son públicos; el login protege las modificaciones, no la lectura. No cargar datos personales de compradores ni información confidencial.

## Uso

- Nuevo vehículo: completar ficha y fotos, elegir Activo o Próximo ingreso y guardar. El ID se asigna una sola vez.
- Editar: seleccionar una ficha, cambiar los campos y guardar.
- Vendido o Archivado: oculta la ficha del catálogo sin borrar datos ni fotos.
- Reingreso: seleccionar un vehículo vendido/archivado y elegir Reingreso. Conserva su ID y vuelve al catálogo.
- Próximo ingreso: queda fuera del catálogo hasta pasarlo a Activo.
- El panel muestra fechas, historial y movimientos mensuales con descarga CSV. Importar stock inicial no inventa altas ni fechas pasadas.

Los guardados actualizan main en una sola operación con ficha, fotos e historial. GitHub Pages puede tardar unos minutos en reflejarlos. Si otra persona guardó antes, recargar y revisar los cambios; nunca se sobrescribe su trabajo automáticamente.

## Desarrollo y recuperación

La URL pública del administrador usa main. Las vistas locales y otros dominios usan codex/inventario-historial-seguro. Los parámetros de URL no cambian la rama. No probar operaciones sobre vehículos reales en producción.

Antes de publicar: ejecutar `node --test tests/*.test.mjs` y `node scripts/validate.mjs`. La validación continua comprueba estructura, IDs e historial. Los ensayos de operaciones usan datos ficticios.

El historial Git conserva cada guardado. La rama codex/respaldo-main-antes-admin-20260913 conserva el sitio anterior a la publicación. Para recuperar datos, revisar el cambio concreto y restaurarlo en una nueva operación; evitar forzar ramas o borrar movimientos.

La publicación inicial conserva las 63 fichas y sus fotos originales, junto con los dos movimientos de venta y reingreso ya registrados por la persona administradora.

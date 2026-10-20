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

### Confirmación de publicación (20/10/2026)

Guardar en GitHub no confirma la publicación. El administrador muestra el commit y mantiene el estado PENDIENTE hasta comprobar los campos modificados y las fotos locales en el dominio público. Comprueba hasta 15 minutos: el 20/10 se midió `Cache-Control: max-age=600` en GitHub Pages; el verificador anterior abandonaba a los 180 segundos. Una consulta fallida o una foto ausente nunca producen PUBLICACIÓN COMPROBADA. La comprobación pendiente se conserva localmente al cerrar o recargar (solo datos públicos; nunca tokens). «Volver a comprobar» repite lecturas, nunca el guardado.

GitHub Actions ejecuta pruebas unitarias y un flujo de navegador totalmente interceptado con una ficha sintética. Luego compara los archivos servidos con el commit de main, comprueba fotos y el catálogo renderizado, incluidos recientes, flyers, ficha, taller y horarios. Se ejecuta en cada push a main y cada hora; un fallo deja la ejecución en rojo. Un push posterior sustituye la comprobación del commit anterior. No se ingresan fichas de prueba en el inventario real. El control público es de lectura y no modifica la configuración de Pages.

Diagnóstico verificado: las altas #91 y #92, la baja #81 y la exclusión de recientes de #75 estaban publicadas durante la revisión del 20/10, y la usuaria confirmó que el cambio ya figuraba. No se reprodujo una pérdida de escritura ni un despliegue fallido. La demora observada es compatible con despliegue y caché; no demuestra por sí sola la causa de todos los incidentes anteriores. Esta corrección elimina la promesa de publicación sin prueba y permite detectar divergencias posteriores, sin cambiar inventario, contenido ni fotos.

## Desarrollo y recuperación

La URL pública del administrador usa main. Las vistas locales y otros dominios usan codex/inventario-historial-seguro. Los parámetros de URL no cambian la rama. No probar operaciones sobre vehículos reales en producción.

Antes de publicar: ejecutar `node --test tests/*.test.mjs` y `node scripts/validate.mjs`. La validación continua comprueba estructura, IDs e historial. Los ensayos de operaciones usan datos ficticios.

El historial Git conserva cada guardado. La rama codex/respaldo-main-antes-admin-20260913 conserva el sitio anterior a la publicación. Para recuperar datos, revisar el cambio concreto y restaurarlo en una nueva operación; evitar forzar ramas o borrar movimientos.

La publicación inicial conserva las 63 fichas y sus fotos originales, junto con los dos movimientos de venta y reingreso ya registrados por la persona administradora.

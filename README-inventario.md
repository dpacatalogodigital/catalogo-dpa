# Inventario DPA — versión de prueba

Esta implementación se prepara en `codex/inventario-historial-seguro`. No despliega, fusiona ni escribe en `main`. La configuración de GitHub Pages y los archivos de imágenes existentes quedan intactos.

## Uso del panel

1. Abrir `/admin/` en una vista previa de esta rama e iniciar sesión con GitHub mediante el servicio OAuth existente.
2. Elegir un vehículo o **Nuevo vehículo**. El ID se asigna automáticamente, es permanente y no se edita.
3. Guardar datos, cambiar el estado o agregar varias fotos desde la misma ficha.
4. Consultar **Movimientos del mes**, abrir el detalle o descargar CSV.

La sesión vive únicamente en memoria; al recargar se vuelve a iniciar sesión. Sin sesión, el panel permite consultar pero no guardar. No busca credenciales en otras aplicaciones ni en el almacenamiento del navegador.

| Estado | Catálogo público | Acción |
| --- | --- | --- |
| Activo | Visible | Stock disponible |
| Archivado / Vendido | Oculto | Conserva ID, datos y fotos |
| Reingreso | Visible | Recupera una ficha archivada o vendida |
| Próximo ingreso | Oculto | Ficha preparada antes de estar disponible |

Reingreso se conserva como estado visible hasta pasarlo a Activo, Archivado o Vendido. Para recuperar un archivado/vendido se debe elegir Reingreso; no se permite saltar directamente a Activo y perder ese movimiento. Un Activo no vuelve a Próximo ingreso.

## Fechas y conteos

- Se conserva cada ID numérico original y todos los campos anteriores. Los nuevos IDs salen de `nextId` y nunca se reutilizan porque las fichas no se eliminan.
- `fechaAlta` indica la creación de una ficha nueva, incluso si se crea como próximo ingreso. Activarla después es una modificación, no una segunda alta.
- `fechaBaja` y `fechaReingreso` conservan la última fecha de cada acción; todas las ocurrencias quedan en `movimientos`.
- `fechaUltimaModificacion` se actualiza con cada operación efectiva.
- Fechas ISO UTC; agrupación mensual en `America/Argentina/Cordoba`, no en UTC ni en la zona del dispositivo.
- Guardar sin cambios no genera movimientos. Datos y fotos modificados durante una baja/reingreso forman parte de ese único movimiento, con la lista de campos cambiados.
- Cambiar Vendido a Archivado (o viceversa) es una modificación, no una segunda baja.
- La migración inicial conserva los 63 vehículos, no inventa fechas antiguas y no genera altas. Las fechas desconocidas quedan en `null`. El registro mensual comienza con las operaciones realizadas usando este panel, no reconstruye meses previos.

## Arquitectura y protección de los datos

Se mantiene el sitio estático y `cars.json` con su raíz `vehiculos`. En el mismo archivo se agregan versión, contador de IDs y movimientos. El catálogo público conserva estilos y estructura y filtra por `estadoInventario`; este campo está separado de `condicion` y del posible campo legado `estado`, usados para distinguir 0 km.

El editor genérico de listas de Decap permitía eliminar filas y cambiar IDs. Esta rama lo sustituye por un panel específico de inventario que reutiliza el protocolo del servicio OAuth existente. La configuración Decap se conserva como referencia, apuntando a la rama de prueba, pero el nuevo `/admin/index.html` ya no carga Decap. No debe reactivarse el editor genérico: omitiría las reglas y los movimientos.

La URL anterior `/admin/cargar-fotos.html` redirige al nuevo panel. Ya no escribe directamente en main ni guarda fotos y ficha en pasos publicados por separado. Las nuevas fotos reciben una extensión válida y, al elegir portada, la primera queda al inicio de `imagenes`, que es lo que utiliza el diseño público. No se reordenan las fotos ni se aplican retroactivamente portadas antiguas durante la migración.

`InventoryStore` lee el contenido fijado al commit de la rama. Crea los blobs de fotos, el árbol y un commit con ficha e historial juntos. Solo entonces mueve la referencia, sin force. Un commit concurrente rechaza la escritura, conservando el formulario para recargar y revisar. Una operación lleva un ID para reconocer un guardado exitoso cuya respuesta se perdió. Un fallo de carga puede dejar blobs sin referencias, pero no fotos publicadas a medias ni movimientos falsos.

La interfaz comprueba el origen y la ventana emisora del OAuth. El token se envía únicamente a la API de GitHub. No se agregan secretos al repositorio. Este repositorio y su JSON son públicos: el historial es operativo, no un almacén privado para datos de clientes. Las garantías del panel no impiden que un colaborador con permisos edite Git directamente. El control CI detecta eliminación de IDs, reescritura del historial y cambios de fichas sin movimiento en PR; requiere las protecciones de rama de GitHub si se quiere imponer su aprobación como requisito de fusión.

## Validación reproducible

Sin instalar dependencias, con Node 22 o posterior:

```sh
npm test
node scripts/validate.mjs
# Comparar opcionalmente con el cars.json de la base del PR:
node scripts/validate.mjs /ruta/cars-base.json
```

Las pruebas cubren transición, ciclos repetidos, IDs, fechas, zona horaria, ausencia de cambios, reintentos, imágenes, rechazo de main, conflictos, fallo de carga, respuesta perdida y validación de mensajes OAuth. Los datos sintéticos de los tests son independientes del stock real. El workflow ejecuta las pruebas y validaciones sin permisos de escritura ni despliegue.

La comprobación local de navegador usa respuestas simuladas de GitHub y OAuth; nunca modifica vehículos reales. Se debe completar una prueba de acceso y guardado con la cuenta real sobre la rama de prueba antes de habilitar producción. El servicio OAuth pertenece a un Worker externo a este repositorio; su código y secretos no están aquí. Se comprobó que `/auth` responde 302 hacia GitHub, pero eso no demuestra por sí solo que todo el callback y los permisos de escritura funcionen con una cuenta real.

## Antes de pasar a producción

No fusionar este borrador directamente. Primero revisar la vista previa y probar el acceso con la cuenta real. Esta versión contiene una barrera deliberada que impide escrituras a `main`.

1. Volver a leer el stock actual de main: pudo cambiar desde la rama inicial. Reaplicar `migrate` de `admin/inventory.mjs` al stock más reciente, preservando todos los IDs, datos y fotos. No trasladar operaciones de demostración a producción. `migrate` es idempotente para datos de versión 1; nunca reinicia el historial ya existente.
2. Verificar el resultado y un respaldo completo mediante el commit anterior. Acordar una ventana sin cargas simultáneas para evitar perder cambios durante el corte.
3. En una revisión posterior autorizada, configurar la rama productiva en `admin/settings.mjs`, ajustar explícitamente la barrera de `InventoryStore.save` y los mensajes de prueba, y confirmar la URL autorizada por OAuth. No hay parámetro en la URL que permita cambiar la rama de escritura.
4. Ejecutar pruebas, revisar los cambios de datos y solo entonces fusionar/publicar. No se cambia GitHub Pages para desplegar esta rama.

Para revertir antes de la puesta en producción, basta con cerrar el PR: main no fue alterada. Después de haber registrado movimientos reales, preservar una copia del JSON y revertir solo el código necesario; no restaurar un stock antiguo encima de movimientos nuevos.

# Ensayo de sincronización DPA — 2026-09-20

Resultado: NO APTO para publicar como mejora de sincronización. No se modificó main ni el catálogo público, el login o el plan de Cloudflare.

## Configuración
- Rama: codex/prueba-sync-worker
- Worker aislado: dpa-stock-preview, versión activa observada dd36f71b.
- Fuente: raw.githubusercontent.com por rama, petición cache:no-store y consulta única.
- Caché de Cloudflare: 12 segundos. Navegador: no-store.
- Consulta de catálogo: cada 15 segundos solo con pestaña visible.
- Vista real en navegador: http://127.0.0.1:4324/catalogo-dpa/.
- Datos: 67 registros originales y una ficha ficticia #68. No se modificó ningún vehículo real.
- Las operaciones se generaron con applyOperation del administrador y se guardaron mediante Git Data en la rama de ensayo; no se cronometró el clic del administrador ni su autenticación.

## Tiempos observados
| Operación | Confirmación del guardado → cambio visible | Inicio de solicitud de guardado → cambio visible |
|---|---:|---:|
| sold | 241.544 s | 265.432 s |
| reentry | 290.644 s | 295.899 s |
| text | 270.813 s | 275.659 s |
| photo | 233.713 s | 248.509 s |

Una ejecución por operación, sin recarga manual, en una conexión y navegador. No son percentiles ni una garantía. El registro de pantalla usa Date.now al aplicar datos al DOM; para la foto, el evento load de la imagen, con naturalWidth=960, y URL del Worker. La confirmación corresponde al retorno satisfactorio de update_ref; no conocemos el instante interno exacto de GitHub.

Vendido eliminó la ficha de ambos listados (0 tarjetas); Reingreso la restituyó (2 tarjetas: recientes y marca). Texto mostró TEXTO ACTUALIZADO ENSAYO. La foto usó una copia de una fotografía existente en una ruta nueva, inexistente antes del guardado, con referencia y archivo publicados en el mismo commit.

## Causa encontrada
GitHub confirmó la nueva referencia de rama, y la URL del commit inmutable ya devolvía vendido, mientras raw por rama y el Worker seguían devolviendo activo. El Worker generaba nuevas respuestas (X-DPA-Fetched-At cambiaba), pero recibía datos antiguos de GitHub. Las respuestas raw observadas anunciaban max-age=300. La consulta única y cache:no-store no eliminaron esta demora en el ensayo. La foto nueva estuvo disponible antes de que el inventario actualizado entregara su enlace.

## Integridad y límites
- Las 67 fichas originales, sus referencias a fotos y movimientos anteriores permanecieron idénticos en los cinco escenarios.
- Finalizado el ensayo, cars.json fue restaurado al blob original bc5aeb615c5296f41bb2f4d006c0259a07ba8181, y se retiró la copia de foto de prueba. Los commits conservan la evidencia.
- No cambió el HTML/CSS anterior al bloque de sincronización ni el código posterior, salvo espacio final.
- 17 pruebas existentes de inventario y 2 pruebas del Worker aprobadas.
- No se editaron admin, login, filtros ni estados. No se añadieron secretos o servicios pagos.
- El Worker de ensayo permanece desplegado; el catálogo de producción no lo utiliza.
- El inventario público conserva la última versión en memoria ante un fallo de lectura: la sincronización no está garantizada durante interrupciones.
- El uso del hash de inventario en todas las fotos fuerza nuevas URL de imágenes por cada cambio: antes de producción conviene versionar imágenes individualmente.
- Workers Free tiene límite diario de 100.000 solicitudes: https://developers.cloudflare.com/workers/platform/limits/
- La API GitHub sin autenticación tiene un límite de 60 solicitudes/hora por IP; no es una sustitución sostenible con sondeo cada 15 segundos: https://docs.github.com/en/enterprise-cloud@latest/rest/using-the-rest-api/rate-limits-for-the-rest-api

## Próximo paso propuesto, NO implementado
Ensayar lectura del último commit mediante la API de GitHub y cargar datos/fotos por ese commit inmutable. Requiere evaluar caché/cuotas y autorización para una credencial de solo lectura, limitada a este repositorio, almacenada únicamente como secreto del Worker. No crear ni copiar credenciales sin autorización; la persona usuaria debería introducir el secreto directamente en Cloudflare. No cambiar el login existente ni publicar hasta repetir y aprobar mediciones.

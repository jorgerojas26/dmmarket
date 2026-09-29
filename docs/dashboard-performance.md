# Rendimiento y caché de reportes

## Política

Los dashboards de ventas, compras y clientes, sus Pareto, las listas y los
paneles de detalle de clientes/proveedores reutilizan respuestas durante **una
hora desde su cálculo**. También se incluyen los desgloses de ventas, compras,
productos, grupos, facturas y vendedores para que volver a una pantalla sea
rápido. Cada ruta y combinación completa de parámetros tiene su propia clave:
fechas, `showNoe`, ruta, búsqueda, orden y página nunca se mezclan.

La caché reside **en memoria del servidor**, compartida por las pestañas del
mismo negocio; se pierde al reiniciar. No requiere Redis, procesos auxiliares
ni tablas de resúmenes. Es adecuada para la app local y las sesiones cortas de
consulta: la primera visita calcula el reporte; las siguientes no consultan
SQL. SWR mantiene los datos en el navegador durante la navegación; sus
revalidaciones también reciben las respuestas rápidas del servidor.

- TTL absoluto de 60 minutos: consultar repetidamente no prolonga su vigencia.
- Hasta 500 entradas y 64 MiB de claves/cuerpos JSON; expulsión LRU y limpieza
  perezosa de entradas vencidas. Las respuestas demasiado grandes no se guardan.
- Peticiones simultáneas de un mismo reporte comparten el cálculo en curso.
- Solo respuestas JSON con HTTP 200. Errores, respuestas con `Set-Cookie` y
  solicitudes con cookies o `Authorization` no se comparten.
- Monedas/tasas de cambio y estado/progreso del auto-update **no** se cachean.
- `Cache-Control: no-store` en las respuestas evita otra caché HTTP en el
  navegador: la política e invalidación se controlan en el servidor.
- `X-Report-Cache: MISS | HIT | SHARED` permite comprobar el comportamiento;
  `Age` indica la antigüedad, en segundos, de una respuesta reutilizada.

La caché no precalcula rangos ni sobrevive a reinicios. Por tanto, la primera
visita a filtros nuevos sigue pagando el costo SQL y dos sesiones separadas
por más de una hora recalculan sus reportes. No debe compartirse entre negocios
ni activarse indiscriminadamente para futuras respuestas personalizadas.

## Actualización e invalidación

Los cambios de datos exitosos realizados por las rutas de negocio de la app
invalidan todos los reportes. Una consulta iniciada antes de la invalidación no
puede volver a poblar la caché con sus datos antiguos.

La contabilidad puede escribir directamente en MySQL, fuera de este proceso:
**esos cambios pueden tardar hasta una hora en verse**. Después de importar o
actualizar datos externamente se puede invalidar inmediatamente:

```sh
curl -X POST http://dmmarket.localhost:1355/api/cache/clear
```

Para recalcular un solo reporte, enviar `Cache-Control: no-cache` (también se
aceptan `no-store`, `max-age=0` o `Pragma: no-cache` en la petición). El resultado
nuevo reemplaza la entrada correspondiente. No es necesario reiniciar la app.

## Optimización SQL

- Inactividad: las líneas se unen únicamente dentro de los 12 meses previos a
  la última cabecera válida de cada cliente. Se conserva por separado la última
  factura con líneas para no alterar los buckets de clientes con cabeceras
  vacías ni perder clientes con ventas antiguas y cero ventas en la ventana.
- Sin facturar: una agregación conjunta calcula última factura, días inactivo y
  ventas históricas. Un LEFT JOIN conserva las facturas sin líneas. El orden
  por ventas históricas sigue requiriendo calcular todos los candidatos antes
  de devolver la página.
- Índices cubrientes de cabeceras `(Anulada, IdCliente, Fecha)` para `masterfact`
  y `masternoe`. InnoDB incluye su clave primaria de factura en el índice.
  Se midió también el orden `(IdCliente, Anulada, Fecha)`, pero MySQL 5.7 elegía
  el índice antiguo en los escaneos globales; el orden definitivo fue más rápido.

La migración `20260929_add_client_history_indexes.js` es reversible e
idempotente y restaura el `sql_mode` de su conexión incluso si falla. En dev:

```sh
cd packages/backend
bun run migrate
```

El binario compilado embebe y aplica la migración al iniciar.

## Verificación reproducible

```sh
# Pruebas con fixtures SQL aislados (crea y elimina tablas test_client_*;
# nunca modifica tablas de negocio). Desde packages/backend:
RUN_DB_TESTS=1 bun run test --runInBand __tests__/clients-history.test.js

# Caché: TTL, filtros, concurrencia, errores, memoria e invalidación:
bun run test --runInBand tests/report-cache.test.js

# Con el servidor iniciado, desde la raíz. Vacía la caché una vez y verifica
# JSON idéntico, HIT y respuestas calientes menores de 100 ms:
bun scripts/benchmark-dashboards.mjs 2026-07-01 2026-08-08
```

`BENCHMARK_URL` permite cambiar el servidor y `BENCHMARK_MAX_WARM_MS` adaptar el
umbral si no se ejecuta contra localhost.

En la réplica local (215.551 facturas, 876.366 líneas, MySQL 5.7), las URLs de
septiembre indicadas en el diagnóstico pasaron aproximadamente de 1,4 s a
0,6–0,7 s para sin-facturar y de 1,8 s a 1,0–1,2 s para clientes, sin caché.
Las respuestas calientes de los dashboards medidos tardaron 4–12 ms por HTTP.
Son mediciones locales, no garantías para otras bases o máquinas.

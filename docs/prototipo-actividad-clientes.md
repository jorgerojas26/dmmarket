# Prototipo de inactividad y ventas en riesgo

Medición del 16/10/2026. El prototipo está en `scripts/benchmark-client-activity.mjs`. No está conectado al dashboard, no cambia su respuesta y no se ha publicado en una release.

## Resultado

Es viable recuperar ambos elementos con una carga separada y un resultado histórico compartido. No conviene ejecutar el cálculo completo con cada carga del dashboard: aunque ahora tarda menos de un segundo en el servidor medido, todavía realiza cientos de miles de lecturas de índice.

El prototipo mantiene las reglas anteriores:

- Solo ventas no anuladas y con fecha menor o igual al corte.
- La última cabecera de cada cliente determina su ventana de 12 meses, no los últimos 12 meses globales anteriores al corte.
- La última venta con líneas determina los días de inactividad.
- Los clientes con una cabecera reciente vacía pueden seguir inactivos y aportar cero ventas a su ventana.
- Un cliente sin ninguna venta con líneas no forma parte de los grupos de inactividad.
- Las ventas en riesgo corresponden a clientes con más de 60 días sin comprar.
- Sin filtro se incluyen los clientes sin ficha; con ruta se requiere una ficha asignada a esa ruta.

## Cálculo

1. Obtener la última cabecera y el inicio de su ventana por cliente con una agregación de cabeceras.
2. Consultar ventanas de clientes por lotes mediante predicados de igualdad de cliente y rango de fecha. Agrupar ventas y última fecha con líneas en esa ventana.
3. Para los clientes sin líneas en su ventana, consultar su última venta con líneas anterior al corte. Esto conserva los clientes antiguos con ventas de ventana iguales a cero y excluye los que nunca tuvieron líneas.
4. Construir los grupos y el indicador en memoria. Los seis importes del gráfico se redondean con una consulta escalar al mismo motor, para conservar el comportamiento de `ROUND` sobre los importes de tipo `DOUBLE`.

No hay subconsultas dependientes ni cruces con tablas derivadas. En el servidor real, los lotes utilizan `range` sobre `idx_masterfact_anulada_cliente_fecha` y un acceso `ref` por número de factura en las líneas. No se crearon, alteraron ni eliminaron índices, tablas o datos del negocio.

## Mediciones en el servidor real

Motor: MySQL `5.0.24-community-nt`. Corte: `2026-10-16`. Todas las consultas de datos llevan `SQL_NO_CACHE` y no pasan por la caché de la aplicación.

No se vaciaron los buffers de MySQL ni la caché de disco, ni se reinició el servicio. Estos números no representan un arranque en frío del motor o del sistema operativo.

| Alcance | Lote | Tiempo total | Consultas de datos |
|---|---:|---:|---:|
| Todas las facturas, primera medición exploratoria | 100 | 927 ms | 25 |
| Todas las facturas, versión final, repetición 1 | 250 | 863 ms | 12 |
| Todas las facturas, versión final, repetición 2 | 250 | 865 ms | 12 |
| Todas las facturas, versión final, repetición 3 | 250 | 882 ms | 12 |
| Una ruta | 250 | 527 ms | 7 |
| Segundo modo de facturación | 250 | 48 ms | 3 |
| Todas las facturas, corte `2026-09-29` | 250 | 855 ms | 12 |

La medición exploratoria precede a la consulta escalar de redondeo, incluida en la versión final. Los tiempos totales incluyen instrumentación, planes y comprobaciones, no solo las consultas de datos.

En las tres repeticiones globales se procesaron 2.239 clientes. El trabajo de la sesión registró `Handler_read_next = 719457`, `Handler_read_key = 63028`, una tabla temporal y ninguna tabla temporal en disco.

No se midió el porcentaje de CPU de Windows. Las lecturas de índice son una medida de trabajo, no un porcentaje de CPU. No puede afirmarse que desaparecerán todos los picos instantáneos al 100%, ni extrapolar estos tiempos a más datos o mayor concurrencia.

### Efecto sobre el dashboard actual

Una ejecución controlada simultánea dio:

| Medición | Tiempo |
|---|---:|
| Dashboard antes del histórico | 432 ms |
| Dashboard mientras se calculaba el histórico | 463 ms |
| Histórico completo simultáneo | 915 ms |
| Dashboard después del histórico | 390 ms |

Es una muestra, no una prueba de carga multiusuario. Corresponde a la versión exploratoria anterior al ajuste escalar de redondeo.

## Equivalencia y seguridad

- Se contrastaron los seis grupos con la consulta de v1.5.4 sobre la copia local MySQL 5.7 para el corte `2026-10-11`: mismos clientes, conteos e importes redondeados. Los importes no redondeados se compararon con tolerancia de `0.000001` por el tipo `DOUBLE`.
- Se ejecutaron 24 combinaciones sobre una base de fixtures local aislada y eliminada después: dos modos, tres cortes y cuatro alcances de ruta. Incluyen cabeceras vacías, ventas anteriores a la ventana, límites de año bisiesto, fechas cero, clientes sin ficha, mayúsculas en identificadores y rutas, anulaciones, fechas futuras, importes fraccionarios y negativos. Todas coincidieron con la consulta original.
- El caso fraccionario detectó una diferencia de un centavo con `Number.toFixed`; por eso el prototipo utiliza el redondeo escalar del motor.
- El límite de consulta se verificó cancelando una consulta propia en la copia local: `ER_QUERY_INTERRUPTED` en 142 ms con límite de 100 ms. No se cancelan conexiones ajenas.
- No se añadieron pruebas unitarias ni se ejecutó la consulta original pesada en el servidor real.

La copia local carece del índice compuesto de cabeceras que sí existe en el servidor real. Allí la consulta original tardó 9.060 ms y el prototipo exploratorio 6.500 ms. La equivalencia local no debe confundirse con una promesa de rendimiento para cualquier esquema.

## Cómo repetir

Usa el archivo de entorno correspondiente al servidor que realmente quieras medir. Las salidas incluyen importes agregados del negocio; trátalas como información privada.

Por defecto se ejecuta la lectura de fechas máximas y se muestran los planes, sin sumar las ventanas históricas:

```sh
bun --env-file=packages/backend/.env scripts/benchmark-client-activity.mjs --to 2026-10-16 --batch-size 250
```

Medición completa, con consultas secuenciales:

```sh
bun --env-file=packages/backend/.env scripts/benchmark-client-activity.mjs --to 2026-10-16 --batch-size 250 --run
```

Opciones adicionales:

- `--ruta CODIGO`: limita a los clientes asignados a esa ruta.
- `--show-noe`: utiliza el segundo juego de tablas de ventas.
- `--timeout-ms 5000`: límite de cada consulta, por defecto cinco segundos.
- `--budget-ms 15000`: presupuesto global, por defecto quince segundos.

El límite intenta `KILL QUERY` únicamente sobre la conexión propia del instrumento mediante una segunda conexión. Si no puede cancelarla, cierra la conexión de medida. No vacía cachés globales ni modifica configuración persistente.

## Recomendación de integración

1. Mantener intactas las cuatro consultas del dashboard principal.
2. Cargar el KPI y el gráfico como bloque independiente.
3. Compartir un resumen histórico por cliente, fecha de corte y modo de facturación; aplicar las rutas sobre ese resumen, sin volver a recorrer las líneas por cada filtro.
4. Usar caducidad e invalidación coherentes con los reportes existentes, indicando la fecha de actualización.
5. Permitir una única ejecución histórica a la vez y compartirla entre solicitudes, sin abandonar la coordinación antes de que termine el cálculo.
6. Medir nuevamente la integración completa y su comportamiento ante varias solicitudes simultáneas antes de publicar.

El prototipo demuestra la viabilidad de las consultas. No implementa todavía ese resumen compartido, su coordinación ni la restauración de la interfaz.

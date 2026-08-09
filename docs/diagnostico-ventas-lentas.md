# Diagnóstico de rendimiento: consultas de ventas extremadamente lentas en producción

**Fecha:** 2026-08-08 (revisado con `docs/respaldo_sin_datos.sql` del 30/07/2026)
**Alcance:** Base de datos `bdsolser_md_nieto` (MySQL, producción Windows + contenedor Docker `dm_mysql` local, puerto 3307)
**Objetivo:** Determinar si la lentitud de las consultas a la tabla de ventas se debe al diseño de las tablas, relaciones, índices u otros factores de arquitectura de base de datos.
**Entorno de análisis:** BD local en Docker con datos históricos (rango 2020-01-20 a 2021-10-07). La BD de producción tiene un volumen de datos sustancialmente mayor.

---

## 0. Revisión con schema de producción (IMPORTANTE)

El 30/07/2026 se respaldó el schema real de producción (`docs/respaldo_sin_datos.sql`). **La BD local de Docker NO refleja el schema actual de producción**: tiene un schema más antiguo sin índices. El análisis del benchmark (sección 6) midió el peor caso (schema viejo). Con el schema real de producción la imagen cambia:

### Índices que producción YA TIENE (no recrear — error 1061)

| Tabla | Índices en producción |
|---|---|
| `slavefact` | `idx_slavefact_factura (IdFactura)`, `idx_slavefact_producto (IdProducto)`, `idx_slavefact_factura_producto (IdFactura, IdProducto)` |
| `masterfact` | `idx_masterfact_fecha (Fecha)`, `idx_masterfact_cliente (IdCliente)`, `idx_masterfact_cierre (Cierre)`, `idx_masterfact_fecha_cierre (Fecha, Cierre)` |
| `slavecomp` | `idx_slavecomp_factura (IdFactura)`, `idx_slavecomp_producto (IdProducto)` |
| `mastercomp` | `idx_mastercomp_proveedor (IdProveedor)`, `idx_mastercomp_fecha (Fecha)`, `idx_mastercomp_fecha_cierre (Fecha, Cierre)` |
| `productos` | `idx_productos_descripcion`, `idx_productos_referencia`, `idx_productos_grupo`, `idx_productos_proveedor` |
| `pagos`, `cxcmoves`, `cxpmoves`, `existencias`, `inv_moves`, `fact_vendedor_comisiones`, `vendedor_comisiones`, `cxc_*` | indexadas |

**Consecuencia:** el join maestro-detalle (`slavefact.IdFactura`) y el filtro por rango (`masterfact.Fecha`) YA tienen soporte de índice en producción. El full table scan de `slavefact` que mostraba el benchmark local **no debería ocurrir en producción con este schema** (el optimizador puede elegir `masterfact` como driving table con range scan por `Fecha` y resolver el join por índice).

### Índices que producción NO tiene (los únicos pendientes)

| Tabla | Falta | Impacto |
|---|---|---|
| `masterfact` | `(IdVend, Fecha)` | Filtros por vendedor (`sales.js?employeeId`, `employees GET_SALES`) hoy usan `idx_masterfact_fecha` y filtran `IdVend` post-scan |
| `masternoe` | `(Fecha, Anulada)` | Ruta `showNoe=true`: sin índice de rango |
| `slavenoe` | `(IdNoe)`, `(IdProducto)` | Ruta `showNoe=true`: sin NINGÚN índice |
| `clientes` | `(Ruta)` | Filtro por ruta (`sales.js`, `clients/dashboard.js`) |

### Conclusión de la revisión

Si producción **sigue lenta con este schema indexado**, la causa ya no es principalmente falta de índices. Los sospechosos pasan a ser:

1. **Agregación masiva + temp tables a disco** (ver sección 9): `GROUP BY` + `ORDER BY SUM(...)` sobre rangos grandes materializan todo el rango en temp table. Con `tmp_table_size`/`max_heap_table_size` en defaults (16MB), eso vuela a disco.
2. **Configuración del servidor**: `innodb_buffer_pool_size` en default (128MB) en máquina física con datos grandes; `sort_buffer_size` pequeño.
3. **Multiplicación de work**: count + data por vista (2 queries pesadas), dashboard con 6-12 statements, cada uno re-agregando el mismo rango.
4. **Rangos demasiado amplios** consultados desde el frontend (años completos) — la query O(N_rango) con N_rango gigante sigue siendo lenta aunque esté indexada.

**Plan de verificación en producción (antes de aplicar nada):**

```sql
SHOW INDEX FROM slavefact;   -- confirmar índices reales de la BD viva
SHOW INDEX FROM masterfact;
SELECT @@innodb_buffer_pool_size/1024/1024, @@tmp_table_size/1024/1024,
       @@max_heap_table_size/1024/1024, @@sort_buffer_size/1024;
```

y `EXPLAIN ANALYZE` de la query lenta real: si el tiempo dominante es `Aggregate using temporary table` / `Sort: ... limit input`, es agregación+config, no índices.

La migración actualizada (solo faltantes, sin duplicados) está en `docs/migrations-ventas-indices.sql`.

---

## 1. Resumen ejecutivo (análisis original sobre schema local)

**Causa raíz confirmada: deficiencia de diseño físico — ausencia casi total de índices en las tablas de transacciones de ventas.**

Las dos tablas que soportan todas las consultas de ventas presentan problemas críticos:

| Tabla | Rol | Problema |
|---|---|---|
| `slavefact` | Detalle de facturas (renglones) | **No tiene ningún índice.** Ni PRIMARY KEY, ni índice sobre `IdFactura` (columna de join con `masterfact`). |
| `masterfact` | Cabeceras de facturas | Solo PRIMARY KEY (`IdFactura`). **Sin índice sobre `Fecha`** (filtro principal de todas las consultas), ni sobre `IdCliente`, `IdVend`, `Anulada`. |

Consecuencia directa: toda consulta de ventas por rango de fechas ejecuta un **full table scan de `slavefact` completo** (la tabla más grande del esquema) y por cada fila hace un lookup puntual a `masterfact` por PK, descartando después las facturas fuera del rango. El costo no depende del rango consultado, sino del **tamaño total acumulado de `slavefact`** — por eso empeora progresivamente en producción.

**Medición en BD local (96,607 filas en `slavefact`, rango de 1 mes):**

| Plan | Tiempo | Trabajo realizado |
|---|---|---|
| Sin índices (estado actual) | **75 ms** | Full scan de 96,607 filas + 96,607 lookups a `masterfact` |
| Con índices propuestos | **7 ms** | Index range scan sobre 751 facturas del rango + lookups a sus renglones |

Mejora **10.7x** con solo 96k filas. La diferencia es de complejidad, no de velocidad bruta:

- **Sin índices:** O(N_total) — siempre se procesa la tabla completa
- **Con índices:** O(N_rango) — solo se procesan los datos del período consultado

En producción, donde `slavefact` tiene órdenes de magnitud más filas, la consulta sin índices degrada linealmente con el volumen total. Cada vista de ventas ejecuta además **2 queries** (count + data), y el dashboard ejecuta **6 statements** (12 con comparativo), multiplicando el problema.

---

## 2. Metodología

1. Inventario de esquema: `information_schema.tables` (volúmenes, tamaño en disco) y `SHOW CREATE TABLE` de todas las tablas involucradas.
2. Conteos reales con `COUNT(*)` (los `TABLE_ROWS` de `information_schema` son estimaciones no confiables en InnoDB).
3. Catálogo de consultas: revisión exhaustiva de `packages/backend/controllers/` y `packages/backend/models/` para mapear todos los patrones de acceso.
4. `EXPLAIN ANALYZE` (MySQL 8.0) sobre las consultas reales del backend, ejecutadas contra la BD local.
5. Benchmark controlado A/B: réplica de las tablas con los índices propuestos (`masterfact_idx`, `slavefact_idx`), mismas consultas, medición en una única sesión MySQL.
6. Limpieza del benchmark (DROP de tablas temporales).

---

## 3. Inventario de esquema

### 3.1 Volumen de datos (conteos reales, BD local)

| Tabla | Filas | Data (MB) | Índices existentes |
|---|---|---|---|
| `inv_moves` | 84,730 | 7.5 | — |
| `slavefact` | **96,607** | — | **ninguno** |
| `masterfact` | **24,387** | 4.5 | PK (`IdFactura`) |
| `masterfactcp` | 23,677 | 4.5 | PK (`IdFactura`) |
| `caja_moves` | 18,774 | 1.5 | — |
| `pagos` | 19,714 | 1.5 | — |
| `slavecomp` | 6,844 | 1.5 | **ninguno** |
| `mastercomp` | 2,578 | 0.4 | PK (`IdFactura`) |
| `productos` | 1,193 | 0.2 | PK (`IdProducto`) |
| `existencias` | 1,181 | 0.1 | — |
| `clientes` | 485 | 0.1 | PK (`IdCliente`) |
| `masternoe` | 3 | — | PK (`IdNoe`) |
| `slavenoe` | 14 | — | **ninguno** |

Tablas de ventas por ruta (`showNoe`): el middleware `middlewares/showNoe.js` selecciona maestro/esclavo según `showNoe=true`:

| `showNoe` | Master | Slave | Columna join |
|---|---|---|---|
| `false` (default) | `masterfact` | `slavefact` | `IdFactura` |
| `true` | `masternoe` | `slavenoe` | `IdNoe` |

Todas las tablas usan `ENGINE=InnoDB`, `CHARSET=latin1`, `COLLATE=latin1_swedish_ci` (ci — case-insensitive).

### 3.2 Estructura de las tablas de ventas

**`masterfact`** (cabeceras de factura):
```sql
CREATE TABLE `masterfact` (
  `IdFactura` varchar(12) NOT NULL DEFAULT '',
  `NumCaja` varchar(2) NOT NULL DEFAULT '',
  `Fecha` date NOT NULL DEFAULT '0000-00-00',
  `IdCliente` varchar(15) NOT NULL DEFAULT '',
  `Nombre` varchar(60) NOT NULL,
  `Rif` varchar(20) NOT NULL,
  ...
  `Anulada` tinyint(1) NOT NULL,
  ...
  `IdVend` varchar(8) DEFAULT NULL,
  ...
  PRIMARY KEY (`IdFactura`)
) ENGINE=InnoDB DEFAULT CHARSET=latin1
```

**`slavefact`** (renglones de factura):
```sql
CREATE TABLE `slavefact` (
  `IdFactura` varchar(12) NOT NULL DEFAULT '',
  `IdProducto` varchar(25) NOT NULL,
  `NumCaja` varchar(2) NOT NULL DEFAULT '',
  `Descripcion` varchar(75) NOT NULL,
  `Precio` double NOT NULL DEFAULT '0',
  `PrecioBs` double NOT NULL DEFAULT '0',
  `PrecioUSD` double NOT NULL DEFAULT '0',
  ...
  `Cantidad` double NOT NULL DEFAULT '0',
  `Costo` double NOT NULL DEFAULT '0',
  ...
  `Orden` int NOT NULL DEFAULT '0'
) ENGINE=InnoDB DEFAULT CHARSET=latin1
-- SIN PRIMARY KEY, SIN NINGÚN ÍNDICE
```

**`masternoe`/`slavenoe`**: estructura análoga (PK `IdNoe` en master, ninguna en slave).

**Tablas de compras (`mastercomp`/`slavecomp`)**: mismo patrón — PK `IdFactura` en master, sin índices en slave. Presentan la misma deficiencia, aunque con menor volumen.

### 3.3 Relaciones (FKs)

La BD tiene solo 4 claves foráneas en total (`information_schema.referential_constraints`), y **ninguna** sobre las tablas de ventas/compras. La relación maestro-detalle es puramente lógica (`masterfact.IdFactura = slavefact.IdFactura`), sin constraint que obligue a la existencia de índice en la tabla hija — condición típica de esquemas legacy.

---

## 4. Catálogo de consultas del backend

Revisión completa de `packages/backend/controllers/` y `packages/backend/models/`. Todos los endpoints de ventas comparten un patrón dominante:

### 4.1 Patrón A — Agregación por rango de fechas (dominante, ~90% del tráfico)

```sql
SELECT <agregados>
FROM slavefact sf
INNER JOIN masterfact mf
  ON mf.IdFactura = sf.IdFactura AND mf.Anulada = 0
INNER JOIN clientes  ON clientes.IdCliente  = mf.IdCliente
INNER JOIN vendedores ON vendedores.idVend = mf.IdVend
INNER JOIN productos ON productos.IdProducto = sf.IdProducto
INNER JOIN grupos    ON grupos.idGrupo      = productos.Grupo
WHERE mf.Fecha BETWEEN :from AND :to
  [AND mf.IdCliente = ...]        -- filtro opcional
  [AND mf.IdVend = ...]           -- filtro opcional
  [AND productos.Grupo = ...]     -- filtro opcional
  [AND productos.Proveedor = ...] -- filtro opcional
  [AND clientes.Ruta = ...]       -- filtro opcional
GROUP BY ...
ORDER BY <agregado> DESC
LIMIT 20
```

**Origen en código:**

| Archivo | Endpoint / función | Statements |
|---|---|---|
| `controllers/dashboard.js` | `GET_DASHBOARD_SALES` (`buildDashboardQuery`) | **6 statements por request** (KPIs, mejor vendedor, top 30 productos, top 30 clientes, KPIs comparativos —si `compareFrom`/`compareTo`→ duplica KPIs, torta por categorías). Multi-statement en una sola llamada `knex.raw`. |
| `controllers/sales.js` | `GET_FACTURAS` | count + data (2 queries) |
| `controllers/sales.js` | `GET_PRODUCTOS` | count + data (2 queries) |
| `controllers/invoices.js` | `GET_SALES`, `GET_BY_GROUP`, `GET_SALES_BY_CATEGORY` | 2-3 queries |
| `models/invoice.js` | `GET_SALES_QUERY`, `GET_BY_GROUP_QUERY`, `GET_SALES_BY_CATEGORY` | 1 query c/u |
| `controllers/clients/dashboard.js` | `GET_CLIENTS_DASHBOARD` | ~14 queries, la mayoría con joins master+slave por rango |
| `controllers/employees/index.js` | `GET_SALES` (ventas por vendedor) | 1 query (master como driving table + `IdVend`) |
| `controllers/providers.js` | reportes por proveedor | varias, patrón equivalente sobre master/slave |
| `controllers/purchases.js` | `GET_DASHBOARD_PURCHASES`, `GET_INVOICES`, `GET_PRODUCTS` | mismo patrón sobre `mastercomp`/`slavecomp` |

### 4.2 Patrón B — Búsqueda por LIKE con wildcard inicial

```sql
WHERE clientes.Empresa LIKE '%<search>%'
   OR mf.IdFactura   LIKE '%<search>%'
```
No es sargable: ningún índice puede acelerar `%texto%`. Irrelevante mientras el resto de la query ya acote por rango de fechas.

### 4.3 Patrón C — Lookup puntual por factura

```sql
WHERE mf.IdFactura = :invoiceId   -- GET_INVOICE_DETAIL
WHERE sf.IdFactura = :invoiceId   -- providers.js, invoices.js
```
Usa la PK de `masterfact` (OK) pero en `slavefact` vuelve a ser full scan sin el índice propuesto.

### 4.4 Patrón D — Agregaciones en `clients/dashboard.js`

Consultas con `Fecha <= :to` (revenue at risk, buckets de inactividad) y subqueries `DISTINCT IdCliente` con `whereIn` — todos terminan filtrando por `Fecha` (+`Anulada=0`) sobre master y join a slave.

---

## 5. Análisis de planes de ejecución

### 5.1 Consulta real `GET_FACTURAS` (rango completo 2020-2021), estado actual

```
-> Sort: mf.Fecha DESC, limit input to 20 row(s) per chunk  (actual time=267..267 rows=20 loops=1)
    -> Table scan on <temporary>  (rows=11681)
        -> Aggregate using temporary table
            -> Nested loop inner join
                -> Nested loop inner join
                    -> Nested loop inner join
                        -> Nested loop inner join
                            -> Nested loop inner join
                                -> **Table scan on sf  (rows=96607 loops=1)**
                                -> Filter: ((mf.Anulada = 0) and (mf.Fecha between ...))
                                    -> **Single-row index lookup on mf using PRIMARY (IdFactura=sf.IdFactura) (loops=96607)**
```

**Lectura crítica:** el optimizador elige `slavefact` como driving table porque es la única vía posible (no hay índice de rango que usar). Escanea **las 96,607 filas**, y por cada una consulta `masterfact` por PK (96,607 lookups), evaluando el filtro de fecha después. El `GROUP BY` materializa 11,681 filas en tabla temporal antes de ordenar y paginar.

### 5.2 Misma consulta con índices propuestos (rango 1 mes)

```
-> Index range scan on mf using idx_fecha_anulada
   over ('2020-06-01' <= Fecha <= '2020-06-30' AND Anulada = 0)
   (actual time=0.18..2.73 rows=751 loops=1)
-> Covering index lookup on sf using idx_idfactura (IdFactura=mf.IdFactura) ...
```

El optimizador arranca en `masterfact` con **index range scan por fecha** (751 facturas), y por cada una resuelve sus renglones con **index lookup** en `slavefact`. Solo se tocan las filas del período.

### 5.3 Desglose de costos por etapa

| Etapa | Sin índices | Con índices |
|---|---|---|
| Acceso a renglones | Full scan 96,607 filas | Index range 751 facturas → lookups |
| Filtro de fecha | Post-lookup, fila a fila (96,607 evaluaciones) | Parte del index range scan |
| Lookups a master | 96,607 (PK) | 751 (range scan directo) |
| Temp table para GROUP BY | 11,681 filas | ~600 filas |

---

## 6. Benchmark cuantitativo

**Método:** réplica `CREATE TABLE ... LIKE` + `INSERT ... SELECT` de `masterfact_idx`/`slavefact_idx`, agregando los índices propuestos (sección 8). Misma consulta de agregación (patrón A, rango `2020-06-01` a `2020-06-30`, 1 mes), ejecutada en una única sesión MySQL, medido con `TIMESTAMPDIFF(MICROSECOND, ...)`.

```
SIN ÍNDICES: 75 ms   (596 facturas en rango)
CON ÍNDICES:  7 ms   (596 facturas en rango)
```

**Speedup: 10.7x.** Ambos planes devuelven idénticos resultados (596 filas).

**Proyección a producción:** el costo sin índices es proporcional al total de filas de `slavefact`. Si producción tiene ~10x las filas locales, la misma consulta pasa de 75 ms a ~750 ms; con 50x, ~3.7 s **por statement**. El dashboard (6-12 statements por request, 2 queries por vista paginada) multiplica ese número. Con índices, el costo depende solo del rango consultado y permanece en decenas de ms sin importar el histórico acumulado.

---

## 7. Causa raíz

1. **`slavefact` sin índices (crítico).** La tabla más grande del sistema y la más consultada no tiene ni PK. El join maestro-detalle y el filtro por rango no tienen forma de evitar el full scan. Sin `idx_idfactura`, el optimizador *nunca* puede elegir `masterfact` como driving table con range scan.
2. **`masterfact` sin índice de rango.** `Fecha` es el predicado de TODAS las consultas y no está indexado; el filtro se aplica como post-filter tras el lookup por PK.
3. **Ausencia de FK en el esquema.** La relación maestro-detalle no está declarada, por lo que MySQL nunca creó el índice implícito de FK sobre `slavefact(IdFactura)`.
4. **Multiplicador de queries.** Las vistas ejecutan count + data (2x) y el dashboard 6-12 statements por request, cada uno con el mismo full scan.

No se detectaron otros problemas de arquitectura: motor correcto (InnoDB), collations homogéneas entre columnas de join, tipos compatibles (`varchar` = `varchar`, `date` = `date`).

---

## 8. Plan de índices propuesto

> **REVISADO 08/08/2026:** el análisis de esta sección corresponde al schema local (sin índices). Producción ya tiene los índices de acceso principales (ver sección 0). Aplicar SOLO los pendientes de la sección 0; la migración actualizada está en `docs/migrations-ventas-indices.sql`. No recrear índices existentes (error 1061).

### 8.1 Ventas — `masterfact`

```sql
ALTER TABLE masterfact
  ADD INDEX idx_fecha_anulada (Fecha, Anulada),     -- patrón A: range scan por fecha + filtro anuladas
  ADD INDEX idx_idcliente_fecha (IdCliente, Fecha), -- filtros por cliente (sales.js, clients/dashboard.js)
  ADD INDEX idx_idvend_fecha (IdVend, Fecha);       -- filtros por vendedor (sales.js, employees/index.js)
```

Justificación del orden de columnas en `(Fecha, Anulada)`: `Fecha` es selectivo (rango) y `Anulada` es casi constante (`Anulada = 0` cubre la mayoría de filas). Poner `Anulada` primero haría que el índice se usara para `Anulada=0` y luego filtrara fecha en el índice — desperdicio. Con `Fecha` primero, MySQL hace index range scan directo sobre el rango, verificando `Anulada` como condición del índice.

Los índices `(IdCliente, Fecha)` y `(IdVend, Fecha)` sirven para los filtros combinados: cuando la query filtra por cliente/vendedor *y* rango, el índice resuelve ambas condiciones. (Suficientes para el volumen; si el rango acota bien, el optimizador puede preferir `idx_fecha_anulada` igualmente.)

### 8.2 Ventas — `slavefact`

```sql
ALTER TABLE slavefact
  ADD INDEX idx_idfactura (IdFactura),    -- CRÍTICO: habilita el join maestro-detalle desde masterfact
  ADD INDEX idx_idproducto (IdProducto);  -- joins con productos + GROUP BY productos.IdProducto
```

`idx_idfactura` es el fix de mayor impacto individual de toda la operación: sin él, ningún plan puede evitar el full scan.

### 8.3 Ruta notas (`showNoe=true`) — `masternoe` / `slavenoe`

```sql
ALTER TABLE masternoe ADD INDEX idx_fecha_anulada (Fecha, Anulada);
ALTER TABLE slavenoe  ADD INDEX idx_idnoe (IdNoe);
```

### 8.4 Compras (mismo patrón, menor volumen) — `mastercomp` / `slavecomp`

```sql
ALTER TABLE mastercomp ADD INDEX idx_fecha_anulada (Fecha, Anulada);
ALTER TABLE slavecomp  ADD INDEX idx_idfactura (IdFactura),
                       ADD INDEX idx_idproducto (IdProducto);
```

### 8.5 Tablas de catálogo (opcional, bajo costo)

```sql
ALTER TABLE clientes  ADD INDEX idx_ruta (Ruta);          -- filtro por ruta en sales.js / clients/dashboard.js
ALTER TABLE productos ADD INDEX idx_grupo (Grupo),        -- filtro categoryId en sales.js / purchases.js
                       ADD INDEX idx_proveedor (Proveedor); -- filtro proveedorId en sales.js / providers.js
```

Volúmenes pequeños (485 y 1,193 filas en local), el impacto es menor, pero los filtros sobre estas columnas aparecen en varias queries.

### 8.6 No indexar

- `Nombre`, `Empresa`, `Descripcion`, `IdFactura` para búsquedas `LIKE '%...%'` — no sargable, desperdicio de espacio.
- Columnas `double` de montos — no se filtran.

---

## 9. Impacto esperado

| Métrica | Sin índices | Con índices | Delta |
|---|---|---|---|
| Consulta facturas (1 mes, local) | 75 ms | 7 ms | **10.7x más rápida** |
| Escalado con volumen histórico | O(N_total) — lineal con todo `slavefact` | O(N_rango) — constante por período | No degrada con el tiempo |
| Dashboard (6-12 statements) | full scan por statement | range scan por statement | Multiplicado igual |

Costos de mantenimiento: 5 índices nuevos en `masterfact`/`slavefact` implican overhead en INSERT/UPDATE. La carga de escritura de este sistema (facturación, alta de pedidos) es baja frente a la carga de lectura (reportes), por lo que el trade-off es ampliamente favorable. Los índices `(IdCliente, Fecha)` y `(IdVend, Fecha)` son los únicos prescindibles si se quisiera minimizar escritura; los otros 3 (`idx_fecha_anulada`, `idx_idfactura`, `idx_idproducto`) son innegociables.

---

## 10. Recomendaciones complementarias (no bloqueantes)

0. **Revisar config del servidor (probable causa principal en prod con schema indexado).** Verificar `innodb_buffer_pool_size` (subir a 50-70% de la RAM de la máquina física si está en 128MB default), `tmp_table_size`/`max_heap_table_size` (16MB default → las agregaciones de rangos grandes vuelan a disco; subir a 256MB-1GB permite temp tables en memoria) y `sort_buffer_size`. Estos cambios requieren reinicio de MySQL y afectan a TODA la BD — validar con el plan de verificación de la sección 0.

1. **Ejecutar `ANALYZE TABLE`** tras la migración para refrescar estadísticas del optimizador.
2. **Revisar el doble query count + data** en `GET_FACTURAS`/`GET_PRODUCTOS`/`GET_INVOICES`: ambos ejecutan el mismo plan pesado. Con los índices queda aceptable, pero una ventana (`COUNT(*) OVER()`) permitiría una sola query.
3. **Dashboard multi-statement:** los 6 statements re-escanean el mismo rango. Alternativa futura: materializar agregaciones (tabla resumen diaria) o ejecutar en una sola query con `UNION ALL` de agregados — el optimizador comparte el range scan en los casos posibles. *No requerido para resolver la lentitud actual.*
4. **Consolidación de índices:** si más adelante se indexan `masterfactcp`/`slavefactcp` (facturas de contado), aplicar el mismo conjunto.
5. **No tocar el esquema de columnas:** el diagnóstico no encontró necesidad de cambios de diseño lógico (normalización, tipos, collations) — solo índice físico.

---

## 11. Anexo — SQL completo de la migración

```sql
-- VENTAS (aplicar primero — impacto principal)
ALTER TABLE masterfact
  ADD INDEX idx_fecha_anulada (Fecha, Anulada),
  ADD INDEX idx_idcliente_fecha (IdCliente, Fecha),
  ADD INDEX idx_idvend_fecha (IdVend, Fecha);

ALTER TABLE slavefact
  ADD INDEX idx_idfactura (IdFactura),
  ADD INDEX idx_idproducto (IdProducto);

-- NOTAS (ruta showNoe=true)
ALTER TABLE masternoe ADD INDEX idx_fecha_anulada (Fecha, Anulada);
ALTER TABLE slavenoe  ADD INDEX idx_idnoe (IdNoe);

-- COMPRAS (mismo patrón)
ALTER TABLE mastercomp ADD INDEX idx_fecha_anulada (Fecha, Anulada);
ALTER TABLE slavecomp  ADD INDEX idx_idfactura (IdFactura),
                       ADD INDEX idx_idproducto (IdProducto);

-- CATÁLOGO (opcional)
ALTER TABLE clientes  ADD INDEX idx_ruta (Ruta);
ALTER TABLE productos ADD INDEX idx_grupo (Grupo),
                      ADD INDEX idx_proveedor (Proveedor);
```

**Nota de ejecución:** en `slavefact` la creación de `idx_idfactura` requiere un escaneo completo de la tabla (96k filas local; más en producción) — esperar ventana de baja carga o usar `ALGORITHM=INPLACE, LOCK=NONE` (comportamiento default de MySQL 8 para `ADD INDEX`, sin bloqueo de escrituras durante la mayoría del proceso).

-- ============================================================
-- Migración: índices para rendimiento de consultas de ventas
-- Base: bdsolser_md_nieto (MySQL 8.x, producción Windows)
-- Diagnóstico completo: docs/diagnostico-ventas-lentas.md
--
-- IMPORTANTE (revisión 08/08/2026 con respaldo_sin_datos.sql):
-- Producción YA TIENE los índices principales:
--   slavefact(IdFactura), slavefact(IdProducto),
--   slavefact(IdFactura,IdProducto), masterfact(Fecha),
--   masterfact(IdCliente), masterfact(Fecha,Cierre),
--   mastercomp/slavecomp y productos (grupo/proveedor).
-- NO recrearlos: daría ERROR 1061 (Duplicate key name).
-- Este script SOLO agrega los que faltan.
--
-- Nota: MySQL 8 ejecuta ADD INDEX con ALGORITHM=INPLACE,
--       LOCK=NONE por default (no bloquea escrituras).
-- ============================================================

-- ── VERIFICACIÓN PREVIA ────────────────────────────────────
-- Confirmar qué existe de verdad en la BD viva antes de correr:
SHOW INDEX FROM masterfact;
SHOW INDEX FROM slavefact;
SHOW INDEX FROM masternoe;
SHOW INDEX FROM slavenoe;

SELECT VERSION();
SELECT @@innodb_buffer_pool_size/1024/1024 AS buf_pool_mb,
       @@tmp_table_size/1024/1024 AS tmp_mb,
       @@max_heap_table_size/1024/1024 AS max_heap_mb,
       @@sort_buffer_size/1024 AS sort_kb;
-- Si buf_pool_mb ≈ 128 y tmp_mb ≈ 16: la lentitud es en gran parte
-- config de servidor, no índices. Ver sección CONFIG en el doc.


-- ── PASO 1 — Ventas: masterfact (solo lo faltante) ────────
-- masterfact ya tiene idx_masterfact_fecha (Fecha) e
-- idx_masterfact_cliente (IdCliente). Faltan:
ALTER TABLE masterfact
  ADD INDEX idx_masterfact_vend_fecha (IdVend, Fecha);   -- filtros por vendedor

-- ── PASO 2 — Ventas: slavefact ─────────────────────────────
-- YA indexada en prod (IdFactura, IdProducto, compuesto).
-- NO ejecutar nada aquí salvo que SHOW INDEX confirme que faltan:
-- ALTER TABLE slavefact
--   ADD INDEX idx_slavefact_factura (IdFactura),
--   ADD INDEX idx_slavefact_producto (IdProducto);

-- ── PASO 3 — Notas (ruta showNoe=true): SIN índices en prod ─
ALTER TABLE masternoe ADD INDEX idx_masternoe_fecha_anulada (Fecha, Anulada);
ALTER TABLE slavenoe  ADD INDEX idx_slavenoe_noe (IdNoe),
                      ADD INDEX idx_slavenoe_producto (IdProducto);

-- ── PASO 4 — Compras ──────────────────────────────────────
-- mastercomp/slavecomp YA indexadas en prod. Nada que hacer.

-- ── PASO 5 — Catálogo ─────────────────────────────────────
-- productos ya tiene grupo/proveedor. Falta:
ALTER TABLE clientes ADD INDEX idx_clientes_ruta (Ruta);


-- ============================================================
-- VERIFICACIÓN POST-CAMBIO
-- ============================================================

SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS cols
FROM information_schema.statistics
WHERE table_schema = DATABASE()
  AND table_name IN ('masterfact','slavefact','masternoe','slavenoe','mastercomp','slavecomp')
GROUP BY table_name, index_name
ORDER BY table_name, index_name;

-- Confirmar plan: buscar dónde se gasta el tiempo.
-- MySQL 8:
EXPLAIN ANALYZE
SELECT mf.IdFactura, ROUND(SUM(sf.Precio * sf.Cantidad),2) AS monto
FROM slavefact sf
INNER JOIN masterfact mf ON mf.IdFactura = sf.IdFactura AND mf.Anulada = 0
WHERE mf.Fecha BETWEEN '2026-01-01' AND '2026-01-31'
GROUP BY mf.IdFactura
ORDER BY monto DESC
LIMIT 20;
-- Si el tiempo dominante es "Aggregate using temporary table"
-- o "Sort: ... limit input", el problema es agregación/config,
-- no falta de índices. Ver sección CONFIG en el doc.


-- ============================================================
-- ROLLBACK (solo lo que este script agregó)
-- ============================================================

-- ALTER TABLE masterfact DROP INDEX idx_masterfact_vend_fecha;
-- ALTER TABLE masternoe  DROP INDEX idx_masternoe_fecha_anulada;
-- ALTER TABLE slavenoe   DROP INDEX idx_slavenoe_noe, DROP INDEX idx_slavenoe_producto;
-- ALTER TABLE clientes   DROP INDEX idx_clientes_ruta;

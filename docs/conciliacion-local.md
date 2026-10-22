# Entorno local de conciliación

Preparado el 16/10/2026 en el contenedor existente `dm_mysql`, MySQL 5.7.44, accesible en `127.0.0.1:3307`.

No se consultó el servidor remoto ni se modificó la configuración de la aplicación. Tras el setup inicial se reconstruyó únicamente `conciliacion.inv_moves`; el resultado y las validaciones están en [reporte-conciliacion-inventario.md](reporte-conciliacion-inventario.md).

## Bases

| Base | Origen | Tablas | Facturas en masterfact | Última fecha de factura | Filas de inv_moves |
|---|---|---:|---:|---|---:|
| `respaldo_1` | Instantánea de `bdsolser_md_nieto` local, confirmada por el usuario como origen correcto | 99 | 223.732 | 2026-10-11 | 839.945 |
| `respaldo_2` | `~/Downloads/bdsolser_md_nieto_2026_10_16.dump` | 97 | 224.398 | 2026-10-16 | 837.877 |
| `conciliacion` | Datos de `respaldo_2` con `inv_moves` reconstruido | 97 + 1 de reversión | 224.398 | 2026-10-16 | 842.988 |

La fecha mostrada es `MAX(masterfact.Fecha)`, no el instante de creación del respaldo. El dump actual indica cierre el 16/10/2026 a las 09:12:08.

`bdsolser_md_nieto` permanece intacta. La aplicación continúa apuntando a ella. Las bases `respaldo_1` y `respaldo_2` deben tratarse como referencias de solo lectura; únicamente `conciliacion` será el espacio de trabajo para la reparación posterior. No se cambiaron permisos de usuarios para imponer esa convención.

**Estado actual:** `conciliacion.inv_moves` contiene el historial de `respaldo_1`, sin las salidas de facturas posteriormente anuladas y con las nuevas ventas, compras, retiro y desempaques incorporados. La tabla anterior, con 837.877 movimientos, se conserva en `conciliacion.inv_moves_antes_conciliacion_20261016`. No se modificaron `existencias` ni `productos.Existencia`.

## Diferencias de estructura conservadas

El dump del 16/10 no incluye `cxc_cierres` ni `cxc_operaciones`; esas tablas sí están en `respaldo_1` porque pertenecen al desarrollo de cuentas por cobrar aún no desplegado en producción, según confirmó el usuario. No es una pérdida de datos del respaldo actual. No se ejecutaron migraciones ni se intentó igualar las estructuras.

Las claves foráneas apuntan al mismo esquema de cada copia, no a la base original: diez relaciones en `respaldo_1` y siete en cada una de las otras dos bases.

## Verificaciones del setup inicial

Las siguientes comprobaciones y sus manifiestos describen el estado inicial, anterior a reconstruir `inv_moves`. Para el estado actual, consultar el reporte de reconstrucción enlazado al inicio.

- Importaciones terminadas sin errores del cliente MySQL.
- Inventario y conteos exactos de todas las tablas.
- Comparación de checksums de datos; para la tabla con JSON se utilizó además un hash de contenido lógico canónico porque `CHECKSUM TABLE` produjo valores no estables para ella.
- Igualdad de datos entre `respaldo_1` y la BD operativa original, y entre `conciliacion` y `respaldo_2`.
- Igualdad de columnas, índices, claves foráneas y siguientes valores autoincrementales entre cada pareja anterior.
- Conservación del trigger de comisiones y de las tres funciones almacenadas, sin regenerar comisiones durante la carga.
- Comprobación posterior de que la BD operativa y el archivo original del 16/10 no cambiaron durante el setup.

## Archivos de soporte

Directorio privado, con permisos restrictivos:

`~/Downloads/dmmarket-conciliacion-20261016-102932/`

Contiene:

- `respaldo_1-desde-local.sql`: instantánea completa del origen antiguo confirmado.
- `respaldo_2-para-conciliacion.sql`: exportación completa de la segunda base para generar la copia de trabajo.
- `manifest.json`: procedencia, hashes SHA-256 de archivos, conteos, checksums y verificaciones.
- `structure-verification.json`: hashes y resultados de comparación de estructura.
- Logs de importación y exportación, sin errores.

El dump original del 16/10 sigue en su ubicación inicial. Estos archivos contienen datos del negocio y no deben agregarse al repositorio.

## Siguiente paso

Revisar por separado las diferencias de saldos almacenados: 1.160 combinaciones de producto y depósito en `existencias` y 1.161 productos en `productos.Existencia`. No se actualizaron automáticamente. La reconstrucción de `inv_moves` ya se aplicó y validó; no equivale a declarar conciliados esos saldos ni a autorizar cambios en producción.

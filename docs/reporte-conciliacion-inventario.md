# Reconstrucción local de inv_moves

Aplicada y verificada el 16/10/2026 exclusivamente en `conciliacion`, dentro de `dm_mysql` (`127.0.0.1:3307`).

## Resultado

`conciliacion.inv_moves` contiene **842.988 movimientos**, frente a los 837.877 del respaldo actual. La diferencia neta es de **5.111 filas**. No debe interpretarse como 5.111 ventas: incluye entradas, salidas, restauración de historia y eliminación de movimientos incorrectos respecto del respaldo confiable.

La reconstrucción siguió este cálculo:

| Componente | Filas |
|---|---:|
| Historial confiable de `respaldo_1.inv_moves` | 839.945 |
| Retirar salidas de 16 facturas antiguas posteriormente anuladas | −307 |
| Añadir salidas de 650 facturas nuevas vigentes | +3.191 |
| Añadir entradas de 34 compras nuevas vigentes | +96 |
| Añadir un retiro nuevo | +1 |
| Conservar 31 desempaques nuevos, con una entrada y una salida cada uno | +62 |
| **Total reconstruido** | **842.988** |

Se identificaron 666 facturas nuevas en total: 650 vigentes y 16 anuladas. Las 16 facturas nuevas anuladas no generan salidas. Son distintas de las 16 facturas antiguas que pasaron a anuladas entre respaldos.

Se identificaron 37 compras nuevas: 34 vigentes y tres anuladas. Las compras nuevas anuladas no generan entradas.

El delta se determinó comparando identificadores, cabeceras y firmas del detalle; no mediante un corte por fecha. Algunas facturas nuevas están fechadas el 05/10, aunque no existían en el respaldo anterior.

## Tratamiento de los datos

- Se preservó el historial de `respaldo_1` para documentos antiguos sin cambios, aunque `respaldo_2` tuviera movimientos diferentes o faltantes para esos mismos documentos.
- Los 16 cambios en documentos antiguos de venta corresponden a anulaciones. No se encontraron cambios en sus detalles ni otros cambios de inventario en las cabeceras estudiadas.
- Las nuevas salidas por factura se reconstruyeron con producto, fecha, unidad, cantidad, costo, documento, depósito y clave guardados en los documentos.
- Las nuevas entradas por compra usan el precio del detalle de compra como costo del movimiento. Los nuevos retiros utilizan su costo histórico.
- Las proyecciones de ventas, compras y retiro coincidieron exactamente con los movimientos correspondientes del respaldo actual antes de aplicarlas.
- El usuario confirmó que `DPQ` corresponde a desempaque: una salida de un producto y una entrada de otro, por ejemplo una caja de huevos convertida a huevos individuales. No se exige que sus cantidades numéricas sumen cero porque representan presentaciones diferentes.
- Los 31 desempaques nuevos (`0000007945` a `0000007975`) se conservaron tal cual desde `respaldo_2`, con sus 62 movimientos completos del 11 al 15/10. No existe un documento independiente localizado para corroborar cada cantidad o costo; el reporte no los presenta como reconstruidos a partir de otra fuente.
- No se recalculó el historial anterior a partir del estado actual de los documentos: el respaldo antiguo fue la referencia de autoridad indicada por el usuario.

## Comparación por origen

| Origen | Respaldo actual | Reconstruido | Diferencia |
|---|---:|---:|---:|
| `AUT` | 2.002 | 2.003 | +1 |
| `CPR` | 51.674 | 51.509 | −165 |
| `DPQ` | 11.064 | 15.962 | +4.898 |
| `FAC` | 770.220 | 770.278 | +58 |
| `NCF` | 2 | 2 | 0 |
| `NOE` | 171 | 171 | 0 |
| `RET` | 2.744 | 3.063 | +319 |
| **Total** | **837.877** | **842.988** | **+5.111** |

Estas diferencias se deben a usar el historial confiable y el delta documental, no a copiar indiscriminadamente movimientos distintos encontrados en el respaldo actual.

## Validaciones realizadas

1. Antes de escribir, se comprobó que los conteos y checksums no JSON de las bases de referencia coincidían con el setup, y que `conciliacion` todavía era copia de `respaldo_2`.
2. Se construyó una tabla nueva sin reemplazar primero la activa. Las inserciones y la retirada de salidas anuladas se ejecutaron en una transacción y se comprobaron sus cantidades.
3. Se validaron los **diez campos de todos los movimientos**, mediante firmas ordenadas de filas por origen/documento y conservando la multiplicidad. Los **231.656 grupos de origen/documento** coincidieron con el resultado previsto.
4. Se activó la tabla validada mediante un único `RENAME TABLE`, conservando la anterior para reversión.
5. Se volvió a comprobar la tabla activa contra la tabla validada y se verificó que la tabla guardada coincidía con la anterior.
6. Se verificó que `bdsolser_md_nieto`, `respaldo_1` y `respaldo_2` mantuvieron sus conteos y contenido durante el proceso. Las tablas con JSON se compararon por contenido lógico, no por su checksum físico no estable.
7. Las otras **96 tablas de negocio de `conciliacion`** mantuvieron sus conteos y checksums. No se modificaron facturas, pagos, comisiones, documentos por cobrar ni configuración.
8. Una comprobación independiente del delta neto por producto y depósito encontró **cero diferencias** frente al delta documental y los desempaques conservados, usando tolerancia de `0,0001` para cantidades almacenadas como `DOUBLE`. El mayor residuo numérico fue inferior a `0,000000000001`.
9. No quedaron movimientos de salida de las 16 facturas antiguas posteriormente anuladas.

No se escribieron pruebas unitarias ni se ejecutaron operaciones contra el servidor remoto.

## Qué permanece sin modificar y pendiente

**No se modificaron `existencias` ni `productos.Existencia`.** Tampoco se cambió `.env` ni la base utilizada por la aplicación.

La comparación entre los saldos del respaldo antiguo más el delta y los saldos actuales mostró diferencias superiores a la tolerancia en:

- 1.160 combinaciones de producto y depósito de `existencias`.
- 1.161 productos de `productos.Existencia`.

La reconstrucción del historial no implica que esos saldos almacenados hayan quedado corregidos. Deben revisarse por separado, considerando también posibles ajustes no identificados. No se recomienda llevar la copia a producción sin evaluar este punto.

La diferencia de esquema entre respaldos es esperada: `cxc_cierres` y `cxc_operaciones` pertenecen al desarrollo aún no desplegado en el servidor. No se copiaron ni ejecutaron migraciones en la base de producción de referencia o en `conciliacion`.

## Reversión

La tabla previa se conserva completa en:

`conciliacion.inv_moves_antes_conciliacion_20261016`

Contiene 837.877 movimientos y coincide con la tabla activa anterior a la reparación. Por esa tabla de resguardo, `conciliacion` tiene ahora **97 tablas de negocio más una tabla de reversión**.

El archivo de reversión cambia nombres de manera atómica; no se ejecutó. Antes de usarlo deben revisarse los nombres y asegurarse de que no existan modificaciones posteriores que se deseen conservar.

Si se exporta posteriormente toda `conciliacion`, debe excluirse esta tabla de reversión del paquete de datos del negocio.

## Artefactos privados

Directorio:

`~/Downloads/dmmarket-conciliacion-20261016-102932/reparacion-inv-moves-2026-10-16T15-18-07-808Z/`

- `resultado.json`: plan, cantidades, firmas y verificaciones antes/después; estado `ready`.
- `verificacion-final.json`: comprobación independiente por origen, producto y depósito; estado `verified`.
- `01-construir-candidata.sql`: construcción de la tabla candidata desde ambos respaldos, sin activar el reemplazo.
- `02-activar-tras-validar.sql`: cambio de nombres que requiere validación previa.
- `03-revertir-si-fuera-necesario.sql`: reversión del cambio de nombres, sin borrar la versión reconstruida.
- `reconstruir-local.cjs`: ejecución concreta utilizada, con comprobaciones y requisitos previos; se niega a sobrescribir tablas auxiliares ya existentes.
- `inv_moves-reconstruido.sql`: exportación MySQL 5.7 de la tabla activa reconstruida, aproximadamente 66 MiB, con estructura e inserciones.
- Archivos `.sha256`: hashes de los scripts y la exportación SQL.

**Precaución:** la exportación `inv_moves-reconstruido.sql` contiene `DROP TABLE`/`CREATE TABLE` para `inv_moves` y sus datos. No contiene la base completa ni corrige existencias. Su importación debe validarse primero en un esquema de prueba nuevo; no se ejecutó contra otra base ni contra producción.

Los archivos de análisis previo están en el directorio hermano `analisis-inventario/`. Todos estos artefactos contienen información del negocio y están fuera del repositorio, en un directorio privado.

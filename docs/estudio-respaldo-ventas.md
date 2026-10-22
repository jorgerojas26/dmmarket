# Estudio del respaldo integral de ventas

## Alcance y método

Estudio realizado el 16/10/2026 exclusivamente sobre `bdsolser_md_nieto`, en el contenedor local `dm_mysql`, publicado en el puerto 3307 de esta Mac. No se consultó el servidor remoto ni se exportaron o importaron ventas. Las consultas fueron de lectura; no se modificaron datos, tablas ni objetos de la base.

Se revisaron columnas, claves, relaciones declaradas, trigger, funciones, discriminadores de documentos, coincidencias entre registros y conteos exactos con `COUNT(*)`. Los valores de `information_schema.TABLES.TABLE_ROWS` son estimados y no se utilizaron como conteos definitivos.

El esquema y sus registros permiten comprobar relaciones, pero no demostrar todas las escrituras del programa original al emitir una venta. Para eso sería necesario observar una emisión controlada o disponer de su código. En particular, no todas las tablas descritas se modifican en cada factura: algunas son catálogos, otras reciben movimientos posteriores y otras parecen estructuras auxiliares.

## Resumen

- MySQL 5.7.44.
- 99 tablas, todas InnoDB; aproximadamente 708 MiB de datos e índices, no de tamaño de archivo SQL.
- 10 relaciones de clave foránea declaradas.
- 56 tablas sin clave primaria, entre ellas `slavefact`, `pagos`, `inv_moves`, `caja_moves` y `cxcmoves`.
- Un trigger y tres funciones almacenadas. No se encontraron vistas ni eventos programados.
- Codificación de la base: `latin1`, intercalación `latin1_swedish_ci`.
- `lower_case_table_names=0`: los nombres de tabla distinguen mayúsculas y minúsculas.

**Recomendación:** para cumplir «todas las ventas con todos los datos involucrados», generar una copia lógica completa de las 99 tablas y restaurarla primero en una base nueva dentro de Docker. Una selección parcial de tablas puede servir para reportes, pero no garantiza una reconstrucción integral del estado comercial, financiero y de inventario.

## 1. Mapa de tablas involucradas

### 1.1. Facturas y detalle histórico

| Tabla | Filas | Papel y relación |
|---|---:|---|
| `masterfact` | 223.732 | Cabecera, clave primaria `IdFactura`. Conserva fecha, cliente, datos fiscales históricos, vendedor, depósito, divisa/tasa, caja, pagos resumidos, impresión y anulación. |
| `slavefact` | 911.768 | Líneas mediante `IdFactura`. Conserva descripción, producto, cantidades, precios en varias monedas, costos, descuentos, impuesto, tasa, importe de impuesto, unidad, origen y orden. |
| `slavefactser` | 0 | Seriales por factura, producto y orden; mantener aunque esté vacía. |

Las cabeceras abarcan del 20/01/2020 al 11/10/2026: 205.434 vigentes y 18.298 anuladas. Un respaldo histórico debe incluir ambas, sin filtrar fechas, estado ni existencia de referencias en catálogos.

Los datos históricos guardados en cabecera y detalle no deben sustituirse por valores actuales de clientes o productos. No basta con exportar el resultado del reporte de ventas: este agrega líneas y no contiene todos los campos originales.

### 1.2. Pagos, caja y bancos

| Tabla | Filas | Papel y relación |
|---|---:|---|
| `pagos` | 204.776 | Pagos por documento: `IdDocumento` y `Fuente`. Hay 204.689 registros `FAC`, 86 `NOE` y uno `NCF`. Todos los `FAC` encuentran su cabecera en `masterfact`. |
| `caja_moves` | 205.158 | Movimientos de caja. Los 204.693 registros con `Aux='FAC'` enlazan con `masterfact.IdFactura` a través de `Numero`, no de `NoDoc`. Incluye además movimientos de CxC, NOE y NCF. |
| `cajas` | 1 | Configuración y estado de caja; referencia lógica desde `NumCaja`, sin clave foránea declarada. |
| `cierrecajas` | 1 | Apertura/cierre, saldos y reportes de caja. No tiene una relación individual declarada con cada factura. |
| `mediosdepago` | 11 | Catálogo de medios utilizado por `pagos.IdMedio`. |
| `bancos` | 6 | Catálogo bancario, con identificador `Id_Banco`; referencias lógicas desde pagos/cabeceras. |
| `formaspago` | 5 | Catálogo adicional de formas de pago. Su uso exacto en la emisión no está demostrado por las claves declaradas. |
| `ctasbancarias` | 0 | Cuentas bancarias; conservar la estructura. |

No identificar un pago solo por número de documento: se necesita también su tipo/origen. No sumar como si fueran cobros distintos los importes resumidos de cabecera, `pagos`, caja y aplicaciones de cuentas por cobrar: pueden ser representaciones diferentes de un mismo hecho.

### 1.3. Inventario y seriales

| Tabla | Filas | Papel y relación |
|---|---:|---|
| `inv_moves` | 839.945 | Movimientos de inventario por producto y depósito. Los 767.394 registros `Origen='FAC', Tipo='SA'` encuentran su factura por `No_Move`. También hay compras, retiros, NOE, notas de crédito y movimientos `DPQ`. |
| `existencias` | 3.811 | Saldo actual por `IdDeposito` e `IdProducto`. Es estado compartido, no un detalle por factura. |
| `productos` | 3.815 | Catálogo con precios, costos, peso, grupo, proveedor, impuesto y existencia actual. |
| `depositos` | 1 | Catálogo de depósitos. |
| `inv_seriales` | 0 | Movimientos de seriales con `No_Move`, `Origen`, producto y depósito. |
| `seriales_dsp` | 0 | Disponibilidad/reserva de seriales. |
| `seriales_tmp`, `seriales_tmp_f` | 0 / 0 | Estructuras que parecen temporales por nombre y columnas; conservarlas en una copia completa. |
| `detcompuestos` | 0 | Componentes y cantidades de productos compuestos. |

Importar las facturas no equivale a reconstruir el inventario. Tampoco se debe volver a descontar stock después de importar una copia que ya incluye existencias y movimientos. Las compras, retiros, ajustes y demás operaciones explican parte del mismo saldo; por eso conviene copiar toda la base.

### 1.4. Comisiones: dependencia automática confirmada

| Tabla | Filas | Papel y relación |
|---|---:|---|
| `vendedor_comisiones` | 1 | Reglas actuales por vendedor y grupo. Claves foráneas a `vendedores` y `grupos`. |
| `fact_vendedor_comisiones` | 253.274 | Comisiones históricas para 92.707 facturas. Claves foráneas a `masterfact` y `grupos`. |

El trigger `freeze_vendedor_comision_on_fact_insert` se ejecuta **después de insertar en `masterfact`**. Copia a `fact_vendedor_comisiones` las reglas de `vendedor_comisiones` correspondientes a `NEW.IdVend`.

Consecuencias para la restauración:

1. Las comisiones históricas deben copiarse, no recalcularse con las reglas actuales.
2. Insertar facturas con ese trigger ya activo puede crear comisiones adicionales antes de importar las históricas.
3. `FOREIGN_KEY_CHECKS=0` no desactiva triggers.
4. La restauración debe hacerse sobre un esquema nuevo y con el orden de datos/objetos que genera un dump completo de `mysqldump`. No cargar primero un esquema con triggers y después un archivo de datos independiente sin tratamiento específico.

### 1.5. Cuentas por cobrar heredadas

| Tabla | Filas | Papel y relación |
|---|---:|---|
| `cxcmoves` | 3.428 | Movimientos por `IdFactura`: 1.886 `FAC`, 1.541 `PAGxFAC` y uno `N/C`. Todos encuentran una factura en `masterfact`. Conserva debe, haber, vencimiento, divisa y estado. |

No sustituir esta tabla por las estructuras nuevas ni deducir que es una copia equivalente de ellas.

### 1.6. Cuentas por cobrar nuevas

| Tabla | Filas | Papel y relación |
|---|---:|---|
| `cxc_documentos` | 241 | Documentos por cobrar. Todos son `TipoDoc='FAC'` y encuentran factura y cliente coincidente en `masterfact`. Tiene su propia clave `IdDocumento`, distinta del número de factura. |
| `cxc_movimientos` | 27 | Abonos por cliente, moneda, tasa, forma de pago y referencia. |
| `cxc_cruces` | 32 | Aplicaciones: enlaza `IdMovimiento` con `IdDocumento`, con importe y fecha. |
| `cxc_operaciones` | 8 | Historial de operaciones: cinco abonos y tres anulaciones. Incluye identificadores, referencias y datos JSON. |
| `cxc_cierres` | 0 | Cierres manuales y reaperturas vinculados a documentos y operaciones. |
| `cxc_retenciones` | 0 | Retenciones vinculadas a movimientos. |

Un mismo abono puede distribuirse entre varios documentos. Para un respaldo completo deben conservarse sus aplicaciones, referencias, anulaciones, cierres y contenido JSON, manteniendo los identificadores originales.

La decisión de dominio documentada establece que DMMarket será el registro principal de abonos; esto no autoriza a descartar el historial heredado ni a conciliar automáticamente sus saldos durante una importación.

### 1.7. Notas de crédito y datos fiscales

| Tabla | Filas | Papel y relación |
|---|---:|---|
| `masterncfact` | 1 | Cabecera de nota de crédito; enlaza la factura afectada por `IdFactura`. |
| `slavencfact` | 2 | Detalle por `IdNC`. |
| `slavencfactser`, `slavencfactcpser` | 0 / 0 | Estructuras de seriales de notas de crédito. La segunda no debe interpretarse como una cabecera adicional. |
| `lventas` | 135 | Libro de ventas. No tiene `IdFactura`: usa datos fiscales como `NumCF`, `SerialIF` y `NumFacAfec`. En esta copia los 135 registros son del 01/10/2025 y no contienen control ni serial fiscal utilizables para enlazar inequívocamente cada factura. |
| `lventasnc` | 0 | Libro de notas de crédito; tiene referencia `IdFactura`. |
| `impuestos` | 3 | Catálogo tributario; los detalles también conservan tasas e importes históricos. |

La nota de crédito también aparece en pagos (`Fuente='NCF'`), caja (`Aux='NCF'`) e inventario (`Origen='NCF', Tipo='EN'`). Un filtro limitado a `FAC` la dejaría fuera.

### 1.8. Estructuras paralelas y otros documentos de venta

| Tabla | Filas | Papel y precaución |
|---|---:|---|
| `masterfactcp` | 198.248 | Estructura paralela de cabeceras. Todos sus identificadores existen en `masterfact` y coinciden en fecha. Esto no demuestra igualdad de todos sus campos ni explica el propósito original de `cp`. |
| `slavefactcp` | 805.580 | Detalle de la estructura paralela; conservar por separado. |
| `slavefactcpser` | 0 | Seriales de la estructura paralela. |
| `masternoe` | 89 | Otro juego de documentos, con clave `IdNoe`: 83 vigentes y seis anulados. |
| `slavenoe` | 177 | Detalle por `IdNoe`. |
| `slavenoeser` | 0 | Seriales de esos documentos. |
| `masterpedido`, `slavepedido` | 0 / 0 | Pedidos; no se encontró una clave declarada que establezca su conversión a una factura concreta. |
| `masterorden`, `slaveorden` | 0 / 0 | Órdenes; misma limitación. |
| `masterpre`, `slavepre` | 3 / 16 | Presupuestos; conservar si se requiere el contexto comercial completo. |

No unir `masterfactcp` con `masterfact` para contar ventas: se duplicarían identificadores. No borrar las tablas paralelas suponiendo que son redundantes. Tampoco confundir documentos NOE con facturas FAC únicamente porque compartan un número.

### 1.9. Catálogos, configuración y auxiliares

Además de los catálogos ya mencionados, conservar:

- `clientes`, `vendedores`, `grupos`, `rutas`, `proveedores`.
- `grupos_clt`, `grupos_prov`, `grupos_vend`, `presentacion` y `servicios`.
- `divisas`: conservar también las tasas históricas presentes en los documentos.
- `empresas`, `configuracion`, `control` y `correlativos`: datos de empresa, opciones, control de acceso y numeración. No incrementar ni regenerar correlativos durante la restauración.
- `tabla_imagenes`: contiene nombres de archivos, no los archivos de imágenes. Un SQL no respalda recursos externos que pudieran existir.
- `log`, `relacionventascat`, `rpt_vtas`, `rpt_vtas_d` y `rptcapital`: estructuras auxiliares o de reportes por sus columnas y nombres; no se verificó que todas se actualicen al emitir una factura.
- `knex_migrations` y `knex_migrations_lock`: estado de las modificaciones del esquema. La importación no debe coincidir con una modificación de estructura activa.

Las demás tablas de compras, retiros, ajustes y traslados no son detalle de factura, pero participan del mismo estado de inventario y contexto del negocio. El inventario completo de las 99 tablas figura al final.

## 2. Integridad observada y límites de una importación parcial

La copia contiene seis cabeceras de factura sin detalle y 104.379 cabeceras cuyo `IdCliente` no encuentra registro en `clientes`. No se encontraron líneas de `slavefact` sin cabecera ni sin producto, ni cabeceras sin vendedor.

Son condiciones existentes que el respaldo debe conservar y documentar, no corregir silenciosamente. Exportar mediante uniones obligatorias con catálogos eliminaría parte del historial.

Riesgos principales:

1. **Identificadores repetidos entre bases:** una inserción sobre la base local existente puede colisionar con facturas, abonos, documentos y operaciones.
2. **Duplicados sin clave primaria:** repetir la importación puede duplicar líneas y movimientos, aunque las cabeceras no se dupliquen.
3. **Referencias polimórficas:** `IdDocumento`, `IdFactura` o `No_Move` no identifican por sí solos el tipo de documento; varias tablas de compras utilizan nombres similares.
4. **Estado compartido:** saldos de caja, existencias y catálogos no pueden atribuirse exclusivamente a las facturas sin considerar otros movimientos.
5. **Trigger de comisiones:** puede generar datos nuevos durante la carga.
6. **Compatibilidad:** preservar codificaciones, ceros iniciales, fechas históricas, precisión, JSON, seriales, claves autoincrementales y definidores de objetos almacenados. No convertir todo a números ni normalizar fechas durante el respaldo. La definición de `MedioPago` contiene referencias a `Pagos`, mientras la tabla se llama `pagos`: con distinción de mayúsculas activada debe revisarse su funcionamiento antes de activar el clon, sin modificar silenciosamente el respaldo.
7. **Restauración con claves desactivadas:** volver a activar `FOREIGN_KEY_CHECKS` no verifica retroactivamente los registros ya cargados; hay que ejecutar controles explícitos.
8. **Trazabilidad histórica limitada:** copiar el catálogo actual no recupera versiones pasadas que nunca se almacenaron. Se preserva toda la información que existe, no información histórica inexistente.

## 3. Solución propuesta

### Opción recomendada: copia lógica completa en una base nueva

Producir un archivo SQL con estructuras, datos originales de las 99 tablas, claves, índices, valores autoincrementales, trigger y funciones. Esto incluye todas las ventas y sus dependencias, aunque también copia compras y otros módulos.

Usar `mysqldump` 5.7 con:

- `--single-transaction --quick --skip-lock-tables`: una instantánea consistente de los datos InnoDB, sin mantener bloqueadas las escrituras durante todo el respaldo.
- `--routines --events --triggers`: incluir los objetos almacenados; actualmente no hay eventos.
- `--hex-blob --complete-insert`: preservar datos binarios y escribir nombres explícitos de columnas en los `INSERT`. Los lotes de varias filas siguen siendo válidos y más eficientes.
- `--no-tablespaces --set-gtid-purged=OFF`: no trasladar configuración de tablespaces o de replicación.
- `--default-character-set=utf8mb4`: codificación de transporte explícita; las definiciones originales de las tablas conservan `latin1`.
- Un único nombre de base, **sin `--databases`**, para no fijar el destino mediante `CREATE DATABASE`/`USE` en el archivo.

Mientras se genera el respaldo no deben ejecutarse `ALTER`, `DROP`, `TRUNCATE`, migraciones ni cambios de triggers/rutinas. La instantánea transaccional no protege frente a cambios concurrentes de estructura. Una ventana breve sin cambios de estructura/configuración es recomendable.

Restaurar primero en una base nueva, por ejemplo `bdsolser_ventas_import_20261016`, dentro de `dm_mysql`. No utilizar el esquema local actual como destino ni arrancar la aplicación contra el nuevo esquema antes de validar.

El SQL completo puede contener `DROP TABLE` y recreación de objetos: la protección debe estar en que el importador rechace un nombre de destino existente y en revisar que el archivo no redirija a otro esquema. Si luego se desea reemplazar la base local actual, será un paso distinto, autorizado y precedido por su propio respaldo.

### Alternativa: solo ventas y dependencias

Sería un exportador específico, no simplemente una lista de tablas o `mysqldump --where` aplicado a todo:

1. Definir si incluye FAC, NOE, notas de crédito, estructuras CP y documentos previos.
2. Seleccionar cabeceras sin filtrar anuladas ni descartar referencias faltantes.
3. Resolver detalles, seriales, comisiones, pagos, caja e inventario por identificador **y origen**.
4. Recorrer documentos por cobrar, cruces, abonos, retenciones y operaciones; un abono puede abarcar documentos fuera de una selección inicial.
5. Incorporar catálogos y configuración requeridos sin perder datos históricos del propio documento.
6. Resolver expresamente los datos compartidos sin asociación inequívoca, como ciertos libros fiscales, cierres y existencias.
7. Diseñar una política de colisiones e importación sobre una base vacía o una transformación completa y coherente de claves.

No recomiendo esta opción para el primer respaldo íntegro. Es útil si posteriormente se necesita reducir tamaño o transferir un subconjunto, pero requiere decisiones adicionales y validación específica.

## 4. Cómo haría el script

Implementaría un comando independiente ejecutado con Bun, por ejemplo `scripts/ventas-sql.mjs`, con tres modos. Es una propuesta: el archivo no se ha implementado en este estudio.

### `export`

1. Leer credenciales desde un archivo de configuración protegido, nunca incorporarlas al SQL ni mostrarlas en logs.
2. Validar versión, motores, permisos y ausencia de cambios de estructura planificados.
3. Ejecutar un único `mysqldump`, enviando su salida a un archivo `.partial` con permisos restrictivos.
4. Comprobar el código de salida; si falla, no publicar el archivo como respaldo válido.
5. Renombrar a `.sql` solo al terminar correctamente y calcular SHA-256.
6. Guardar un manifiesto con versión, opciones, objetos, tamaño y hash. Los conteos que se usen como referencia de validación deben corresponder a la misma instantánea.

No ejecutar un dump por tabla: cada proceso podría observar un momento diferente. Si hay actividad concurrente, comparar sus datos con conteos independientes del origen tampoco garantiza que ambos correspondan al mismo instante. La verificación puede restaurar el archivo en un esquema aislado y obtener de esa copia los conteos de referencia del artefacto; para contrastarlos con conteos del origen hay que coordinar una ventana sin escrituras o un mecanismo que comparta la misma instantánea.

El comando central sería equivalente al siguiente; no se ejecutó:

```bash
mysqldump --defaults-file="$SOURCE_CNF" \
  --single-transaction --quick --skip-lock-tables \
  --routines --events --triggers \
  --hex-blob --complete-insert \
  --no-tablespaces --set-gtid-purged=OFF \
  --default-character-set=utf8mb4 \
  bdsolser_md_nieto > respaldo.sql.partial
```

### `import`

1. Verificar SHA-256 y formato del artefacto generado por el exportador.
2. Validar el nombre del contenedor y un nombre de esquema nuevo; rechazar el esquema activo y cualquier destino ya existente.
3. Crear exclusivamente ese esquema nuevo con los valores de codificación/intercalación del origen.
4. Cargar el dump mediante el cliente MySQL 5.7 del contenedor y capturar cualquier error, sin `--force`.
5. No ejecutar ventas mediante la aplicación, no recalcular stock/saldos y no convertirlo en una mezcla con datos existentes.
6. Si falla, marcar el esquema como incompleto y no activarlo. La carga completa incluye DDL y no tiene reversión atómica global; cada reintento debe partir de un esquema nuevo o de una limpieza expresamente autorizada del esquema temporal.

Las credenciales temporales del cliente dentro del contenedor deben crearse con permisos restrictivos y eliminarse al finalizar. El respaldo contiene información de clientes y posiblemente datos de acceso; debe almacenarse en una ubicación privada y cifrarse si sale del equipo o del almacenamiento confiable.

### `verify`

- Inventario de tablas, columnas, índices, claves, trigger y funciones.
- Conteos exactos de todas las tablas frente al manifiesto del mismo artefacto.
- Facturas vigentes/anuladas y rangos de fechas.
- Importes y cantidades de detalle, pagos por origen, comisiones, movimientos de inventario y saldos de cuentas por cobrar.
- Relaciones y referencias huérfanas comparadas con la línea base; no exigir una integridad que el origen ya no tenía ni crear referencias falsas para hacer pasar la validación.
- Ausencia de comisiones adicionales generadas durante la restauración.
- Preservación de claves y siguientes valores autoincrementales.
- Si se requiere validación fila a fila, utilizar hashes con una representación canónica de todos los campos y multiplicidad de filas, incluso para tablas sin clave primaria; no deduplicar ni depender únicamente de la suma de importes.

Los hashes del archivo verifican que no cambió el respaldo. No sustituyen la verificación lógica de la base restaurada.

## 5. Relación con el respaldo existente del proyecto

`dumpDatabase`, en `packages/backend/backups.js`, ya exporta toda la base con rutinas, eventos y triggers. Actualmente usa `--lock-all-tables`, `--databases` y compresión gzip.

Puede aprovecharse su manejo seguro de credenciales y archivos, pero no usaría su salida sin adaptación para este flujo de importación con otro nombre:

- `--databases` fija el esquema dentro del SQL.
- `--lock-all-tables` bloquea escrituras; para esta copia local completamente InnoDB se puede proponer `--single-transaction`, sujeto a volver a comprobar los motores cuando se ejecute el respaldo real.
- La importación aislada y las verificaciones anteriores son pasos adicionales.

## 6. Qué no se ha hecho

No se ha conectado al remoto, exportado ventas, insertado registros, borrado tablas, recalculado saldos ni modificado el entorno Docker. Este documento es el estudio y el diseño previo a implementar y ejecutar el script.

## Anexo: inventario completo y conteos exactos

Los conteos corresponden al estudio local, no a una promesa de los valores que tenga otra instantánea futura.

| Tabla | Filas |
|---|---:|
| `bancos` | 6 |
| `benef` | 0 |
| `cajas` | 1 |
| `caja_moves` | 205.158 |
| `centrocostos` | 0 |
| `cierrecajas` | 1 |
| `clientes` | 2.170 |
| `conceptocostos` | 0 |
| `configuracion` | 1 |
| `control` | 4 |
| `correlativos` | 9 |
| `ctasbancarias` | 0 |
| `cxcmoves` | 3.428 |
| `cxc_cierres` | 0 |
| `cxc_cruces` | 32 |
| `cxc_documentos` | 241 |
| `cxc_movimientos` | 27 |
| `cxc_operaciones` | 8 |
| `cxc_retenciones` | 0 |
| `cxpmoves` | 0 |
| `depositos` | 1 |
| `detcompuestos` | 0 |
| `divisas` | 5 |
| `empresas` | 1 |
| `existencias` | 3.811 |
| `fact_vendedor_comisiones` | 253.274 |
| `formaspago` | 5 |
| `grupos` | 32 |
| `grupos_clt` | 1 |
| `grupos_prov` | 2 |
| `grupos_vend` | 1 |
| `impuestos` | 3 |
| `inv_moves` | 839.945 |
| `inv_seriales` | 0 |
| `knex_migrations` | 1 |
| `knex_migrations_lock` | 1 |
| `log` | 17.764 |
| `lventas` | 135 |
| `lventasnc` | 0 |
| `masterauto` | 899 |
| `mastercomp` | 14.917 |
| `masterfact` | 223.732 |
| `masterfactcp` | 198.248 |
| `mastergastos` | 0 |
| `mastermanu` | 0 |
| `masternccomp` | 0 |
| `masterncfact` | 1 |
| `masternoe` | 89 |
| `masternor` | 0 |
| `masterorden` | 0 |
| `masterpedido` | 0 |
| `masterpre` | 3 |
| `masterret` | 1.744 |
| `mastertras` | 0 |
| `mediosdepago` | 11 |
| `pagos` | 204.776 |
| `presentacion` | 0 |
| `productos` | 3.815 |
| `proveedores` | 328 |
| `relaciongastoscat` | 0 |
| `relacionventascat` | 21 |
| `rptcapital` | 0 |
| `rpt_vtas` | 0 |
| `rpt_vtas_d` | 0 |
| `rutas` | 10 |
| `seriales_dsp` | 0 |
| `seriales_tmp` | 0 |
| `seriales_tmp_f` | 0 |
| `servicios` | 0 |
| `slaveauto` | 2.003 |
| `slaveautoser` | 0 |
| `slavecomp` | 51.648 |
| `slavecompser` | 0 |
| `slavefact` | 911.768 |
| `slavefactcp` | 805.580 |
| `slavefactcpser` | 0 |
| `slavefactser` | 0 |
| `slavegastos` | 0 |
| `slavemanu` | 0 |
| `slavemanuser` | 0 |
| `slavenccomp` | 0 |
| `slavenccompser` | 0 |
| `slavencfact` | 2 |
| `slavencfactcpser` | 0 |
| `slavencfactser` | 0 |
| `slavenoe` | 177 |
| `slavenoeser` | 0 |
| `slavenor` | 0 |
| `slavenorser` | 0 |
| `slaveorden` | 0 |
| `slavepedido` | 0 |
| `slavepre` | 16 |
| `slaveret` | 3.069 |
| `slaveretser` | 0 |
| `slavetras` | 0 |
| `slavetrasser` | 0 |
| `tabla_imagenes` | 0 |
| `vendedores` | 12 |
| `vendedor_comisiones` | 1 |

# Auditoría de consultas de facturas y relaciones opcionales

Fecha: 2026-10-16.

## Estado tras las correcciones

**Corregido y validado el 2026-10-16.** Las ubicaciones y reproducciones del resto del documento describen el estado detectado antes de aplicar el arreglo.

Cambios aplicados:

- Detalles de facturas y notas de entrega con cliente y vendedor opcionales, sin falsos 404 por catálogo.
- Cálculos financieros de Clientes y listados que incluyen identidades históricas/no registradas, además de conservar clientes actuales sin ventas. Los IDs de cabecera no se descartan por no existir en el catálogo.
- Distribuciones de ventas, categorías, productos y proveedores con etiquetas para registros ausentes y sin exclusiones posteriores por falta de nombre.
- Agrupación por IDs del documento y normalización de identidades, también para consultar los grupos sin ID desde sus ventanas de detalle.
- Agregados globales de proveedores con filas de atribución no registrada/no determinable. Sus detalles mantienen el alcance demostrable y no asignan ventas arbitrariamente.
- Reportes de productos, vendedores, categorías y compras sin enlaces obligatorios a fichas opcionales.
- Comisiones y valoración de inventario no determinables se muestran como «No disponible»; no se sustituyen por valores supuestos al faltar la ficha del producto.
- Cartera y total recibido que conservan clientes históricos sin ficha. El detalle de esas cuentas es de solo lectura; la previsualización y ejecución siguen exigiendo un cliente registrado, además de las validaciones previas de titularidad y anulación.
- Despacho conserva todas las líneas, incluso dos líneas idénticas. Se elimina una agrupación que las fusionaba sin sumar cantidades y se evita redondear precio/cantidad antes de calcular el importe.

### Comprobaciones posteriores

- `bun run test`: **409 pruebas del servicio y 363 de la interfaz aprobadas**, 15 omitidas previamente. No se agregaron casos unitarios; se ajustaron los dobles y las expectativas de las pruebas existentes que imponían la exclusión anterior o identificaban productos por nombre en lugar de su ID.
- Compilación de producción de la interfaz: correcta.
- Lint de consultas y auxiliar de identidades: correcto. La comparación del resto del código fuente modificado con la versión anterior mantiene los mismos 12 diagnósticos preexistentes de la interfaz, sin nuevos errores.
- Revisión estática: no quedan enlaces obligatorios a clientes, vendedores, productos, grupos o proveedores en los reportes de facturas revisados. Se mantienen enlaces estructurales y filtros explícitos.
- 57 peticiones de comprobación para facturas/notas, clientes, proveedores, productos, categorías, compras, detalle, filtros, paginación y lectura de cartera; contraste con los importes de referencia de esta auditoría.
- Factura `0000220243`: detalle 200, importe 1,05; nota `0000000005`: detalle 200, importe 3,60.
- Facturas del período principal: se conservan las 3.325 ventas, incluidas las 1.270 sin cliente registrado, y los 553.383,88 de referencia. Las sumas del listado de clientes y el total de proveedores vuelven a incluir los importes excluidos.
- Notas del período histórico: se conservan los 83 documentos y los 2.388,25 de referencia.
- Factura `0000223157` en Despacho: antes se devolvían 55 líneas y 931,11; ahora devuelve las 56 líneas y 937,66, coincidiendo con su detalle y el total filtrado.
- Navegador: se abre la fila «Sin ID» de Clientes, carga su historial y permite abrir una de sus facturas sin error.
- Cartera: comprobada la rama de cliente ausente mediante una consulta de catálogo filtrada, sin eliminar registros. Permite leer los documentos, devuelve cobros deshabilitados y rechaza la previsualización de un abono. No se registraron operaciones financieras ni se modificaron datos para esa comprobación.

El redondeo independiente de cada categoría y las diferencias de acumulación de los importes almacenados en punto flotante pueden producir variaciones de uno o dos centavos frente a redondear una sola suma. Esto se distingue de una factura/línea omitida; no se reparten centavos artificialmente entre categorías para forzar coincidencias.

La auditoría queda resuelta. La publicación se gestiona por separado mediante el proceso de release.

## Conclusión

La revisión inicial confirmó que la corrección de Ventas → Desglose estaba bien aplicada a sus dos tablas, pero no se había extendido a todos los consumidores de facturas. Se encontraron omisiones por `INNER JOIN`, por partir del catálogo y limitar los IDs admitidos, y por descartar resultados en JavaScript cuando no se encuentra un nombre.

El caso más urgente es el detalle general de factura: el listado conserva una factura sin cliente registrado, pero abrirla devuelve 404. Lo utilizan el desglose de ventas, la ficha del cliente, los nuevos detalles de vendedor/producto y la consulta de facturas desde cuentas por cobrar.

La fase inicial de auditoría no cambió consultas ni datos. Las correcciones y comprobaciones posteriores se registran en el bloque de estado anterior; la release permanece pausada.

## Método y alcance

- Revisión de controladores, modelos, auxiliares y SQL que consultan facturas, notas de entrega y sus detalles.
- Revisión adicional del módulo de compras y de las restricciones de cuentas por cobrar.
- Seguimiento de las rutas y de sus consumidores visibles; se distinguen también consultas y vistas antiguas todavía presentes.
- Comprobaciones en la base local exclusivamente con lecturas y peticiones GET, sin inserciones, cambios, eliminaciones, migraciones ni cambios de configuración.
- Período principal: 2026-09-16 a 2026-10-16, sin filtros adicionales, facturas no anuladas con líneas de detalle.
- Las notas de entrega no tienen movimientos en ese período. Para ellas se comprobó el período histórico 2020-02-27 a 2025-01-31.

## 1. Corrección de referencia: confirmada

Ubicación: `packages/backend/controllers/sales.js:6-16`, corrección original `d7b3e47`.

La base compartida `withSalesBase` utiliza:

- Líneas de factura como origen.
- Enlace obligatorio a su cabecera y condición de no anulada.
- `LEFT JOIN` a clientes, vendedores, productos y grupos.

`GET_FACTURAS` y `GET_PRODUCTOS` reutilizan esa base y los mismos filtros para datos, conteo y totales. Los IDs de cliente y vendedor se filtran desde la cabecera, no desde el catálogo. Los productos se agrupan por el ID de la línea, por lo que dos productos sin ficha no se fusionan por tener ambos un nombre nulo.

El listado muestra etiquetas de registro no disponible. El peso de productos no conocidos queda sin determinar en vez de inventar un valor.

### Comprobación local

| Resultado | Facturas | Ventas | Utilidad |
| --- | ---: | ---: | ---: |
| Consulta directa de líneas y cabeceras vigentes | 3.325 | 553.383,88 | 43.866,54 |
| Ventas → Desglose, facturas | 3.325 | 553.383,88 | 43.866,54 |
| Ventas → Desglose, productos | No aplica: agrupa productos | 553.383,88 | 43.866,54 |
| Despacho, sin filtro de ruta | 3.325 | 553.383,88 | 43.866,54 |
| Indicadores principales del dashboard de ventas | 3.325 | 553.383,88 | 43.866,54 |

Los importes se expresan en dólares.

### Límite de esta corrección

Parte de las líneas, por lo que no incorpora cabeceras sin detalle. Es un asunto distinto de perder una venta por falta de catálogo: decidir si se cuentan facturas vacías con monto cero requiere una definición consistente entre reportes. En la muestra no hay facturas vigentes vacías.

## 2. Incidencia real de datos relacionados ausentes

Sobre el período principal, comprobado con enlaces opcionales:

| Relación ausente | Facturas afectadas | Importe de líneas afectadas |
| --- | ---: | ---: |
| Cliente | 1.270 | 22.512,70 |
| Vendedor | 0 | 0,00 |
| Producto | 0 | 0,00 |
| Grupo, existiendo el producto | 66 | 114,86 |
| Proveedor, existiendo el producto | 106 | 257,87 |

De las 1.270 facturas sin cliente registrado, 1.145 no tienen ID de cliente y 125 referencian un ID no encontrado en el catálogo. No se debe asumir que todos estos casos son clientes eliminados: también hay ventas sin cliente identificado.

Las poblaciones pueden solaparse: no deben sumarse estos importes como si fueran pérdidas independientes. Tampoco debe confundirse un importe de líneas con el total completo de una factura que contiene otras líneas válidas.

## 3. Hallazgos

### A. Prioridad crítica: detalle general de factura devuelve un falso 404

- Ubicación: `packages/backend/controllers/invoices.js:127-175`.
- Enlaces problemáticos: `INNER JOIN clientes` en la línea 148 e `INNER JOIN vendedores` en la 149.
- Efecto: desaparecen todas las líneas si falta cualquiera de esos registros, y el controlador interpreta que la factura no existe.
- Afecta a las distintas pantallas que abren el detalle compartido, incluidas las recientemente añadidas.

Reproducción local:

1. `GET /api/sales/facturas?from=2026-09-16&to=2026-10-16&showNoe=false&search=0000220243` devuelve la factura, monto 1,05 y utilidad 0,15.
2. `GET /api/invoices/0000220243/detail?showNoe=false` devuelve 404 con `Invoice not found`.

La solución debe conservar las líneas y utilizar nombres de la cabecera o etiquetas de registro no disponible cuando falte el catálogo. El 404 debe depender de que realmente no exista la factura vigente, no de que falte su cliente o vendedor.

### B. Prioridad alta: cálculos de Clientes excluyen ventas sin cliente registrado

Ubicaciones:

- `packages/backend/controllers/clients/dashboard.js:155-172`: `allClientsRevenueQuery` exige un cliente registrado. Alimenta segmentos, concentración, clasificación por ventas/utilidad y top de clientes.
- `packages/backend/controllers/clients.js:32-79`: `GET_BEST_CLIENTS` y `GET_BEST_CLIENTS_PER_PRODUCT` exigen cliente por `INNER JOIN` y agrupan por el ID del catálogo.
- `packages/backend/controllers/clients.js:86-128`: `MONTHLY_AVERAGE` también exige ficha del cliente, aunque su ID ya está en la cabecera.
- `packages/backend/controllers/clients.js:350-398`: `GET_CLIENTS_LIST` parte del catálogo y limita los agregados con `whereIn` a sus IDs. Aquí el efecto es equivalente a un enlace obligatorio aunque no aparezca un `INNER JOIN clientes` en la consulta de importes.

Comprobación local:

| Consulta | Ventas devueltas |
| --- | ---: |
| Desglose de ventas completo | 553.383,88 |
| Segmentos y clasificación del dashboard de clientes | 530.871,17 |
| Suma de ventas del listado de clientes | 530.871,17 |
| Listado de mejores clientes | 530.871,17 |

El dashboard ya conserva IDs sin catálogo en las consultas de actividad actual y anterior mediante `LEFT JOIN`, pero los excluye del cálculo de ingresos actual. Las poblaciones internas, por tanto, no son consistentes.

Hay que separar dos necesidades: un directorio puede querer mostrar clientes actuales, incluidos los que no vendieron; un reporte financiero debe incluir también ventas sin ficha. La corrección debe definir filas o grupos de clientes no registrados sin perder el directorio ni fusionar todos los IDs desconocidos.

Los rankings por producto y la consulta mensual siguen publicados como rutas; algunos de sus consumidores son componentes antiguos y no aparecen en el menú actual. El dashboard y el desglose de clientes sí son pantallas activas.

### C. Prioridad alta: dashboard de ventas descarta dimensiones opcionales

Ubicaciones: `packages/backend/controllers/dashboard.js`.

- `productsQuery`, líneas 39-53: `INNER JOIN productos` elimina líneas de productos sin catálogo antes de calcular productos y categorías.
- `computeBestEmployee`, líneas 129-139: `if (!name) continue` descarta vendedores sin nombre recuperado del catálogo.
- `computeTopClients`, líneas 142-158: la misma exclusión para clientes.
- `computeGroupSales`, líneas 172-190: descarta grupos cuyo nombre no se encuentra.
- `fetchSalesParetoRows`, líneas 256-287: depende de `INNER JOIN productos`.
- `fetchUnsoldPurchasesRows`, líneas 291-320: las compras utilizadas por el análisis también exigen producto.

No basta con cambiar enlaces SQL: las exclusiones posteriores en JavaScript reproducen el mismo problema.

Los indicadores principales de venta son correctos respecto a los catálogos porque se calculan sin exigirlos. En cambio, el gráfico completo por categorías devuelve 553.269,00 en la muestra: no distribuye todas las ventas que sí aparecen en esos indicadores. Los rankings limitados a los primeros 30 no se evalúan comparando su suma con el total, ya que su límite es intencional.

El análisis de productos comprados durante el período y la separación de productos nuevos tienen restricciones de población expresas que deben conservarse; no son omisiones por catálogo.

### D. Prioridad alta para totales globales: proveedores no registrados y atribución de productos

Ubicaciones: `packages/backend/controllers/providers.js`.

- `GET_PROVIDERS_LIST`, líneas 64-65, 104-124 y combinación con el catálogo: solo admite proveedores actuales y ventas atribuibles a productos registrados.
- `GET_BEST_PROVIDERS`, líneas 220-229: exige producto y proveedor.
- `GET_PROVIDER_SUMMARY`, líneas 276-290: el cálculo de mejor vendedor todavía exige ficha del vendedor; las pestañas de vendedores y clientes ya usan enlaces opcionales para estos nombres.
- Consultas del detalle de proveedor, desde la línea 307: conservan clientes y vendedores ausentes, pero dependen del producto para determinar `productos.Proveedor`.
- `GET_SALE_DETAIL`, líneas 890-902: exige producto y filtra por su proveedor.

El total de ventas del listado de proveedores es 553.126,00 en la muestra, frente a 553.383,88 en el desglose general. Hay líneas por 257,87 cuyo proveedor no está registrado.

Matiz importante: en el detalle de un proveedor, cambiar a `LEFT JOIN productos` y mantener `WHERE productos.Proveedor = ...` seguirá descartando productos ausentes. Además, si se perdió el único dato que atribuye el producto a un proveedor, no se debe adjudicar arbitrariamente a ninguno. El agregado global necesita una categoría visible de proveedor no registrado/no determinable, y el detalle específico debe conservar únicamente la atribución que se pueda demostrar.

### E. Riesgo en reportes de vendedor y comisiones

- Ubicación: `packages/backend/controllers/employees/index.js:76-111`.
- `GET_SALES` usa `INNER JOIN productos` en la línea 100 para llegar al grupo de comisión.
- Puede eliminar líneas y reducir ventas, utilidad y comisión; si todas las líneas carecen de producto, desaparece la factura.
- El cliente mostrado ya se toma de la cabecera, por lo que no exige una ficha de cliente.
- No hubo productos ausentes en la muestra principal; el riesgo está confirmado por la consulta, no por una pérdida observada en ese período.
- La vista antigua de vendedores sigue en el código, pero no está incluida en las vistas actuales de Ventas.

Una corrección debe conservar ventas y utilidad sin inventar comisiones cuando no se pueda reconstruir el grupo o el porcentaje aplicable.

### F. Riesgo en consultas de productos y categorías de facturas antiguas

- `packages/backend/controllers/invoices.js:27-46`: conteo de productos con `INNER JOIN productos`.
- `packages/backend/controllers/invoices.js:101-119`: distribución por grupos con `INNER JOIN productos` y `grupos`.
- `packages/backend/models/invoice.js:178-215`: `GET_SALES_QUERY`, producto obligatorio y grupo obligatorio si se filtra por grupo.
- `packages/backend/models/invoice.js:220-264`: `GET_BY_GROUP_QUERY` y `GET_SALES_BY_CATEGORY` exigen ambas fichas.

Algunas rutas permanecen como compatibilidad de vistas anteriores. No todas se consumen desde el menú actual, pero siguen activas y pueden devolver información incompleta.

`GET /api/invoices/group` devuelve 553.269,00 en vez de distribuir el total completo de la muestra.

### G. Mismo patrón en compras

Aunque no es la incidencia original de ventas, el módulo hermano presenta el mismo riesgo sobre sus facturas:

- `packages/backend/controllers/purchases.js:24-78`: rankings y gráfico por categorías exigen proveedor, producto o grupo.
- `packages/backend/controllers/purchases.js:140-164`: análisis de productos comprados con producto obligatorio.
- `packages/backend/controllers/purchases.js:211-309`: conteo, listado y totales de facturas exigen proveedor y producto, aunque su función no sea filtrar por ellos.
- `packages/backend/controllers/purchases.js:317-396`: desglose de productos con las mismas dependencias.
- `packages/backend/controllers/providers.js:833-852`: el detalle de compra exige ficha del producto para mostrar sus líneas.

En la muestra local hay 212 facturas de compra por 525.156,59 y no se encontraron proveedores, productos ni grupos ausentes. En este módulo la omisión es potencial, no demostrada con esos datos.

### H. Cuentas por cobrar: lectura histórica y validación financiera no deben confundirse

Ubicación: `packages/backend/receivables.js`.

- `documents`, líneas 117-126, ya usa `LEFT JOIN masterfact`: conserva el documento de cartera aunque no encuentre su factura.
- `clientQuery`, líneas 342-377, parte del catálogo de clientes y enlaza sus agregados. No presenta cuentas cuyo cliente no esté registrado.
- El total mensual recibido, líneas 408-415, también exige cliente mediante `join`.
- `context`, líneas 130-133, devuelve 404 si no existe el cliente.
- `eligible`, líneas 83-88, y las condiciones del agregado verifican la relación real entre el documento de cartera y su factura vigente.

El riesgo de excluir historia de un cliente que deje de estar registrado debe revisarse para las consultas y resúmenes de lectura. Pero no se deben relajar automáticamente las comprobaciones de titularidad, anulación y habilitación de cobros: son controles financieros, no enlaces de presentación.

En la base local se revisaron 241 documentos de cartera y ninguno carecía de cliente; no se cuantificó una pérdida actual aquí.

## 4. Consultas ya correctas o con restricciones justificadas

- **Ventas → Desglose**: enlaces opcionales a los cuatro catálogos y totales coherentes.
- **Despacho sin ruta**: `packages/backend/models/invoice.js:14-176` conserva productos y grupos ausentes; el nombre del cliente procede de la cabecera.
- **Filtro de ruta en despacho**: el enlace de `models/invoice.js:56` solo se aplica al seleccionar una ruta. Excluir registros cuya ruta no se pueda conocer es una restricción del filtro, no una pérdida en la consulta sin filtros. Convertirlo a `LEFT JOIN` conservando `WHERE clientes.Ruta = ...` no cambiaría ese resultado.
- **Ventas y resumen de un cliente concreto**: `controllers/clients.js:143-295` no exigen la ficha del cliente para el importe y las ventas usan `LEFT JOIN vendedores`. Se consulta por el ID de cabecera; sí se mantiene el alcance de ese cliente.
- **Histórico de última factura**: `utils/client-history.js:5-16` usa cabeceras y `LEFT JOIN` a líneas, conservando incluso fechas de facturas vacías.
- **Pestañas de clientes y vendedores del proveedor**: ya preservan esas dos dimensiones opcionales, dentro del alcance de productos atribuibles a ese proveedor.
- **Inventario**: `controllers/products.js:38-78` utiliza enlaces opcionales para grupo y proveedor. Su población es el catálogo de productos, no las facturas.
- **Catálogos y selectores**: consultar únicamente rutas oficiales, vendedores o clientes registrados no equivale a calcular ventas; no se deben cambiar por el mero hecho de usar un enlace obligatorio.
- **Relación línea → cabecera vigente, relaciones entre movimientos financieros y selección de IDs ya filtrados**: no son fichas opcionales de presentación. Un `LEFT JOIN` mal aplicado podría incluir líneas huérfanas o de facturas anuladas.

## 5. Notas de entrega: el defecto también está presente

La misma lógica se selecciona dinámicamente para `masternoe` y `slavenoe`.

En el período histórico comprobado:

- 83 notas vigentes con detalle, por 2.388,25.
- 51 notas sin cliente registrado, con importe de 632,59.
- 2 notas con líneas de productos cuyo grupo no está registrado.
- El desglose devuelve las 83 notas y su total completo.
- Abrir `GET /api/invoices/0000000005/detail?showNoe=true` devuelve el mismo falso 404.

No había notas de entrega en el período principal de septiembre-octubre de 2026. Los dos períodos no deben mezclarse para calcular diferencias.

## 6. Criterio de corrección recomendado

1. Partir de la cabecera o las líneas reales del documento, no del catálogo que le da nombre.
2. Mantener la validación de cabecera vigente, tipo de documento y alcance explícito del reporte.
3. Enlazar catálogos de presentación con `LEFT JOIN` y usar nombres históricos cuando existan o etiquetas de registro no disponible.
4. Agrupar por los IDs guardados en el documento o sus líneas; no agrupar todos los IDs desconocidos por el `NULL` del catálogo.
5. Revisar también los `WHERE`, `whereIn`, filtros de nombres en JavaScript y el tratamiento de IDs nulos en conteos: cambiar un `JOIN` no resuelve esas exclusiones.
6. Compartir población y filtros entre datos, conteo y totales. No corregir solo la tabla y dejar el indicador, la impresión o el gráfico con la consulta anterior.
7. Mostrar categorías de datos no registrados/no atribuibles en agregados globales, sin inventar proveedor, ruta, peso o comisión.
8. Validar cada consulta con y sin filtros y con paginación, impresión y ambos tipos de documento.

### Orden sugerido antes de retomar la release

1. Detalle general de factura y nota de entrega: resolver los falsos 404.
2. Ingresos y listados financieros de Clientes: alinear la población con la de facturas vigentes.
3. Distribuciones del dashboard de ventas y agregados globales de proveedores.
4. Compras y endpoints antiguos de productos, grupos y vendedores.
5. Lecturas históricas de cartera, separadas de cualquier cambio a las reglas de cobranza.

## 7. Precisión y límites

- Los importes de relaciones ausentes se midieron directamente sobre líneas. Los listados que redondean cada grupo antes de sumarlo pueden diferir uno o varios centavos respecto al total agregado una sola vez; por eso algunas diferencias entre respuestas no coinciden exactamente al centavo con la medición de líneas excluidas.
- Una consulta es riesgosa aunque los catálogos locales estén completos hoy. No se insertaron registros ficticios ni se borraron fichas para reproducir esos casos.
- Los casos de cliente ausente y categoría ausente sí están demostrados con datos existentes. Los casos de producto o vendedor ausente son riesgos del código sin incidencia en la muestra principal.
- No se ejecutaron operaciones de cobro ni se modificó su validación.
- La fase inicial produjo el inventario y la evidencia sin cambiar consultas. El estado actual del arreglo y su validación se detalla al principio del documento.

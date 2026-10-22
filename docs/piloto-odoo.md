# Piloto de Odoo con datos de Solser

18/10/2026. **Piloto cargado en la instancia real y validado para explorar datos y flujos. No es una migración terminada ni una instalación lista para producción.**

## Entradas para probarlo

En Odoo aparece la aplicación **Piloto Solser**:

- [Ventas históricas FAC](https://dmmarket.odoo.com/odoo/action-902): lista, tabla dinámica y gráficos.
- [Compras históricas](https://dmmarket.odoo.com/odoo/action-903): lista, tabla dinámica y gráficos.
- [Inventario y catálogo](https://dmmarket.odoo.com/odoo/action-904).
- [Clientes, proveedores y vendedores](https://dmmarket.odoo.com/odoo/action-905).
- [Muestra histórica NOE](https://dmmarket.odoo.com/odoo/action-906), separada de FAC.
- [Factura de prueba en borrador](https://dmmarket.odoo.com/odoo/invoicing/1): USD 9,92, sin confirmar ni cobrar.

### Cómo ver gráficos y reportes

1. Abrir Ventas históricas, Compras históricas o NOE dentro de Piloto Solser.
2. Elegir el icono **Gráfico** arriba a la derecha. Están disponibles barras, líneas y gráfico circular.
3. En el selector de medida, elegir ventas/monto, utilidad (FAC/NOE), cantidad o peso del origen. El porcentaje por línea se oculta como medida sumable para no presentar una suma de porcentajes como margen promedio.
4. En la búsqueda, usar **Agrupar por** para fecha, documento, producto, grupo, proveedor y, en ventas, cliente, vendedor o ruta.
5. Para un desglose cruzado, cambiar a **Tabla dinámica**. El botón **Hoja de cálculo** permite llevar el gráfico a una hoja; no significa que se hayan recreado todos los tableros/KPIs del proyecto.

Se agregaron dos vistas `graph` nativas (`2630` ventas y `2631` compras), reutilizando la de ventas para NOE, sin modificar registros comerciales. Se comprobó el renderizado de las tres acciones. Los reportes nativos de ventas confirmadas/contabilidad no deben confundirse con esta historia importada en borrador.

Para registrar operaciones nuevas se utilizan las aplicaciones estándar **Ventas**, **Compras**, **Inventario**, **Punto de venta** y **Facturación**. Los reportes «históricos» son una fotografía de Solser: **no incorporan automáticamente las operaciones nuevas de Odoo**. Tampoco convierten los borradores importados en ventas contabilizadas.

**No confirmar masivamente los documentos SOL-PILOT:** las operaciones históricas ya ocurrieron en Solser. Confirmarlas/entregarlas de nuevo puede duplicar movimientos. El stock se cargó como saldo de apertura, no reproduciendo esas entregas y recepciones.

## Decisiones respetadas

- Únicamente `https://dmmarket.odoo.com`: sin staging, otra instancia ni otra compañía.
- Origen local del proyecto, maestros y período representativo; avanzar sin nuevas preguntas.
- MCP para la carga y las consultas; administración inicial de campos, vistas y ajuste de inventario mediante la sesión administrativa y la API web estándar.
- No se modificó Solser, ejecutaron sus migraciones ni consultó el servidor remoto.
- No se publicaron facturas, ejecutaron cobros ni invocaron acciones de envío de documentos a clientes.

## Acceso MCP

Odoo 20.0+e Enterprise tiene servidor nativo en `/mcp`. Pi utiliza OAuth CIMD y el cliente permitido `https://pi.dev/oauth/client.json`. DCR continúa desactivado. No se instaló un conector de terceros ni se copiaron contraseñas al repositorio.

La configuración global está en `~/.pi/agent/mcp.json`, servidor `odoo-dmmarket`. Se habilitaron cinco herramientas de consulta más las nativas **Create Records** y **Update Records** para completar el piloto. No se habilitaron eliminación ni ejecución genérica de código por MCP. Las credenciales OAuth permanecen en el almacén privado de Pi, modo 0600.

El token tiene alcance `mcp`: **no es una clave JSON-2**. La API JSON-2 rechazó correctamente ese token. Los modelos técnicos permanecen restringidos por el MCP; los cambios de configuración se hicieron por la vía administrativa normal, no intentando eludir esa restricción.

Para reconocer las herramientas nuevas en una sesión Pi que todavía tenga la lista anterior en caché puede hacer falta recargar/reconectar esa sesión. La carga ya se realizó mediante el protocolo MCP directamente, con la autorización OAuth existente.

Referencias oficiales:

- [Servidor MCP de Odoo 20](https://www.odoo.com/documentation/20.0/applications/productivity/ai/mcp_server.html).
- [API externa JSON-2 y condiciones de plan](https://www.odoo.com/documentation/20.0/developer/reference/external_api.html).
- [Impresoras de tickets](https://www.odoo.com/documentation/19.0/applications/sales/point_of_sale/hardware_network/receipt_printers.html). Verificar compatibilidad contra la versión y el equipo concretos.

Que MCP funcione durante la prueba no demuestra todas las condiciones de una futura suscripción. La instancia anunció trece días de prueba restantes al comenzar.

## Origen y período

Base `bdsolser_md_nieto`, MySQL 5.7.44 en `127.0.0.1:3307`, configurada en el backend. Última venta: 11/10/2026. Período elegido: **05/10/2026–11/10/2026**, inclusivo.

No se sustituyó por `respaldo_2` o `conciliacion`, que corresponden a otra fecha y tienen diferencias documentadas en [conciliacion-local.md](conciliacion-local.md).

| Maestro original | Registros |
|---|---:|
| Productos | 3.815 |
| Clientes | 2.170 |
| Proveedores | 328 |
| Grupos | 32 |
| Vendedores | 12 |
| Rutas | 10 |
| Depósitos | 1 |

El período contiene 851 ventas FAC vigentes, 3.643 líneas, 53 compras y 209 líneas. Se excluyeron de la carga de documentos vigentes 28 ventas anuladas con 274 líneas; se conservan en la extracción original.

No existen NOE en esa semana. Se cargó aparte una muestra de cinco documentos con diez líneas, del 23 al 31/01/2025. Su monto 64,30 y utilidad 8,90 se comprobaron por separado. No se suman al control FAC.

Las cabeceras originales guardan fecha, no hora. Para los borradores se utilizó mediodía de Caracas, 16:00 UTC; no se reconstruyó una hora real de venta.

## Qué quedó cargado

| Entidad del piloto | Registros / tratamiento |
|---|---|
| Productos | 3.815 variantes, códigos internos y precios/costos en USD |
| Contactos | 2.516: 2.174 clientes, 330 proveedores y doce vendedores de referencia |
| Grupos y categorías POS | 33 de cada uno |
| Unidades | UND, BUL, CAJ y una unidad explícita para el código vacío; independientes |
| Relaciones producto/proveedor | 3.796 registros `product.supplierinfo` |
| Precios | Tres listas A/B/C USD; 11.445 reglas de precio fijo |
| Historia FAC | 851 cotizaciones en borrador, 3.643 líneas |
| Historia de compras | 53 solicitudes de cotización en borrador, 209 líneas |
| Muestra NOE | Cinco cotizaciones en borrador, diez líneas |
| Inventario | Saldo candidato del maestro de productos, aplicado en WH/Stock, ubicación 6 |
| Facturación | Una factura de muestra en borrador con cuatro líneas, USD 9,92 |
| Reportes espejo | Cinco acciones, doce vistas y seis menús; dimensiones y valores del origen |

Los adicionales respecto del maestro son **marcadores explícitos de registros no encontrados**, no identidades fiscales inventadas: cuatro clientes, dos proveedores y un grupo. Ningún producto de las líneas seleccionadas falta en el catálogo.

Los vendedores se conservaron como contactos/dimensión de historia. No se crearon doce usuarios facturables ni se los convirtió arbitrariamente en cajeros. La asignación operativa de vendedores a operaciones nuevas requiere una adaptación específica.

Se preservaron numéricamente los 55 productos preexistentes; la validación no encontró cambios en sus nombres, referencias, códigos de barras, precios o costos. Tampoco se borró la cotización vacía de demostración. Durante la validación apareció un carrito POS en borrador ajeno al importador: se conservó, sin cobrarlo ni modificarlo.

## Configuración monetaria y fiscal del piloto

Inicialmente la compañía utilizaba **VEF**, USD/VES estaban inactivas y no había asientos contabilizados. Se cambió la moneda base a **USD antes de importar importes** y se activó VES. VEF quedó inactiva; los documentos/valores de demostración anteriores no se reinterpretan como historia del negocio.

Se utilizó la tasa configurada en la copia de Solser, **876,8 Bs por USD**, como **tasa fija de prueba de VES con fecha 18/10/2026**. Se verificó su inversa. **No es una tasa oficial, no se reconstruyó historia cambiaria y no autoriza conversiones fiscales.** La advertencia figura también en el pie del ticket POS.

Todos los documentos FAC de la semana usan dólar y tasa 1. Las compras guardan `Moneda=BsS` y `Tasa_Venta=0`, aunque DMMarket usa directamente `Precio` y lo presenta como USD. En Odoo se preservó esa interpretación de reporte para el piloto, **no una equivalencia fiscal de facturas de compra**.

Solser define 8%, 16% y 31%; la localización observada de Odoo ofrece 8%, 12% y 22%. No se sustituyó una tasa por otra. Las líneas FAC del período tienen tasa cero y utilizan exención. Los tres productos marcados gravados al 16% quedaron **fuera de venta y POS** hasta validar impuestos y si el precio los incluye.

Los RIF y demás datos originales permanecen en la extracción privada, pero no se atribuyeron identidades fiscales ni se forzaron números inválidos en el campo VAT. La cartera cargada no debe considerarse fiscalmente completa.

## Inventario y costos

Se tomó `productos.Existencia` porque es la referencia que consulta el inventario actual de DMMarket. Eso **no certifica un conteo físico** ni corrige las tres discrepancias con la tabla por depósito.

Se crearon 2.598 quants para saldos no nulos. La comparación producto por producto encontró **cero diferencias superiores a 0,000001**. Total nativo observado: 110.032,39495439001 frente a 110.032,39495179732 del origen; la diferencia acumulada corresponde a precisión de almacenamiento.

La precisión inicial de cantidades de Odoo, dos decimales, causó diferencias en fracciones. Se elevó **Product Unit a ocho decimales** y se corrigieron únicamente los registros creados por este ajuste. No se sobrescribieron operaciones ajenas. De los catorce saldos negativos crudos, nueve son inferiores a −0,000001; los otros cinco son residuos numéricos diminutos. La validación no ocultó los nueve negativos significativos.

Se usó costo estándar y valoración periódica para preservar el costo actual inicial, no para afirmar que Solser utilice ese método en operaciones futuras. No se reprodujeron capas de valoración históricas ni se validó AVCO/FIFO contra Solser.

UND/BUL/CAJ son unidades independientes. No se inventó conversión caja→unidad. El peso del origen se conserva y se calculó `Cantidad × Peso` para los reportes espejo, sin asumir kilogramos. No se asignó esa magnitud al peso físico nativo de Odoo sin confirmar su unidad.

## Validación de reportes

**Se compararon agregaciones reales obtenidas por MCP desde Odoo con consultas SQL del origen**, no solo los archivos preparados.

| Dimensión FAC | Grupos comprobados |
|---|---:|
| Documento | 851 |
| Fecha | 7 |
| Producto | 1.048 |
| Grupo | 31 |
| Proveedor | 117 |
| Cliente | 276 |
| Vendedor | 11 |
| Ruta | 12 |
| **Total** | **2.353** |

Se contrastaron monto, utilidad, cantidad, promedio de porcentajes y peso en cada grupo, con tolerancia numérica de 0,000001. Se distinguieron ruta nula y ruta vacía. Resultado: **cero discrepancias**.

Controles FAC:

- Ventas: **USD 159.967,49**.
- Utilidad: **USD 13.400,08**.
- Cantidad: **16.668,209997564554**.
- Promedio de porcentajes de líneas: **11,836329581886583%**.
- Peso según unidades del origen: aproximadamente **101.440,81199623**.

Compras: monto de reporte **149.100,50120645514** y cantidad **11.882,42000579834**, también conciliados. Se conservaron controles SQL adicionales por proveedor/grupo.

El promedio de porcentajes de líneas **no equivale** a `utilidad / ventas × 100`. La tabla dinámica no presenta una suma de porcentajes como si fuera ese promedio: el control exacto se obtiene por MCP con `avg`. Tampoco se afirma que la suma visible de una página de lista abarque todas las páginas.

Redondear cada línea a centavos da 159.967,52, mientras redondear la suma del origen da 159.967,49. Se documentó esa diferencia de aproximadamente tres centavos; no se ocultó como equivalencia contable.

**Límite importante:** los campos `x_solser_*` de las líneas preservan valores y dimensiones históricos. Los reportes estándar de Odoo sobre ventas confirmadas/contabilidad **no son automáticamente equivalentes** a esos reportes espejo. Falta adaptar los reportes al registro futuro nativo, los KPIs comparativos, Pareto/actividad de clientes y demás vistas específicas del proyecto. Este repositorio no fue reconectado a Odoo ni se reemplazaron sus consultas MySQL.

## Registro, impresión y pruebas de interfaz

- El POS quedó en USD, lista A por defecto, con A/B/C disponibles y categorías del catálogo importado. Los clientes importados utilizan la lista A.
- Los códigos `IdProducto` se preservaron como referencia y código interno para escaneo. No se inventaron EAN ni se asumió que todo identificador numérico sea un EAN válido.
- Se habilitó impresión de cuenta/ticket en POS, sin impresión automática, y encabezado/pie explícitos de piloto no fiscal.
- Se verificaron en navegador las listas de catálogo/contactos, FAC, compras, NOE, la tabla dinámica FAC, los gráficos FAC/compras/NOE y el formulario de factura de muestra, sin errores de interfaz observados.
- Odoo generó correctamente un **PDF de factura en borrador**, guardado localmente. Es una factura de prueba en formato de documento, no una prueba de ticket térmico físico.
- Al validar había cero asientos publicados, cero pagos contables, cero pagos POS y ningún pedido POS finalizado. Todos los documentos importados seguían en borrador.

En este equipo `lpstat` no encontró impresoras configuradas y el inventario USB no identificó un lector/impresora. Eso no descarta equipos en otra computadora, Bluetooth o red, pero **impide afirmar que se haya probado el hardware real**. No se inventó una IP ni se enviaron trabajos a una impresora desconocida. Un ticket no demuestra cumplimiento fiscal venezolano.

## Lo que deliberadamente no se migró como operación financiera

Se preservaron, sin convertirlos en nuevas deudas/pagos de Odoo:

- 241 documentos, 27 movimientos y 32 cruces del esquema de cobranza nuevo.
- 3.428 registros históricos de `cxcmoves` y 851 pagos del período.
- Configuración/historia de comisiones.
- 98 movimientos de desempaque, correspondientes a 49 pares en la semana.

No se sumaron las estructuras de cobranza como deudas independientes. Un desempaque entre productos diferentes no se implementa correctamente suponiendo que sea solo una unidad de medida. Excedentes no aplicados, cierre/reapertura de deuda, anulación de abonos y asignación por vencimiento necesitan escenarios específicos.

Dar a Odoo la autoridad principal de abonos **reabriría [ADR-0002](adr/0002-registro-principal-abonos.md)**, que la asigna a DMMarket. Este piloto no cambió esa autoridad ni creó sincronización bidireccional. Se respetó [ADR-0003](adr/0003-esquema-compartido-y-migraciones.md): no hubo cambios al esquema compartido de Solser.

## Datos privados y reproducibilidad

Directorio privado:

```text
~/Downloads/dmmarket-odoo-pilot-20261018/
```

Incluye extracción de maestros/documentos, controles SQL, referencias de cobranza/comisiones/DPQ, vistas lógicas iniciales `odoo-antes-*`, checkpoint de IDs reales, scripts de carga MCP reanudable, validación por grupos, snapshot de campos/vistas/menús del piloto, resultados de stock y `factura-demo-borrador.pdf`. No contiene copias de las claves de Pi. Directorios restringidos y archivos privados.

El importador real utiliza claves `x_solser_key` y checkpoints para reconocer sus registros. Los External IDs del paquete CSV de preparación **no se registraron automáticamente como XML IDs en Odoo**. Por tanto, **no utilizar esos CSV como una actualización de los registros ya cargados sin mapear antes sus IDs**: pueden crear duplicados o revertir decisiones de cuarentena fiscal.

El generador `scripts/prepare-odoo-pilot.mjs` produce ese paquete inicial de revisión, sin conectarse ni escribir en Odoo:

```sh
bun scripts/prepare-odoo-pilot.mjs /ruta/privada/a/la/extraccion
```

Sus 19 archivos, 22.572 identificadores externos propuestos y 39.934 referencias se verificaron independientemente, sin errores; no son el estado de despliegue final ni una autorización de reimportación. El estado real se consulta en `odoo-validacion.json` y los checkpoints del directorio padre. No se escribieron pruebas unitarias; se realizaron conciliaciones de datos, comprobaciones de interfaz y análisis estático del generador.

**No se obtuvo un respaldo completo restaurable de Odoo Online.** El gestor de bases de `odoo.com` requiere otra sesión autenticada. Las exportaciones lógicas locales no sustituyen ese respaldo. Antes de convertir el piloto en operación o realizar cambios financieros masivos debe descargarse el respaldo completo y comprobar su recuperación.

## Comparación de esfuerzo

La comparación no es «formularios CRUD contra licencia ERP»: incluye integridad del stock, reservas/entregas, anulaciones, devoluciones, caja, deuda, monedas, permisos y auditoría.

| Alcance | Añadir registro a DMMarket | Adoptar Odoo |
|---|---|---|
| Catálogo, contactos y A/B/C | Interfaces y validación de escritura nuevas | Funciones estándar; catálogo/listas ya cargados |
| Compras, recepciones, ventas y entregas | Motor documental y de movimientos, concurrencia, reversos e integridad nuevos | Flujos estándar; configurar y validar el proceso del negocio |
| POS, lector y tickets | Sesión de caja, escaneo, cobro, reversos y drivers/integración nuevos | POS ya configurado; prueba física y compatibilidad pendientes |
| Multimoneda/fiscal/cobranza | Reutilizar cobranza existente donde corresponda y completar registro/auditoría | Funciones estándar, pero sin equivalencia fiscal ni de todas las reglas particulares garantizada |
| Desempaques y comisiones | Modelar reglas completas y trazabilidad | Aplicaciones/configuración o adaptación adicional; no basta copiar campos |
| Reportes actuales | Conserva inversión, pero debe soportar nuevos estados y fuentes | Se demostraron dimensiones/fórmulas históricas; faltan adaptación al futuro nativo y tableros específicos |
| Mantenimiento | El proyecto pasa a ser responsable de un sistema transaccional completo | Suscripción, configuración, migración e integración; restricciones de Odoo Online sobre módulos propios |

**Recomendación provisional:** seguir evaluando Odoo para el registro y mantener DMMarket como opción de reportes mediante una adaptación de lectura. No reescribiría todo el registro antes de probar los flujos nativos con este catálogo; tampoco descartaría los reportes actuales suponiendo que todos existen iguales en Odoo.

El piloto demuestra que cargar datos y aprovechar registro estándar es viable sin desarrollar esos módulos desde cero. También demuestra que la equivalencia de reportes y reglas de negocio requiere trabajo: se agregaron 41 campos directamente, más relacionados automáticos, doce vistas y cinco acciones de consulta.

No se presenta una cifra cerrada de implementación medida: fiscalidad, hardware y cartera todavía no están validados. Para presupuestar deben separarse configuración estándar, migración/conciliación, reportes/adaptador, reglas propias, integración fiscal/hardware y validación operativa; incluir suscripción y cualquier requisito de pasar de Online a una plataforma que admita módulos propios.

## Pendientes para completar el objetivo amplio

1. Respaldo completo descargable y comprobación de recuperación.
2. Prueba real del lector, impresora/ticket y circuito fiscal venezolano, incluyendo los tres productos gravados.
3. Conciliación de cartera y definición explícita de autoridad de cobranza; prueba de abonos, reversos, cierres/reaperturas y excedentes.
4. Desempaque operativo, comisiones y asignación de vendedor/ruta a operaciones nuevas.
5. Adaptación/validación de todos los tableros del proyecto sobre transacciones nativas de Odoo, sin depender indefinidamente de los campos históricos copiados.
6. Validación de costos futuros, permisos, anulaciones/devoluciones, cierre de caja y capacitación antes de operación real.

**Disponible ahora:** catálogo, precios, stock y contactos reales para probar registro nativo, historia de muestra y reportes espejo conciliados. **No certificado todavía:** hardware, cumplimiento fiscal, migración contable/cartera y paridad completa de todos los reportes del proyecto.

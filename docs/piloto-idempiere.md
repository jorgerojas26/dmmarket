# Piloto operativo de iDempiere

18/10/2026. **Instalación local levantada, cargada y ensayada. No es un paquete de preparación pendiente de importar, ni una instalación aprobada para facturación real.**

## Acceso y proyecto

- URL: **https://localhost:18443/webui/**.
- Proyecto independiente: `~/projects/dmmarket-idempiere/`.
- Configuración: `compose.yaml`, `Dockerfile`, `nginx.conf`, `package.json` y scripts reproducibles.
- Instrucciones completas: `~/projects/dmmarket-idempiere/README.md`.
- Acceso privado: `~/projects/dmmarket-idempiere/private/ACCESO.txt`; también `bun run credentials` desde ese proyecto. No copiar credenciales a este repositorio.
- Se dejó una ventana de navegador abierta y autenticada mediante Playwright CLI.

Una sola instalación de aplicación, con PostgreSQL, iDempiere, gateway TLS y servicio de backups. No se creó staging. La restauración se comprobó en una base temporal interna sin otra aplicación conectada, eliminada al terminar.

Solo se publica `127.0.0.1:18443`. No se publican PostgreSQL, OSGi ni debug. El certificado es local/autofirmado; no se alteró la confianza global del sistema. No se modificó Solser, Odoo ni las conexiones de este proyecto.

## Versión realmente ensayada

- iDempiere **13.0.0.202603090043**, imagen oficial `13-release`, digest `sha256:97c20749aa035dbe7e9091eed1cb77503cf0b4bc641cfa97d72fd95200c9ecda`.
- REST **1.0.0.202609301521**, instalado desde artefactos fijados/verificados, sin modificar el núcleo Java.
- PostgreSQL 17 y Nginx 1.28 fijados por digest.
- Mac arm64; iDempiere ejecutado con emulación amd64. No se certificó rendimiento de producción.

**No se confunde este build de marzo con el commit de mantenimiento de octubre revisado en el análisis documental.** No se probaron todas las variantes de iDempiere ni todos los POS de terceros.

## Carga efectiva y conciliación

Se reutilizó exactamente la extracción local del piloto Odoo: base `bdsolser_md_nieto`, snapshot con última venta 11/10/2026. No se cambió por otra base más reciente. Los cinco JSON utilizados están copiados con SHA-256 verificado en `private/source/`.

| Entidad | Estado |
|---|---|
| Productos Solser | 3.815, códigos/precios/costos y datos de referencia |
| Contactos | 2.516, incluidos marcadores explícitos de registros ausentes |
| Grupos y unidades | 33 grupos; UND/BUL/CAJ/sin unidad independientes, sin inventar conversiones |
| Precios | A/B/C: 11.445 precios; precios de costo adicionales y 3.796 relaciones proveedor/producto |
| FAC | 851 documentos en borrador, 3.643 líneas |
| Compras | 53 documentos en borrador, 209 líneas |
| NOE separado | Cinco documentos, diez líneas |
| Stock | Apertura nativa procesada con 2.598 líneas no nulas |
| Fiscalidad ambigua | Tres productos gravados fuera de venta; no se sustituyeron impuestos por otros |

**909 documentos históricos permanecen en borrador.** No se generaron facturas/cobros/entregas de esa historia. No confirmar masivamente documentos `SOL-*`.

Se compararon 2.353 grupos FAC, con las mismas ocho dimensiones y métricas del piloto Odoo. Cero diferencias superiores a `0,000001`; diferencia numérica máxima observada aproximadamente `8,8e-11`.

- Monto FAC: `159.967,49300454586`.
- Utilidad FAC: `13.400,075000720919`.
- Cantidad FAC: `16.668,209997564554`.
- Promedio de porcentajes de línea: `11,83632958188654%`, no margen global ni suma de porcentajes.
- Peso según unidades originales no certificadas: `101.440,81199622941`.
- Compras según fórmula del reporte: `149.100,50120645523`.
- Stock de apertura: `110.032,39495179732`, sin diferencias por producto sobre la tolerancia; nueve negativos significativos originales conservados.

El importe nativo de las líneas FAC, redondeado a centavos por línea, suma `159.967,52`. Esa diferencia frente al cálculo histórico no se ocultó como equivalencia contable.

Compras originales con moneda BsS/tasa cero, unidades físicas de peso, RIF, cartera y costos históricos siguen requiriendo conciliación funcional/fiscal. No se convirtieron los 241 documentos de cobranza de referencia en deudas nuevas ni se trasladó autoridad desde DMMarket. Siguen vigentes ADR-0002 y ADR-0003.

## Lo que se puede ver

En el buscador de iDempiere `Alt+G`, abrir **Piloto Solser - historia**, filtrar FAC/CPR/NOE y pulsar OK. Es una ventana nativa de consulta con columnas de fecha, documento, producto, cliente/proveedor, dimensiones originales, cantidad, monto, utilidad y peso. Se verificó en navegador.

Home contiene tres gráficos nativos: ventas FAC por día, utilidad FAC por día y compras. Se verificaron tres gráficos SVG renderizados, no únicamente registros de configuración.

**Son reportes espejo del snapshot.** Las operaciones nuevas `VAL-*` no se incorporan a esa historia. No se implementó el adaptador de toda la analítica DMMarket a ventas/costos/devoluciones futuros de iDempiere.

Para operar se utilizan las ventanas estándar de productos, contactos, pedidos, inventario, producción, facturas y pagos. El documento `VAL-UI-POS-001` se preparó por REST y se completó mediante la acción documental de la GUI nativa con Playwright CLI; produjo factura pagada, entrega y decremento de `0,375 kg`. No se presenta esa interfaz documental como una caja minorista de alta velocidad ya optimizada.

## Pruebas operativas realizadas

| Circuito | Evidencia / límite |
|---|---|
| Venta POS documental USD | Factura, entrega y cobro nativos; comprobados estado, pago y stock |
| Compra completa | Pedido, recepción, factura proveedor y pago, sin conexión bancaria real |
| Devolución y reembolso | Entrada de mercancía, nota de crédito pagada y devolución de dinero registrada |
| USD/Bs en cuentas por cobrar | Factura USD 8 saldada con USD 3 y Bs 4.384 a tasa técnica 876,8; luego reversión del equivalente a USD 5 y saldo abierto de USD 5 |
| Concurrencia | Cuatro operadores/sesiones API distintos, cuatro facturas pagadas y descuento total de cuatro unidades; no cuatro cajas físicas |
| Peso | Cantidad `0,375` a precio 10, importe 3,75; cantidad escrita, no leída de balanza |
| Lotes | Lote/fecha obligatorios en un producto sintético y transferencia de dos unidades entre ubicaciones conservando identidad y vencimiento |
| Desempaque | BOM/proceso nativo: una caja sintética se transforma en doce unidades, stock final de prueba 9 cajas y 112 unidades |
| Permisos | Usuario lector consulta catálogo; escrituras e inserción de factura válida rechazadas; un registro de otro tenant no accesible; GUI de producto con campos de solo lectura |
| Impresión | PDF nativo válido de una página tamaño carta, 17.494 bytes, con marca no fiscal y monto 3,75 |
| Persistencia | PostgreSQL y aplicación recreados conservando volúmenes; historia, operaciones y movimientos volvieron a conciliar |

Las nuevas operaciones son deliberadamente de prueba. La venta/compras/devolución y concurrencia modificaron un producto real de la **copia** en un neto de cinco unidades. La validación actual compara stock inicial más transacciones nativas posteriores; no confunde ese efecto esperado con corrupción del snapshot. Los ensayos de peso/lotes/desempaque usan productos `VAL-*` sintéticos.

Hubo pruebas negativas y correcciones mediante anulaciones/reversiones nativas, conservando auditoría. No se arreglaron existencias editando tablas de stock. Una producción inicialmente preparada sin el campo de consumo correcto se revirtió y se sustituyó por generación de líneas mediante el proceso estándar.

## Condiciones excluyentes: resultado

### Continuidad sin alcanzar el servidor: no cumplida por este cliente

Se mantuvieron ERP y base activos y se interrumpió el gateway, representando un local que pierde acceso al servidor central. Con Playwright CLI se intentó guardar un cambio, se reinició/navegó de nuevo sin red y se comprobó la base directamente.

- El cambio no se pudo persistir mientras el servidor era inalcanzable.
- La navegación tras reiniciar falló por desconexión.
- Antes del ensayo no había service worker ni bases IndexedDB en ese navegador.
- No se constató una cola transaccional durable que permitiera seguir vendiendo.
- Al recuperar conexión, el cambio no guardado no apareció como operación sincronizada.

**No se afirma que se perdieran ventas previamente confirmadas.** El hallazgo es imposibilidad de registrar con autonomía respecto del servidor, no pérdida de una transacción comprometida. No se simuló que hubieran transcurrido cuatro horas: el requisito ya fallaba al desconectar/reiniciar.

Una instalación local alcanzable por LAN es otra arquitectura y puede operar sin WAN; no unifica automáticamente siete bases autónomas. Se detectaron solicitudes auxiliares a `unpkg.com` y se sirvieron localmente los locales D3, para evitar esa dependencia de Internet. Eso tampoco añade un POS offline.

### Caja POS USD/Bs: el backoffice no prueba el circuito de caja

La aplicación aceptó cobros de distintas monedas sobre una factura, pero el modelo de pagos POS automático ensayado no admite `C_Currency_ID` por línea de medio de pago y genera pagos en la moneda del pedido.

Se intentó representar USD/Bs en ese modelo: el campo de moneda fue rechazado. Con importe incompleto, completar el pedido también falló y se comprobó rollback, sin factura ni salida parcial de inventario. Se anuló ese pedido de prueba.

**No queda aprobada una caja que reciba USD/Bs, dé vuelto por moneda, conserve tasa y concilie cada medio offline.** Puede desarrollarse/integrarse una solución, pero no se demostró que esté resuelta por configuración estándar.

### Lotes: trazabilidad sí, prohibición incondicional no

El despacho explícito de un lote sintético vencido se completó en el caso probado, incluso con uso de fecha de garantía en política de materiales activado. Esto no demuestra ausencia de FEFO u otras opciones; sí impide presumir un bloqueo automático incondicional. La política del negocio y posibles restricciones/adaptaciones deben definirse.

### Hardware, siete sedes y resto del negocio

`lpstat` no encontró impresoras y no se identificaron candidatos USB de impresora/lector/balanza en este Mac. No se inventaron IP, modelos, EAN o autorizaciones fiscales. Esto no descarta equipos en otras computadoras o redes.

Quedan pendientes: validación física/fiscal; seis bases y estructura legal; lotes reales; equivalencias de desempaque aprobadas; reglas de comisiones/vendedor/ruta; cartera conciliada; arqueo/cierre de caja y medios electrónicos; preventa móvil offline; todos los tableros futuros y matriz definitiva de permisos. No se etiquetan como cumplidos.

## Seguridad y mantenimiento observados

El piloto tiene contraseñas generadas/hasheadas, cuentas de muestra desactivadas, secretos privados, TLS local, puertos restringidos, persistencia y logs rotativos. No tiene SMTP ni conexión bancaria real configurados.

Un permiso de ventana de solo lectura no restringía por sí solo todas las creaciones REST ensayadas. Se configuró política de rutas/métodos por rol, con denegación general, lector GET comercial y comandos limitados para operadores; se volvió a probar con un payload de factura válido. Se anuló el borrador producido durante esa prueba inicial. **No es una auditoría exhaustiva ni un permiso de publicar el servicio en Internet.**

La integración no equivale a CRUD genérico: costos se crean automáticamente, tasas requieren campos coherentes de ambos sentidos, el tipo de medio debe poblarse, y consumo de materiales debe comprobarse con el proceso de negocio, no solo con estado documental CO. Se aprovechó el motor nativo, no se parcheó Java para forzar resultados.

El build fijado y el cifrado legado señalado por el servidor deben revisarse para una implantación real. Tampoco se probó actualización a otro build ni compatibilidad de todo el ecosistema de plugins.

## Respaldo y recuperación

Backups locales programados cada seis horas, con cuenta PostgreSQL de lectura y 56 copias automáticas retenidas. No es un RPO aprobado ni respaldo externo ante pérdida del equipo.

Se generó un dump completo, copia de configuración privada y configuración de ejecución. El dump se restauró en una base temporal del mismo PostgreSQL y se compararon **26 tablas clave**, controles FAC y acceso SQL del usuario de la aplicación. La base temporal se eliminó; no quedó otra aplicación/ambiente.

La restauración y sus verificaciones duraron aproximadamente **28 segundos** en este equipo. **No es un RTO integral** de siete sedes ni una recuperación completa de aplicación/periféricos ante destrucción del host.

Artefactos/resultados en `~/projects/dmmarket-idempiere/{backups,evidence,private}/`, con permisos privados. Contienen información sensible; no subirlos al repositorio ni sacarlos del equipo sin protección apropiada.

## Consecuencia para DMMarket vs Odoo vs iDempiere

Este piloto eleva la evidencia de que **iDempiere puede servir como núcleo comercial/backoffice**, sin desarrollar todo el ERP. Va más allá del mapeo histórico: se ejercitaron documentos y efectos operativos nuevos.

No autoriza una elección integral: **la configuración entregada falla la autonomía de caja y no demuestra el POS multimoneda/fiscal requerido**. Odoo tampoco quedó aprobado para todos esos puntos en el piloto anterior. No es válido compensar esos fallos con una puntuación alta por contabilidad o licencia gratuita.

Se mantiene la preferencia provisional por ERP existente + POS/continuidad demostrados + DMMarket analítico, o transición gradual con Solser y consolidación de lectura mientras se reduce riesgo. Si se evalúa un POS de tercero, exigir versión compatible, responsable de mantenimiento, licencia, fiscalidad y las mismas pruebas, no solo la etiqueta «offline».

No se midió TCO de implantación ni tiempo de mantener siete negocios. Que el agente haya automatizado un piloto no convierte ese trabajo en una migración profesional de pocos días ni elimina la necesidad de apoyo funcional/fiscal.

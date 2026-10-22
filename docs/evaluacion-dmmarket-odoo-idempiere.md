# Evaluación: DMMarket, Odoo e iDempiere

18/10/2026. Ampliación de la [evaluación DMMarket vs Odoo](evaluacion-dmmarket-vs-odoo.md), con el mismo marco: funcionalidad, adaptación, requisitos excluyentes, migración, seguridad, operación, dependencia y costo total.

Evaluación estratégica, no selección definitiva ni implantación aprobada. **Actualización práctica:** se levantó y cargó [un piloto operativo de iDempiere](piloto-idempiere.md) en `~/projects/dmmarket-idempiere`, con pruebas de documentos nuevos, GUI, permisos, desconexión y restauración. No se probaron periféricos físicos ni seis fuentes adicionales. No se modificó Odoo ni Solser. La evidencia de Odoo sigue limitada al [piloto existente](piloto-odoo.md); la valoración del código de DMMarket procede de la revisión anterior, no de una nueva auditoría completa. El código documental de iDempiere se revisó sobre mantenimiento 13 de octubre; el build efectivo del piloto es 13.0.0.202603090043, identificado por separado.

## 1. Conclusión ejecutiva

**iDempiere es un candidato serio para reutilizar un núcleo ERP abierto. No se ha demostrado que sea una solución lista para nuestras cajas.** Reduce la necesidad de construir compras, documentos comerciales, inventario, pagos, permisos y estructura organizativa desde cero; no elimina la implantación funcional ni el trabajo de POS, fiscalidad, sincronización y reportes.

Con las respuestas actuales:

1. **Mantener DMMarket como capa analítica sigue siendo una buena decisión de arquitectura**, tanto con Solser como con Odoo o iDempiere. No significa que ya exista la consolidación de siete negocios ni que esté decidido el producto transaccional final.
2. **Ambos ERP tienen evidencia de piloto, con alcances distintos:** Odoo demostró mapeo histórico y reportes; iDempiere añadió circuitos nativos con facturas, stock, pagos, reversos y concurrencia backend. Ninguno de esos alcances demuestra por sí solo caja offline/fiscal completa ni menor costo final.
3. **iDempiere aporta libertad de despliegue y un núcleo sin licencias ERP por usuario**, pero introduce aprendizaje Java/OSGi y responsabilidad de operación. Con un solo desarrollador, un conjunto de plugins sin mantenedor puede costar más que las licencias que evita.
4. **DMMarket como ERP completo sigue siendo la alternativa con más construcción de dominio pendiente.** La experiencia en JavaScript reduce aprendizaje de herramientas, no sustituye inventario transaccional, caja fiscal, lotes, permisos y recuperación.
5. **Ninguno de los tres está aprobado hoy para el conjunto de no negociables.** Odoo estándar documenta límites relevantes; iDempiere aún no tiene una combinación POS/offline/fiscal identificada y demostrada para este caso; DMMarket no dispone hoy de ese POS.

No hay un ganador global defendible todavía. Mi preferencia provisional es **reutilizar un ERP existente y conservar DMMarket**, antes que construir todo el ERP. Entre Odoo e iDempiere, la decisión debe depender primero de una caja viable y mantenible, no de la amplitud del catálogo de módulos.

## 2. Requisitos confirmados y pendientes

Estas respuestas precisan el análisis previo. No se exige todo el ERP offline ni varios días de autonomía como mínimo.

| Criterio | Respuesta confirmada |
|---|---|
| Negocios | Una distribuidora y seis comercios, actualmente con bases Solser independientes |
| Estructura legal/RIF | Por confirmar; no asumir siete entidades legales |
| Continuidad mínima | Hasta cuatro horas sin Internet, incluyendo reiniciar la caja sin perder ventas pendientes |
| Operaciones offline obligatorias | Ventas nuevas y su cobro; los demás procesos pueden esperar a reconexión |
| Concurrencia | De dos a cuatro cajas simultáneas en el local más grande |
| Calle sin datos | Preventa provisional; no venta/entrega/cobranza fiscal definitiva |
| Monedas en caja | USD y bolívares combinados |
| Tasa durante el corte | Última tasa autorizada, conservada con la operación |
| Productos | Desempaque/presentaciones, venta por peso/balanzas y lotes/vencimientos indispensables |
| Fiscalidad | Conservar e integrar las impresoras fiscales actuales |
| Periféricos | Marcas/modelos de impresoras y balanzas todavía desconocidos |
| Contabilidad | Gestión comercial principalmente; contabilidad legal fuera y exportación al contador |
| Equipo | Implementación principalmente a cargo del usuario, sin especialista ERP contratado como supuesto |
| Presupuesto | Sin definir |
| ERP y POS separados | Sin preferencia todavía; comparar arquitecturas |
| Objetivo inmediato | Comparación estratégica, sin piloto, orden de despliegue ni fecha seleccionados |
| Cobros electrónicos offline | Política pendiente para tarjetas, transferencias y pago móvil |

La consolidación de información de los siete negocios es no negociable. La nube es una preferencia para servicios centrales, no una razón para eliminar almacenamiento local necesario. La alternativa gradual con Solser sigue vigente, no es una decisión definitiva de conservarlo.

No se convierte la falta de exigencia de devoluciones offline en permiso para omitir devoluciones, anulaciones o cierres del producto final: solo cambia qué debe poder ejecutarse durante el corte.

### Datos pendientes que impiden una aprobación operativa

- RIF, relación legal entre sedes y tratamiento de ventas/traslados intragrupo.
- Marca, modelo, firmware, conexión y controladores de impresoras fiscales y balanzas; sistema operativo de las cajas.
- Política de cobros electrónicos: qué se considera verificado, qué puede quedar pendiente y quién acepta el riesgo.
- Volumen de tickets/líneas en hora pico, catálogo por comercio, velocidad de atención aceptable y tamaño de históricos.
- Reglas concretas de redondeo, vuelto, tasa autorizada y su vigencia, impuestos y documentos fiscales, validadas con responsables del negocio y especialistas.
- Reglas de desempaque/costos, trazabilidad de lotes y tratamiento de vencidos; no inferirlas de los nombres o códigos de Solser.
- Presupuesto, dedicación disponible, recuperación tolerable y responsable de soporte cuando el desarrollador no esté.

No hace falta conocer todo esto para comparar plataformas; sí para aprobar una solución, dimensionarla o cotizarla.

## 3. Método: requisitos excluyentes antes que puntajes

Se mantiene el marco anterior, sin inventar porcentajes de cobertura ni una suma ponderada arbitraria. Un ERP con muchos módulos no compensa perder una venta o incumplir la emisión fiscal.

Estados usados:

- **Existente:** observado en nuestro sistema/piloto; solo acredita el alcance realmente probado.
- **Estándar documentado:** respaldado por documentación o código, no ensayado con nuestros operadores/datos/equipos.
- **Adaptación:** requiere configuración, integración, plugin o desarrollo; se especifica cuál cuando se conoce.
- **No demostrado:** evidencia insuficiente. No significa imposible ni significa cumplido.

La evaluación distingue el producto de la arquitectura. Un ERP instalado en la LAN puede funcionar sin WAN; eso no demuestra que una caja pueda sobrevivir a la caída de su servidor remoto. Una API y la existencia de tablas de replicación tampoco demuestran sincronización financiera correcta.

### Condiciones de aprobación comunes

| Condición | DMMarket actual | Odoo evaluado | iDempiere evaluado |
|---|---|---|---|
| Venta/cobro durante 4 h, reinicio y recuperación | POS no implementado | Offline documentado, pero advertencia de no cerrar/recargar antes de sincronizar; no aprobado para reinicio | El cliente estándar ensayado falló al perder acceso al servidor y reiniciar; POS alternativo sin validar |
| Impresión fiscal con equipos actuales | No demostrada | No demostrada | No demostrada |
| USD/Bs combinados, vuelto y tasa histórica | Cobranza existente no equivale a POS mixto | No demostrado el circuito completo | Abonos USD/Bs verificados en backoffice; el POS automático ensayado no conserva moneda por medio |
| 2–4 cajas, peso, presentaciones y lotes durante el corte | Por construir | Funciones parciales documentadas; integración y concurrencia offline sin aprobar | Cuatro sesiones backend y muestras de peso/lote/desempaque verificadas online; no multicaja autónoma offline |
| Consolidación siete negocios con aislamiento | No existe aún en el alcance revisado | Multiempresa estándar; solo una fuente pilotada | Tenant/organizaciones estándar; siete fuentes no migradas |
| Recuperación y soporte operativos | Pendientes para el alcance ampliado | Pendientes del circuito final | Dump completo restaurado y 26 tablas/control histórico comprobados; recuperación integral y soporte pendientes |

## 4. Qué se verificó de iDempiere

### Versión y tecnología

La web oficial presenta **iDempiere 13 LTS “Orion”**. Para revisar el núcleo se tomó `release-13`, commit `3355eb5fc9403c3827fcd8caf8eb92f78319430e`, fechado 09/10/2026. Los enlaces a código de esta evaluación fijan ese commit cuando corresponde. No se confunden novedades de desarrollo/v14 con funciones ya entregadas en 13.

El núcleo y el cliente web usan Java, ZK y OSGi; la guía de instalación actual utiliza OpenJDK 17 y PostgreSQL 17, y documenta PostgreSQL 14+ u Oracle 23ai+. La página comercial de características y partes de las guías conservan referencias antiguas: para implantar hay que fijar una matriz exacta de versión, JDK, base y plugins, no mezclar requisitos de páginas distintas. PostgreSQL sería la opción a estudiar aquí para no introducir una licencia Oracle innecesaria. [I1–I3]

No funciona directamente sobre la base MySQL de Solser. Hay extracción, homologación y migración, igual que con Odoo. La base de lectura de DMMarket puede seguir siendo independiente.

### Modelo de grupo y permisos

La documentación distingue:

- **Tenant**, antes llamado Client: agrupa entidades relacionadas; tenants distintos no comparten información entre sí en el modelo estándar.
- **Organización:** entidad legal, financiera o fiscal dentro de un tenant; tiene pertenencia y árbol organizativo.
- **Organizaciones resumen:** agregan contabilidad de organizaciones transaccionales; no reciben contabilización directa.
- **Organización `*`:** permite compartir registros dentro del tenant por convención/configuración.
- **Roles:** determinan capacidades de la sesión; el núcleo incorpora controles de acceso por organización. [I4, I5]

Para un grupo relacionado, un tenant con organizaciones es una hipótesis razonable, **no una configuración decidida**. Si hay entidades independientes con aislamiento distinto, se revisa la topología. Siete tenants no son equivalentes a siete organizaciones compartiendo catálogo; tampoco un árbol resumen elimina automáticamente transacciones intragrupo.

### Núcleo comercial e inventario

La revisión de código de 13 confirma lógica de pedidos, facturas, entregas/recepciones, pagos, asignaciones, listas de precios, conversiones de unidades y tasas; también producción ligera/BOM, atributos de lote/fecha y documentos contraparte. Esto es una ventaja importante frente a desarrollar todos esos procesos en DMMarket. [I5–I8]

**El alcance no es “todo listo para nuestras reglas”.** Una conversión de unidades no demuestra desempaque entre dos SKU con costo y trazabilidad correctos. Un campo de vencimiento no demuestra FEFO efectivo en la caja ni bloqueo de producto vencido. Hay que modelar los procesos completos.

Las comisiones existen y tienen puntos de extensión documentados; reglas particulares sobre utilidad, cobro, devoluciones o rutas no se dan por equivalentes a las de DMMarket. [I9]

### POS: distinguir motor documental de experiencia de caja

Hay soporte estándar para pedidos POS y pagos mixtos por tipo de medio. La documentación explica que al completar el pedido se crean pagos y se asignan a la factura. [I10]

Pero **“pago mixto” aquí no acredita USD y Bs simultáneos**: en `MOrder.createPOSPayments()`, las sumas se contrastan con el total y cada pago generado recibe `this.getC_Currency_ID()`, la moneda del pedido. La ruta revisada no demuestra una interfaz ni una contabilidad de caja de dos monedas con vuelto independiente. Un plugin podría ampliarla, pero se debe identificar y probar. [I11]

El núcleo documental POS no certifica una interfaz de alta velocidad, operación sin servidor, impresión fiscal venezolana ni periféricos concretos. La web oficial indica que existen plugins móviles/POS y localizaciones; no promete que una combinación concreta cumpla nuestro caso. [I12]

Dos proveedores encontrados anuncian offline, pero no se obtuvo evidencia operativa de nuestra combinación de versión/hardware ni se revisó su implementación. Son **pistas comerciales**, no capacidades verificadas del estándar. [I13]

### Replicación: sí hay componentes, no una aprobación offline

Se encontraron módulos de exportación/importación y replicación en 13. El `info.md` de `master` describe sincronización asíncrona/programada, estrategias y mensajería JMS, y señala topología **unidireccional Master-to-Slave**. Ese documento no estaba en la misma ruta de `release-13`; no se le atribuye automáticamente compatibilidad exacta con nuestra versión. [I14]

Nada de eso demuestra por sí solo una solución de siete cajas autónomas que procese ventas, pagos y stock una vez, resuelva confirmaciones perdidas y preserve numeración fiscal. Tampoco sería correcto afirmar que iDempiere carece de cualquier mecanismo de replicación.

El repositorio también conserva una migración histórica de 2009 que desactiva funciones antiguas bajo el texto “Hide non working Replication functionality”. **No es prueba de que toda la replicación actual esté rota**; sí advierte contra basar una decisión en nombres de menús o código heredado sin comprobar la ruta vigente. [I15]

### Plugins: compatibilidad y mantenimiento importan

El WPOS público localizado declara compatibilidad con **iDempiere 3.1** y exige un fork con clases del núcleo modificadas. Su README menciona periféricos para Venezuela como trabajo futuro. No es evidencia suficiente de POS/fiscalidad actual para 13. No se recomienda adoptarlo tal cual. Esto no prueba que no existan otras soluciones mantenidas, públicas o comerciales. [I16]

La integración REST de BX Service/Trek Global dispone de documentación y repositorio identificables; es un **plugin**, no una licencia comercial API del núcleo. Permite modelos, procesos y autenticación. Su README declara versión predeterminada 12; en el piloto se instaló y probó el artefacto 1.0.0.202609301521 con el build 13 ensayado. Eso no certifica todos los builds. Se comprobó rollback de un POS incompleto, pero tener CRUD no garantiza idempotencia distribuida ni aplicación correcta de todas las reglas/callouts. También fue necesario restringir explícitamente rutas/métodos por rol. [I17]

### Seguridad y operación

La guía oficial advierte que la configuración inicial es demasiado abierta para producción y exige asegurarla: proxy, limitar servicios publicados, firewall, cambio de usuarios/contraseñas predeterminados y contraseñas con hash. También exige respaldar instalación y base antes de actualizaciones; la sincronización de esquema no es un rollback automático. [I18]

iDempiere no debe penalizarse por permitir autoalojamiento ni tratarse como inseguro por esa advertencia. La consecuencia es presupuestar endurecimiento, parches, copias, restauración, monitorización y soporte; son responsabilidades de la solución, aunque se contrate hosting gestionado.

## 5. Comparación funcional y de adaptación

En la columna Odoo se compara principalmente **Enterprise 20**, coherente con el piloto. Online, Odoo.sh y autoalojado no son intercambiables. No se atribuyen automáticamente prestaciones Enterprise a Community; Community requeriría su propia selección de módulos, validación y costo de soporte.

| Dimensión | DMMarket como transaccional propio | Odoo + DMMarket | iDempiere + DMMarket |
|---|---|---|---|
| Compras, recepción, ventas, devoluciones | Gran parte por construir; reportes de Solser no son registro propio | Flujos estándar; adaptar práctica del negocio | Núcleo estándar identificado; configurar y validar práctica del negocio |
| Cuentas por cobrar/pagar y caja | Hay base reutilizable en cobranza; no ERP/caja completos | Estándar; conciliación y migración pendientes | Documentos/pagos/asignaciones estándar; conciliación y migración pendientes |
| Siete negocios y permisos | Modelo de fuentes/aislamiento por ampliar | Compañías/sucursales, roles y almacenes | Tenant/organizaciones, roles y almacenes |
| Presentaciones/desempaque | Reglas y movimientos por implementar | UOM/packaging y otros flujos; definir si conversión o transformación | UOM/BOM/producción; definir si conversión o transformación |
| Peso y balanza | Integración y UX por construir | Integración de balanzas documentada; modelo real pendiente | Cantidad 0,375 e importe verificados; balanza física y POS rápido sin validar |
| Lotes/vencimientos | Registro, stock y trazabilidad por construir | Funciones estándar; verificar POS, corte y selección real | Lote/fecha y transferencia verificados; despacho explícito vencido permitido en el ensayo; bloqueo y POS pendientes |
| Caja USD/Bs y vuelto | Control a medida, con desarrollo y validación | Circuito local pendiente; multimoneda ERP no basta | Circuito local pendiente; pagos mixtos revisados usan moneda del pedido |
| POS rápido y reiniciable offline | Proyecto nuevo | POS disponible, pero estándar no aprobado para este requisito | Cliente estándar ensayado no cumple autonomía respecto del servidor; alternativa POS por identificar |
| Impresoras fiscales | Adaptación necesaria | Conector compatible y validación legal pendientes | Conector compatible y validación legal pendientes |
| Preventa móvil provisional | App/cola por construir; alcance acotado | Puede reutilizar ventas; offline exacto y conflictos por validar | Puede integrarse por REST; app offline no demostrada |
| Listas A/B/C, clientes/rutas/vendedores | Definiciones/reportes existentes; captura y permisos por ampliar | Listas pilotadas; rutas/reglas particulares por adaptar | Listas y representantes disponibles; rutas/reglas particulares por mapear |
| Comisiones diferenciales | Valor existente que conviene preservar | Revisar equivalencia, no suponerla | Núcleo/extensibilidad disponibles, no equivalencia automática |
| Contabilidad legal | Construirla sería gran ampliación, hoy fuera del objetivo | Disponible, aunque no sea prioridad actual | Fortaleza del núcleo, aunque no sea prioridad actual |
| Reportes DMMarket | Mayor reutilización aparente; separar dependencia Solser | Adaptador y modelo analítico; piloto no equivale a reportes de operaciones futuras | 2.353 grupos históricos conciliados y tres gráficos nativos; adaptador futuro no terminado |
| Maestros e historia de Solser | No elimina depuración por usar stack propio | Mapeo piloto reutilizable; seis fuentes pendientes | Mapeo y carga de la misma fuente comprobados; seis fuentes y reglas reales todavía pendientes |

La evaluación anterior documenta las capacidades Odoo y del repositorio DMMarket; para peso, lotes y unidades se añaden fuentes oficiales Odoo 20. [O1–O6]

### Tres trampas funcionales comunes

1. **Desempaque:** comprar una caja de 12 y vender unidades puede ser una conversión de UOM si es un mismo producto. Si son SKU distintos con existencias independientes, puede requerir transformación; conservar costo, lote y balance de cantidades. No usar una BOM arbitraria para disimular reglas no acordadas.
2. **Peso:** una balanza que imprime etiquetas con peso/precio y una balanza conectada en vivo son integraciones diferentes. Definir precisión, tara, códigos y redondeo; probarlas durante el corte.
3. **Lotes en caja:** si varias cajas venden del mismo lote offline, hace falta coordinación local o una política explícita de asignación. Trazabilidad no puede reducirse a rellenar el lote central después sin saber cuál se entregó.

## 6. Adaptación a un desarrollador principal

| Aspecto | DMMarket | Odoo | iDempiere |
|---|---|---|---|
| Afinidad con el proyecto actual | Alta: JS/React/Bun y código conocido | Integración HTTP/JS reutilizable; personalización exige aprender modelo Odoo/Python/Owl | Integración HTTP/JS reutilizable; extensiones profundas exigen Java/OSGi/diccionario |
| Lógica empresarial reutilizada | Analítica y parte de cobranza; resto importante pendiente | Núcleo ERP existente | Núcleo ERP existente |
| Riesgo dominante | Construir y mantener demasiado dominio propio | Restricciones de despliegue, módulos y adaptación fiscal/offline | Selección/mantenimiento de plugins, aprendizaje y operación del stack |
| Hosting gestionado | Hay que contratarlo/diseñarlo | Online reduce operación; sh/autoalojado cambian responsabilidades | Puede contratarse, pero hay que evaluar proveedor, contrato y recuperación |
| Actualizaciones | Responsabilidad propia de todo el sistema | Núcleo del proveedor; extensiones/conectores requieren mantenimiento | Núcleo comunitario; compatibilidad de plugins y migración requieren mantenimiento |

Son juicios de ingeniería para este equipo, no mediciones de productividad ni afirmaciones de que una plataforma sea universalmente más fácil. Un plugin bien mantenido puede cambiar sustancialmente el resultado; un fork sin soporte puede empeorarlo.

No recomiendo aprender simultáneamente el ERP, desarrollar un POS completo, crear sincronización multinodo y hacerse único soporte de siete locales como si fuera una sola tarea pequeña. La ausencia de un consultor contratado tampoco significa que falte criterio contable/fiscal: hace falta participación real de operadores, contador y proveedor autorizado de equipos.

## 7. Arquitecturas que deben compararse

### A. Transición gradual: Solser local + DMMarket consolidado

Siete orígenes locales → extracción privada de solo lectura → proyección analítica central → DMMarket por negocio/grupo, alertas y frescura visible.

Sigue siendo la alternativa inicial de menor cambio en caja y menor riesgo de reemplazo, **si Solser y sus equipos actuales pasan seguridad, recuperación y vigencia fiscal**. No cumple por sí sola modernización transaccional, lotes o periféricos nuevos; no se han auditado las seis instalaciones adicionales. Su fortaleza es adelantar consolidación sin construir todavía sincronización de escrituras.

### B. ERP central + POS/nodo local autónomo + DMMarket

Puede usar Odoo o iDempiere como backoffice. El POS puede ser integrado, de tercero o propio acotado. El diseño local depende de concurrencia y hardware, no de una preferencia estética por nube.

Para dos a cuatro cajas en LAN, estudiar un coordinador local durable que maneje operaciones/stock/lotes del local y sincronice con la nube. Alternativamente, terminales autónomas con límites claros de autoridad. No implantar ambos patrones a la vez sin necesidad.

Esto permite conservar servicios centrales en nube sin exigir conexión WAN en cada ticket. Añade un componente local que debe recuperarse y mantenerse. Si el coordinador local es punto único de falla, necesita un procedimiento de recuperación probado; no se promete que sobreviva automáticamente a la pérdida de LAN/servidor local.

No se aprobó ningún producto POS concreto en este análisis. Un POS de tercero debe tener versión compatible, conector fiscal y responsable de mantenimiento verificables. Si se desarrolla uno propio, el presupuesto es **POS + fiscalidad + sincronización + integración**, no solo una pantalla de ventas.

### C. ERP local en cada sede + consolidación

Odoo o iDempiere locales pueden trabajar por LAN durante un corte WAN. Es una posibilidad real y no debe confundirse con offline del navegador.

A cambio se mantienen nodos ERP completos, actualizaciones, restauraciones y sincronización entre sedes. En Odoo Enterprise debe cotizarse la topología/licenciamiento; en iDempiere la ausencia de licencias no elimina siete operaciones técnicas. Para este equipo no la tomaría como opción predeterminada sin demostrar menor complejidad que B o la transición A.

### Lo que ninguna arquitectura promete

- Stock global instantáneo mientras locales están desconectados.
- Autorización bancaria sin el canal de comunicación requerido por el medio de pago.
- Recuperar en nube ventas que nunca llegaron si se destruyen todas sus copias locales.
- Sincronización financiera correcta mediante replicación SQL multimáster indiscriminada o “gana el último cambio”.

## 8. Consolidación, migración e integración analítica

Las tres rutas requieren homologar productos, unidades, monedas, clientes y documentos. El ID de Solser se conserva junto al negocio de origen; nunca se fusiona solo por ID o nombre parecido.

La experiencia del piloto Odoo sí aporta extracción y totales de control reutilizables para iDempiere. No transfiere automáticamente XML IDs, campos, impuestos ni estructura de documentos. Historia, saldos iniciales y operaciones futuras deben tener tratamientos separados; no confirmar ventas históricas para fabricar reportes y duplicar stock/deuda.

Conservar DMMarket requiere un contrato analítico independiente del ERP:

- Venta económica frente a pedido, factura y ticket: no contar dos veces.
- Utilidad basada en costo histórico, tratamiento de devolución y diferencia entre promedio de porcentajes y margen global.
- Cantidades/peso normalizados sin mezclar caja, unidad y kilogramo.
- Frescura y pendientes por negocio; desconexión no equivale a ventas cero.
- Ventas intragrupo separadas de venta externa; no sumar distribuidora → minimercado → consumidor como ingreso externo triple.
- Cambios y anulaciones antiguas deben propagarse; un incremental por fecha de factura nueva no basta.

iDempiere documenta reportes desde réplica de lectura; es una herramienta de rendimiento, **no sincronización de POS desconectados ni sustituto automático de nuestro almacén consolidado**. [I19]

Debe existir una autoridad transaccional por circuito. Pasar abonos desde DMMarket a cualquier ERP obliga a revisar [ADR-0002](adr/0002-registro-principal-abonos.md). No se modifica automáticamente el esquema compartido de Solser: sigue vigente [ADR-0003](adr/0003-esquema-compartido-y-migraciones.md).

## 9. Costo total, licencias y factibilidad económica

No hay presupuesto ni propuesta de proveedor. No es responsable inventar un monto o un plazo comparable de las tres rutas. Los rangos del análisis previo suponían apoyo funcional y excluían un motor offline propio: **no son una cotización válida para el escenario actual de un desarrollador principal**.

| Componente | DMMarket transaccional | Odoo | iDempiere |
|---|---|---|---|
| Licencia del núcleo | Sin suscripción ERP externa por desarrollar lo propio; revisar dependencias/distribución | Según edición, usuarios, plan y topología; piloto Enterprise | Núcleo GPLv2, sin licencia por usuario; revisar licencias de plugins/servicios |
| Implementación | Mucho desarrollo de dominio | Configuración + módulos/adaptaciones | Configuración + plugins/adaptaciones |
| POS/fiscal/offline | Por construir o integrar | Pendiente de solución concreta | Pendiente de solución concreta |
| Infraestructura | Nube y componente local si se reemplazan cajas | Online/sh/gestionado/local según arquitectura | Gestionado/propio y componente local según arquitectura |
| Migración/reportes | Trabajo propio; no desaparece por mantener apariencia | Piloto reduce una parte del riesgo | Nuevo mapeo; controles de origen reutilizables |
| Soporte/actualizaciones | Principalmente propio | Suscripción no equivale a soporte de todos los desarrollos propios | Comunidad no equivale a SLA; contratar o asumir mantenimiento |

`TCO a 3 años = implantación + migración + hardware + formación + horas propias + 36 × (licencias + hosting + soporte) + actualizaciones + incidentes + salida`

No sumar dos veces horas propias ya incluidas en una propuesta. Incluir costo de oportunidad y soporte fuera de horario, aunque no se emita una factura por esas horas.

Sin cantidad/roles de usuarios y cotizaciones no puede afirmarse cuánto ahorra iDempiere frente a Odoo. Un punto de equilibrio orientativo sería:

`meses de recuperación = sobrecosto inicial de iDempiere / ahorro mensual neto frente a Odoo`

Solo tiene sentido si el ahorro neto es positivo, ambas soluciones cumplen el mismo alcance y se incluyen diferencias de mantenimiento. Una licencia gratis no compensa una caja no viable.

### Licencia abierta no significa ausencia de dependencia

iDempiere permite acceso al código y libertad de despliegue. Persisten dependencias del modelo de datos, especialistas, plugins, proveedor y conocimientos propios. Si se distribuyen modificaciones/derivados GPL, hay que revisar obligaciones de código y licencia con asesoría adecuada. No se afirma que una integración independiente por HTTP convierta automáticamente DMMarket a GPL. [I20]

## 10. Recomendación por escenario

| Escenario | Recomendación provisional |
|---|---|
| Necesitamos visibilidad del grupo antes de sustituir cajas | Consolidación de lectura con DMMarket y endurecimiento/recuperación de Solser, con condiciones de salida |
| Un proveedor demuestra POS fiscal/offline mantenido sobre Odoo | Odoo gana fuerza; aprovechar piloto y conservar DMMarket, revisando edición/despliegue y costo |
| Un proveedor demuestra ese mismo circuito sobre iDempiere 13 con soporte viable | iDempiere puede igualar o superar la conveniencia de Odoo; especialmente si el ahorro de licencias supera mantenimiento y aprendizaje |
| Ninguno acredita POS local pero un POS independiente sí | Comparar ambos como backoffice del mismo POS; aislar costo de conectores y operación |
| Ambos exigen desarrollar casi toda la caja | Comparar ERP + POS propio acotado frente a DMMarket completo; no confundir ambas cantidades de trabajo |
| No hay soporte ERP y todo recae en una persona | Reducir cambios simultáneos; no elegir un fork antiguo ni comprometer reemplazo de siete locales de golpe |

**Sin ranking definitivo:** el piloto ya acredita iDempiere como candidato funcional de backoffice, con más evidencia operativa que cuando se inició esta comparación. No lo aprueba como caja integral; Odoo tampoco está aprobado en todos los requisitos. Comparar una solución POS/fiscal/offline concreta y costo total bajo el mismo protocolo antes de ordenar los ERP. DMMarket se mantiene como analítica y desarrollo diferencial, no como ERP completo por defecto. La contabilidad más amplia no debe decidir sola porque hoy no es el objetivo principal.

No recomendaría instalar iDempiere y migrar todo el catálogo solo para comprobar al final que no existe el conector de impresora necesario.

## 11. Validación decisiva común

Se ejecutó la parte software de [un piloto iDempiere](piloto-idempiere.md), con las limitaciones y fallos registrados. Este protocolo sigue siendo la aceptación integral común: faltan equipos, políticas y seis fuentes; no debe marcarse todo cumplido por haber levantado Docker.

1. **Inventario y legalidad:** identificar equipos, controladores, entidades/RIF, documentos, impuestos y responsable fiscal. Confirmar versión del ERP y mantenedor de cada plugin.
2. **Ticket representativo:** una presentación/caja, una venta por peso y un producto con lote/vencimiento; combinación USD/Bs, vuelto y última tasa autorizada. Conciliar importe, costo, stock y pago.
3. **Corte WAN de cuatro horas, LAN disponible:** dos a cuatro cajas operan concurrentemente con catálogo suficiente, impresora y balanza reales. Procesos administrativos no exigidos pueden esperar.
4. **Reinicio durante aislamiento:** cerrar/reiniciar dispositivo/aplicación, recuperar pendientes y volver a vender sin depender de cargar la nube. Hacerlo en entorno controlado sin ventas reales en riesgo.
5. **Fiscalidad y fallos:** impresión, timeout con resultado incierto, lectura de estado/recuperación y prevención de doble emisión. No es posible una transacción SQL atómica con una impresora externa: resolver mediante estados y reconciliación según protocolo del equipo.
6. **Reconexión problemática:** interrupciones, reenvíos, confirmación perdida y operación rechazada. Conservar ID y aplicar efectos una vez, sin duplicar factura, cobro, stock o emisión fiscal.
7. **Caja y trazabilidad:** conciliar efectivo por moneda, otros medios según política aprobada, tasas, vuelto, lote entregado y costos de desempaque. Una transferencia capturada no es un pago verificado automáticamente.
8. **Preventa móvil:** pedido provisional offline, recuperación tras reinicio y sincronización sin duplicados; validar precio, crédito y stock al aceptar, conservando trazabilidad de ajustes.
9. **Reportes y permisos:** producir reportes DMMarket desde operaciones nuevas, no solo snapshots históricos; separación por negocio y consolidado con frescura/eliminaciones explícitas.
10. **Recuperación y mantenimiento:** restaurar backup, ensayar pérdida del nodo local y actualizar la combinación ERP/plugins. Medir tiempo/pérdida aceptables con responsables reales.

No confundir pérdida de WAN con caída de LAN o del coordinador local. Registrar esos casos aparte; la resiliencia necesaria del componente local debe acordarse antes de aprobarlo.

La fase puede empezar con evidencia de un proveedor o demostración dirigida; no exige un proyecto de desarrollo abierto. Si un candidato falla una condición excluyente sin una solución mantenible, se descarta esa combinación/arquitectura, no se compensa con puntos por CRM o contabilidad.

## 12. Fuentes y límites

Consultadas el 18/10/2026. Las fuentes de proveedores son declaraciones comerciales, no validaciones independientes. Algunas páginas de la wiki bloquearon acceso directo; se priorizaron documentación oficial nueva y código fijado a versión. No se hizo benchmarking, auditoría completa de seguridad ni certificación fiscal.

### iDempiere: fuentes primarias

- **I1.** [Web oficial](https://idempiere.org/) y [README del repositorio](https://github.com/idempiere/idempiere): identidad del proyecto, arquitectura y 13 LTS en la web.
- **I2.** [Prerequisitos de instalación actuales](https://docs.idempiere.org/docs/basic-installation/installing-for-execution/install-prerequisites): JDK y motores/versiones; no usar como dimensionamiento de siete locales.
- **I3.** [Cliente web 13, manifiesto](https://github.com/idempiere/idempiere/blob/3355eb5fc9403c3827fcd8caf8eb92f78319430e/org.adempiere.ui.zk/META-INF/MANIFEST.MF): versión 13, Java 17 y dependencias ZK/OSGi.
- **I4.** [Vocabulario funcional](https://docs.idempiere.org/docs/basic-functional/vocabulary): tenant, organización, datos compartidos, roles, productos y esquemas contables.
- **I5.** [Modelos del núcleo 13](https://github.com/idempiere/idempiere/tree/3355eb5fc9403c3827fcd8caf8eb92f78319430e/org.adempiere.base/src/org/compiere/model): `MOrder`, `MInvoice`, `MInOut`, `MPayment`, `MAllocationHdr`, `MRole`, `MPriceList`, `MUOMConversion`, `MConversionRate`, `MDocTypeCounter`. Existencia y revisión selectiva no equivalen a validación de todos sus flujos.
- **I6.** [Atributos de producto](https://github.com/idempiere/idempiere/blob/3355eb5fc9403c3827fcd8caf8eb92f78319430e/org.adempiere.base/src/org/compiere/model/MAttributeSet.java) e [instancia de atributos](https://github.com/idempiere/idempiere/blob/3355eb5fc9403c3827fcd8caf8eb92f78319430e/org.adempiere.base/src/org/compiere/model/MAttributeSetInstance.java): lote, serie y fecha; no prueba automática de FEFO en POS.
- **I7.** [Producción](https://github.com/idempiere/idempiere/blob/3355eb5fc9403c3827fcd8caf8eb92f78319430e/org.adempiere.base/src/org/compiere/model/MProduction.java) y [múltiples BOM en producción ligera](https://docs.idempiere.org/docs/new-features/v9/multiple-bom-support-for-mfg-light).
- **I8.** [Tasas por fecha/tipo/organización](https://github.com/idempiere/idempiere/blob/3355eb5fc9403c3827fcd8caf8eb92f78319430e/org.adempiere.base/src/org/compiere/model/MConversionRate.java): capacidad del ERP, no demostración de caja USD/Bs.
- **I9.** [Extensión de comisiones](https://docs.idempiere.org/docs/new-features/v9/custom-commission-calculations).
- **I10.** [Pagos mixtos de pedidos POS](https://docs.idempiere.org/docs/new-features/v1.0/mixedpospayments): medios de pago, creación y validaciones.
- **I11.** [`MOrder.createPOSPayments()` en 13](https://github.com/idempiere/idempiere/blob/3355eb5fc9403c3827fcd8caf8eb92f78319430e/org.adempiere.base/src/org/compiere/model/MOrder.java#L2315-L2435): moneda del pedido aplicada a pagos de esta ruta.
- **I12.** [Plugins oficiales, descripción del ecosistema](https://idempiere.org/plugins/) y [desarrollar sin modificar el núcleo](https://docs.idempiere.org/docs/basic-development/plugin-development/developing-plugins): extensibilidad no equivale a compatibilidad garantizada.
- **I14.** [Módulo de replicación en 13](https://github.com/idempiere/idempiere/tree/3355eb5fc9403c3827fcd8caf8eb92f78319430e/org.adempiere.replication) y [descripción en master](https://github.com/idempiere/idempiere/blob/master/org.adempiere.replication/info.md): fuentes de versiones diferentes, identificadas expresamente.
- **I15.** [Migración histórica de replicación](https://github.com/idempiere/idempiere/blob/3355eb5fc9403c3827fcd8caf8eb92f78319430e/migration-historic/353a-354a/postgresql/487_HideNonWorkReplication.sql): advertencia histórica, no diagnóstico del producto actual.
- **I18.** [Seguridad y mantenimiento posinstalación](https://docs.idempiere.org/docs/basic-installation/installing-for-execution/post-installation): usar las advertencias y revisar los ejemplos de actualización contra la versión elegida; la página conserva ejemplos de otras versiones.
- **I19.** [Reportes desde réplica de lectura](https://docs.idempiere.org/docs/new-features/v6.2/reporting-from-read-only-replica).
- **I20.** [Licencia GPLv2 del repositorio](https://github.com/idempiere/idempiere/blob/3355eb5fc9403c3827fcd8caf8eb92f78319430e/LICENSE.md): no es asesoría legal sobre derivados o plugins particulares.

### Plugins y proveedores identificados

- **I13.** [TenthPlanet, POS](https://tenthplanet.in/idempiere/idempiere-erp-pos-module) y [SCM Software Lab, POS](https://idempiere.scmsoftwarelab.com/idempiere-point-of-sale-module.html): anuncios de offline/localización funcional; no prueba de compatibilidad fiscal venezolana, mantenimiento ni autonomía durable. El primero se obtuvo mediante resultados de búsqueda; acceso directo bloqueado al verificar.
- **I16.** [WPOS público](https://github.com/jojeda-four-id/org.idempiere.wpos): README con 3.1, fork requerido y periféricos futuros. [POS Swing relacionado](https://github.com/victorsuarezis/org.idempiere.pos): también requiere cambios en núcleo.
- **I17.** [Plugin REST BX Service](https://github.com/bxservice/idempiere-rest), [introducción](https://bxservice.github.io/idempiere-rest-docs/docs/intro) e [inicio/instalación](https://bxservice.github.io/idempiere-rest-docs/docs/quickstart): API extensible; verificar artefacto compatible, permisos y semántica de procesos.

### Odoo y evidencia local

- **O1.** [Evaluación previa](evaluacion-dmmarket-vs-odoo.md), con fuentes sobre multiempresa, restricciones Online, API, licencias, seguridad y actualización; [piloto](piloto-odoo.md), con resultados y bloqueos reales.
- **O2.** [POS offline Odoo 20](https://www.odoo.com/documentation/20.0/applications/sales/point_of_sale/use.html#offline-pos): revisado nuevamente; no cerrar/recargar ni borrar caché antes de sincronizar, facturación posterior, sin stock en tiempo real ni terminales de pago integrados offline. Impresoras y balanzas LAN pueden seguir funcionando si no cambia la red; esto no certifica nuestros modelos fiscales.
- **O3.** [Offline general Odoo 20](https://www.odoo.com/documentation/20.0/applications/general/offline_mode.html): cola/caché y límites; no sustituye la validación POS.
- **O4.** [Unidades](https://www.odoo.com/documentation/20.0/applications/inventory_and_mrp/inventory/product_management/configure/uom.html) y [packaging](https://www.odoo.com/documentation/20.0/applications/inventory_and_mrp/inventory/product_management/configure/packaging.html).
- **O5.** [Lotes](https://www.odoo.com/documentation/20.0/applications/inventory_and_mrp/inventory/product_management/product_tracking/lots.html) y [vencimientos](https://www.odoo.com/documentation/20.0/applications/inventory_and_mrp/inventory/product_management/product_tracking/expiration_dates.html).
- **O6.** [Balanzas en POS](https://www.odoo.com/documentation/20.0/applications/sales/point_of_sale/hardware_network/scale.html): integración dependiente del equipo/configuración, no garantía universal.

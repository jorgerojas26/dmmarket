# Evaluación: desarrollar DMMarket o adoptar Odoo

18/10/2026. Análisis para una distribuidora y seis negocios minoristas, hoy con bases locales independientes de Solser. No se inspeccionaron las seis bases adicionales. No se activó multiempresa ni se cambió el plan de Odoo para realizar esta evaluación.

> Ampliación posterior: [comparación DMMarket, Odoo e iDempiere](evaluacion-dmmarket-odoo-idempiere.md). Incluye las respuestas más recientes: offline de hasta cuatro horas para ventas nuevas y su cobro, reinicio seguro, dos a cuatro cajas, USD/Bs combinados, presentaciones/desempaque, peso/balanzas y lotes/vencimientos. Esos requisitos precisan los escenarios más amplios de este documento; los rangos anteriores de implementación no son una cotización para el alcance actualizado.

## Recomendación ejecutiva

Como **primera etapa**, priorizar el endurecimiento y la recuperación de los siete servidores actuales y una consolidación analítica de solo lectura para DMMarket, sin sustituir las cajas. Eso entrega visibilidad de grupo sin exigir todavía sincronización distribuida de escrituras.

Para el reemplazo transaccional posterior, seguir evaluando **un ERP existente y DMMarket como capa analítica**, antes que comprometerse a construir un ERP completo a medida. Odoo es un candidato razonable por sus flujos estándar y capacidades multiempresa, pero **Odoo Online central no queda aprobado automáticamente para el requisito de offline completo**.

No recomiendo migrar todos los reportes a Odoo ni abandonar la inversión analítica. Tampoco recomiendo prometer siete bases autónomas con sincronización bidireccional como una simple ampliación del sistema actual.

La recomendación depende de una condición de descarte: demostrar continuidad real, fiscalidad/hardware y recuperación de datos. Si operación completa y prolongada sin Internet en cada local es obligatoria, debe definirse primero una arquitectura con servidor local/nodos autónomos y sus integraciones; la base multiempresa central de Odoo no sustituye esa arquitectura.

## Alternativa gradual: Solser local, Tailscale y consolidación analítica

La propuesta del usuario —mantener operación local, mejorar su seguridad, conectar las sedes de forma privada y migrar funciones paulatinamente— es una arquitectura profesional y, como primera etapa, presenta una relación valor/riesgo favorable frente a sustituir inmediatamente todas las cajas.

No es profesional por conservar tecnología antigua ni por usar una VPN: lo es si se gobiernan seguridad, recuperación, datos, responsabilidades y evolución. La nube es una herramienta de despliegue, no una certificación de calidad. El diseño final puede ser híbrido de forma permanente si eso responde a las restricciones de conectividad.

### Diseño preferido para reportes

```text
Solser/BD local de cada negocio
           ↓ extracción privada de solo lectura
        Tailscale + colector programado
           ↓
Almacén/proyección analítica central, preferentemente gestionado
           ↓
DMMarket: negocio individual, grupo y alertas
```

No basar el tablero consolidado en consultas pesadas, síncronas y en vivo contra las siete bases por cada petición de usuario. Eso convierte los cortes de conectividad en lentitud o indisponibilidad de los reportes y puede competir con el trabajo de caja en motores antiguos. Una consulta puntual en vivo puede ser útil para diagnóstico; no debe ser la única estrategia de consolidación.

La extracción y la actualización analítica requieren diseño, pero no la misma complejidad que permitir dos escritores sobre inventario/dinero. Si falla un enlace, la venta local continúa y la central conserva la última versión con frescura visible. La copia analítica es reconstruible y no modifica el origen. No sustituye un respaldo operativo restaurable de Solser.

La identidad incluye negocio de origen, los códigos se homologan explícitamente y las anulaciones/correcciones antiguas deben propagarse; no basta extraer facturas nuevas por fecha. El modelo de reportes debe distinguir unidades, monedas y operaciones intragrupo. Alertas de inventario usan datos suficientemente recientes; un local sin conexión genera alerta de sincronización, no un stock cero ficticio.

### Controles previos a conectar siete bases

- Inventario de versiones, hardware, servicios y responsables de cada establecimiento; no se inspeccionaron las otras seis bases todavía.
- Backups completos, externos y protegidos para las siete sedes, con restauraciones ensayadas y objetivos de pérdida/recuperación acordados.
- Energía/almacenamiento confiables, monitorización, repuesto o procedimiento de recuperación y mantenimiento compatible con Solser.
- No publicar MySQL en Internet; limitar acceso privado a puertos necesarios y al colector, con credenciales de lectura separadas por fuente.
- Identidad y permisos en DMMarket por negocio/usuario. El selector visual y Tailscale no sustituyen autorización en el backend.
- Fuentes de datos configuradas por el servidor; no cambiar una conexión global compartida según un parámetro enviado por el navegador.
- Extracciones acotadas y medidas para no perjudicar ventas; no modificar índices/tablas compartidas automáticamente.
- Última extracción, frescura, fallos, reconciliaciones y calidad de datos visibles y auditables.

### Migración gradual con una sola autoridad

Migrar procesos o circuitos completos, con criterios de aceptación y retirada del comportamiento anterior. No dejar Solser y DMMarket registrando el mismo abono, factura o saldo. En particular, ventas e inventario están acoplados: un nuevo módulo de inventario no puede ignorar las salidas que todavía genera Solser.

Las nuevas funcionalidades deben depender de una capa de adaptación, no de reproducir indefinidamente tablas, indicadores y peculiaridades internas de Solser como si fueran un contrato estable. El almacén analítico puede recibir Solser hoy y otra fuente mañana, conservando buena parte de la interfaz y definiciones de DMMarket.

Se reduce la fricción en caja, no se eliminan conciliación, formación futura, soporte, seguridad o riesgo de obsolescencia. Tener hitos y condiciones de salida evita convertir la coexistencia en mantenimiento indefinido de dos sistemas. La falta de soporte, incompatibilidad fiscal/hardware, imposibilidad de recuperación o problemas operativos graves pueden obligar a acelerar el reemplazo.

Este enfoque se alinea con modernización gradual [Strangler Fig](https://martinfowler.com/bliki/StranglerFigApplication.html). Como evidencia de que persistencia local no es intrínsecamente antiprofesional, [Dynamics 365 Commerce documenta POS con base offline local y sincronización](https://learn.microsoft.com/en-us/dynamics365/commerce/dev-itpro/pos-offline-functionality). Eso no certifica Solser ni implica recomendar esa plataforma; respalda la validez del patrón arquitectónico.

No se implementó esta arquitectura ni se desplegó Tailscale en otras sedes durante el análisis. Es una recomendación de primera etapa, no una decisión irrevocable de conservar Solser o desarrollar todo el ERP propio.

## Actualización: POS offline y consolidación son innegociables

El usuario precisó que los siete negocios deben unificar información y que, por la conectividad en Venezuela, el POS debe seguir vendiendo de forma sofisticada sin depender de Internet. Prefiere trasladar los servicios centrales a la nube para reducir el riesgo de los servidores físicos actuales. No se interpreta esto como exigir que cada función administrativa central opere offline en cada dispositivo.

La arquitectura a evaluar pasa a ser **servicios centrales en nube + POS/nodo local durable por establecimiento**, con datos consolidados y sincronización de operaciones. Puede utilizarse un POS existente que cumpla las pruebas o un componente propio acotado; no implica desarrollar todo el ERP.

```text
Nube: ERP/backoffice + consolidación + reportes DMMarket
                 ↕ sincronización controlada
Local: POS + datos operativos locales + cola durable + periféricos
```

### Autonomía local, no caché prescindible

No es posible vender sin Internet sin ejecutar lógica y guardar datos en algún dispositivo local. Un nodo puede vivir en una terminal de caja; con varias cajas se evalúa un coordinador por LAN. No necesariamente se mantienen siete servidores ERP completos, pero no desaparece la necesidad de proteger el hardware y los datos pendientes.

La operación local debe confirmar una transacción durable antes de indicar venta registrada, imprimir o iniciar acciones que dependan de ella. Venta y outbox se guardan atómicamente. El envío admite reintentos y duplicados; el receptor aplica efectos idempotentes mediante identidad de negocio/dispositivo/operación y control transaccional. Una operación ya completada con un cliente no se borra silenciosamente porque hubo un problema de sincronización: las excepciones requieren trazabilidad y corrección explícita.

Los estados «guardada localmente», «recibida en nube» y «procesada/contabilizada» deben distinguirse. Los fallos quedan visibles y se recuperan; no basta una promesa genérica de sincronización automática. Reinicios, interrupción de escritura, reenvío de mensajes y duplicados forman parte de la prueba, no solo apagar Wi-Fi.

### Evitar conflictos mediante límites de autoridad

- Stock separado por negocio/almacén; un vendedor de calle puede necesitar stock o cupo asignado, no prometer el stock central como actual mientras está desconectado.
- Precios y tasas versionados, con una política explícita de vigencia offline y conservación de los importes de una venta completada.
- Identidad global de operación distinta de la numeración fiscal. Esta última sigue las reglas legales, equipos y series autorizadas por establecimiento.
- Política de crédito y cobros offline; no afirmar que una transferencia o tarjeta fue autorizada si falta comunicación con el medio de pago correspondiente.
- Datos maestros y documentos tienen dueños definidos; no utilizar una regla genérica «gana el último cambio» para dinero e inventario.
- Contexto de negocio y operador preservado, permisos locales controlados y almacenamiento protegido.

Un stock global estrictamente actualizado y compartido entre nodos desconectados no puede garantizarse sin comunicación. La solución consiste en stock/cupos delimitados, decisiones provisionales o aceptación explícita del riesgo, no en un algoritmo que elimine esa restricción física.

### Nube no protege una venta que todavía no recibió

Si un local pierde Internet y todo su almacenamiento pendiente se destruye antes de sincronizar, la nube no puede recuperar esos datos no transmitidos. Se necesita una protección local proporcional: persistencia robusta, energía de respaldo, copia/replicación local cuando corresponda y procedimiento de recuperación. Un canal alternativo de baja capacidad puede reducir la ventana de exposición. No se promete pérdida cero frente a destrucción de todas las copias durante aislamiento total.

Los reportes centrales deben mostrar última sincronización y pendientes por negocio. Mientras un local esté aislado, la visión global es consolidada pero parcialmente desactualizada; no debe presentar información faltante como cero ventas o como dato actual.

### Consecuencia para la selección

El POS offline estándar de Odoo no se da por aprobado para este requisito; la documentación limita su uso y recuperación. La opción candidata se transforma en **Odoo como backoffice central + POS offline demostrado + DMMarket analítico**. Si se requieren extensiones profundas de integración, debe compararse Odoo.sh o una instalación administrada en nube frente a las restricciones de Online, sin asumir que una API o un módulo resolverán toda la consistencia.

Antes de escribir un POS propio, evaluar uno existente con autonomía durable y una integración verificable. Si ninguno encaja, el desarrollo propio puede concentrarse en el POS, la sincronización y las reglas diferenciales, en lugar de reconstruir también compras, contabilidad y multiempresa.

Los rangos anteriores de tiempo excluyen un motor offline multinodo propio. **No constituyen una estimación integral válida de esta arquitectura nueva.** Se necesita un prototipo de recuperación/sincronización para volver a presupuestar.

Una primera entrega de valor puede ser consolidar en nube la lectura de las siete bases actuales, con identidad compuesta y frescura visible, sin alterar todavía el registro de Solser. Eso permite separar el beneficio urgente de visión de grupo del riesgo de sustituir las cajas. No equivale a una migración terminada ni a una sincronización bidireccional.

## Hechos y límites de la evidencia

### DMMarket

Revisado el código actual:

- `packages/backend/database.js` instancia una conexión MySQL configurada por variables de entorno. No representa por sí sola un modelo multiempresa, registro de siete fuentes o aislamiento por usuario/negocio.
- Las rutas de productos, ventas, compras y facturas revisadas son de consulta. Crear un módulo profesional de registro exige mucho más que agregar formularios a esas consultas.
- Sí existe trabajo transaccional reutilizable en cobranza: `packages/backend/receivables.js:264` utiliza transacción, bloqueo de registros, identificador de operación, control de reintentos y detección de cambios desde la previsualización. No corresponde presupuestar todo desde cero.
- En el punto de entrada y las rutas de cobranza inspeccionadas no se observó un middleware de autenticación/roles de aplicación que identifique al operador antes de esas operaciones. Los controles JSON/cross-site no sustituyen permisos por persona. Esto no es una auditoría completa y podría existir protección externa, pero debe resolverse antes de ampliar el registro de dinero y datos.
- La interfaz React/Bootstrap y las APIs HTTP constituyen una base para acceso móvil conectado. No se halló implementación de service worker, IndexedDB u outbox transaccional en el frontend revisado. No debe confundirse funcionamiento contra un servidor local con autonomía offline de cada teléfono.
- Ya existen reportes específicos, distribución del ejecutable y respaldos locales/Drive que aportan valor real. También hay modernización pendiente del stack y de la infraestructura.

### Piloto Odoo

Se cargaron catálogo, contactos, stock, listas A/B/C y documentos históricos en borrador. Se conciliaron 2.353 grupos FAC contra SQL, incluyendo monto, utilidad, cantidad, promedio de porcentajes y peso. Hay gráficos/listas/tablas dinámicas y una factura de muestra no contabilizada.

Eso demuestra viabilidad de extracción, mapeo e informes de muestra, **no una migración contable completa ni la validación del flujo operativo futuro**. Los reportes espejo usan campos históricos copiados; no actualizan automáticamente sus métricas con transacciones nuevas de Odoo. Fiscalidad, hardware, cartera, comisiones, desempaques y continuidad prolongada todavía requieren comprobación.

La carga de una base no demuestra que las otras seis tengan los mismos códigos, versiones, saldos o reglas. Ver [piloto-odoo.md](piloto-odoo.md).

## El requisito offline tiene tres arquitecturas diferentes

1. **Empresa sin Internet, con LAN y servidor funcionando:** un ERP alojado localmente puede seguir atendiendo a las computadoras conectadas por LAN. No requiere replicar la base a cada caja.
2. **Local aislado del servidor central:** una base alojada en otra sede o en la nube deja de estar alcanzable. Necesita funciones offline del cliente, un nodo local o conectividad alternativa.
3. **Vendedor en la calle sin datos móviles:** no puede acceder en tiempo real a la base central. Necesita datos locales y operaciones en cola. El stock global no puede conocerse como actual sin comunicación.

Tailscale resuelve acceso privado cuando existe conectividad entre equipos. No crea réplicas operativas, no reemplaza permisos de negocio y no es un motor de sincronización. Los respaldos en Drive sirven para recuperación, no para consultar o modificar una nube sincronizada. Un respaldo diario puede implicar perder hasta el intervalo entre respaldos si no existe otra recuperación más granular.

### Qué ofrece Odoo 20 realmente

La documentación actual describe **offline general**, además del POS:

- Acceso a vistas/registros y búsquedas previamente disponibles online.
- Cambios locales en cola y sincronización al recuperar conectividad.
- Creación condicionada a haber creado previamente online un registro del mismo tipo.
- Caché de hasta 2 GB; las actualizaciones forzadas del navegador eliminan datos locales almacenados.
- El proveedor advierte que no está destinado a operación offline completa o prolongada.

El **POS offline** carga productos/clientes en caché y sincroniza pedidos al reconectar, pero no ofrece todas las funciones del backend: facturación solicitada offline se genera después, no hay stock sincronizado en tiempo real y los terminales de pago requieren conexión. La documentación advierte no cerrar/recargar el navegador ni borrar caché antes de sincronizar pedidos pendientes.

Por tanto, sería incorrecto afirmar tanto «Odoo no tiene offline» como «Odoo resuelve cualquier operación sin conexión». Debe probarse el flujo exacto, incluyendo apagado/reinicio y reconexión, no solo cortar Wi-Fi unos minutos.

El autoalojamiento permite operar por LAN, pero devuelve al equipo la responsabilidad de infraestructura y mantenimiento. Odoo Enterprise también requiere comunicación periódica con sus servicios de validación de suscripción; no debe presupuestarse como una instalación Enterprise permanentemente aislada de toda red externa sin revisar condiciones.

## Siete negocios: dónde Odoo aporta más valor

Odoo permite múltiples compañías en **una base de datos** y dispone de permisos por compañía, selección de una o varias entidades, configuración de almacenes, documentos separados y automatización intercompañía.

La topología debe seguir la realidad legal y operativa, no la cantidad de bases antiguas:

- **Entidades legales distintas:** evaluar compañías con sus documentos, cuentas, permisos y obligaciones correspondientes.
- **Locales de la misma entidad:** evaluar sucursales, almacenes y POS; no generar compraventas internas ficticias si corresponde un traslado.
- **Estructura mixta:** combinar estos conceptos con asesoría contable y reglas explícitas.

Productos/contactos pueden compartirse o restringirse. En Odoo se comparten por defecto muchos maestros nuevos, mientras documentos y determinadas propiedades se mantienen por compañía. Eso requiere gobierno de datos: no asumir que activar multiempresa aísla automáticamente todos los datos deseados. La documentación distingue precio/referencia compartidos de costo por compañía; los precios por negocio deben configurarse correctamente con listas y contexto.

Las transacciones intercompañía pueden generar documentos contraparte y sincronizar movimientos según configuración. **No sincronizan siete bases independientes.** Una centralización en una base es una decisión de disponibilidad y de alcance de fallos: una caída central afecta a más operaciones.

Tampoco se debe confundir suma de ventas del grupo con consolidación financiera: si la distribuidora vende a un minimercado propio y este al consumidor, sumar ambos importes puede duplicar ingresos del grupo. Las eliminaciones intercompañía y el beneficio interno en inventario requieren tratamiento contable y configuración, no una simple suma del tablero.

### Qué habría que desarrollar en DMMarket

Además del registro transaccional: aislamiento por empresa, identidad/roles, configuración por negocio, numeraciones, caja, almacenes, consultas seguras por fuente, consolidación, documentos entre negocios, permisos cruzados, migraciones y operación de siete instalaciones.

Agregar un `company_id` o un selector de base no implementa todo lo anterior. No obstante, conservar bases separadas y construir una consolidación de lectura puede ser una alternativa controlada a mezclarlo todo: no es obligatorio que una solución profesional tenga una única base física.

## El trabajo difícil de sincronización existe en ambas opciones

Si cada local debe operar todo el día sin conexión, con clientes nuevos, compras, devoluciones y caja, la solución debe cubrir:

- Operaciones persistentes e identificadores idempotentes para no duplicar ventas/cobros al reintentar.
- Dueño de cada dato y autoridad de escritura; evitar edición simultánea del mismo documento en dos nodos.
- Stock por sede/vehículo, reservas y política explícita frente a ventas concurrentes y stock desactualizado.
- Precios/tasas vigentes al capturar la operación y política de validación al reconectar.
- Correcciones, anulaciones, devoluciones y conciliación de caja.
- Recuperación de pendientes después de reinicio o pérdida del equipo.
- Contexto de compañía y permisos al sincronizar.
- Observabilidad: última sincronización, pendientes, fallos y conflictos visibles para el operador.

No recomiendo replicación multimáster indiscriminada de tablas de dinero/inventario. Para empezar suele ser más controlable una autoridad por documento y sincronización de eventos/documentos, con proyección analítica central de solo lectura.

La preventa offline —capturar pedidos sujetos a validación posterior— es un alcance mucho menor que vender, entregar, cobrar y emitir un documento fiscal definitivo offline. No deben presupuestarse como si fueran la misma función móvil.

## Reportes: conservar el valor sin duplicar el motor comercial

DMMarket puede seguir calculando Pareto, antigüedad de primera compra, compras sin vender, utilidad, rutas, vendedores y reglas particulares.

La integración no es gratuita: deben definirse las equivalencias de venta, pedido, factura, POS, devolución, costo histórico y cobro. Contar simultáneamente un pedido POS y su factura duplicaría una misma operación económica. Tampoco corresponde sustituir costo histórico por costo actual o margen medio de líneas por margen global.

Para reportes exigentes, conviene evaluar una proyección/base de lectura propia, actualizada mediante integración controlada, en lugar de ejecutar continuamente todas las agregaciones sobre las APIs operativas. Esa proyección debe mostrar frescura por negocio y no presentar datos de una sede desconectada como información actual del grupo.

Odoo sería la autoridad transaccional; DMMarket, la autoridad de las definiciones y presentación analíticas. **Híbrido no significa dos sistemas editando la misma deuda o el mismo stock.** Trasladar la autoridad de abonos a Odoo obligaría a reabrir [ADR-0002](adr/0002-registro-principal-abonos.md). La migración tampoco autoriza cambios automáticos a las tablas compartidas de Solser; se mantiene [ADR-0003](adr/0003-esquema-compartido-y-migraciones.md).

## Migración: ninguna opción evita depurar datos

En siete bases, el mismo ID puede identificar productos, clientes o facturas diferentes. Hace falta conservar la identidad `(negocio_origen, id_original)`, mapear duplicados y decidir qué catálogos se comparten. No fusionar por nombre parecido o código local sin verificar.

Los saldos iniciales de stock/deuda, costos, anulaciones y diferencias deben conciliarse también si el destino es DMMarket. Reutilizar sin revisión el esquema de Solser puede trasladar sus problemas a la nueva interfaz. Desarrollar un modelo transaccional nuevo implica su propio corte/migración, aunque se conserve el aspecto visual.

Que los usuarios conozcan los reportes de DMMarket reduce cierta fricción, pero no significa que conozcan el registro de ventas que todavía no existe. Habrá formación en cualquiera de las dos rutas.

## Seguridad, operación y dependencia

Con siete negocios, no es prudente que una única persona sea el único soporte, arquitecto, responsable contable funcional y administrador de recuperación.

Odoo Cloud documenta aislamiento de bases, cifrado, copias y objetivos de disponibilidad/recuperación. Son ventajas de operación gestionada, no garantía de que la configuración del cliente, su conexión o sus equipos estén protegidos. En autoalojamiento, buena parte de esa operación vuelve a ser responsabilidad propia.

DMMarket puede alcanzar una experiencia y seguridad profesionales, pero deben presupuestarse explícitamente identidad/roles, auditoría por actor, autenticación remota, actualizaciones, cifrado, monitorización, restauraciones verificadas, continuidad eléctrica, soporte e incidentes. Tailscale y respaldos diarios son avances, no todo ese programa de seguridad.

Odoo reduce la responsabilidad sobre el núcleo estándar, pero conserva dependencia de proveedor, licencias, consultores e integración. El desarrollo propio reduce ciertas dependencias de plataforma y aumenta las de equipo/código propio. Las personalizaciones y los conectores de Odoo requieren mantenimiento y pruebas al actualizar versiones.

## Tiempo y costo: estimación orientativa

No es una cotización ni una medición de implementación ya realizada. Supuestos: desarrollador sénior dedicado, acceso a operadores y responsable contable, apoyo de alguien con experiencia funcional en Odoo, datos conciliables y hardware/conector fiscal disponibles. No incluye desarrollar un motor nuevo de operación prolongada offline en múltiples nodos.

| Hito | Odoo + DMMarket analítico | DMMarket como sistema transaccional propio |
|---|---|---|
| Un primer local operativo profesional, alcance acotado | 8–16 semanas | 4–8 meses |
| Despliegue progresivo de siete negocios con migración/controles | 4–9 meses | 9–18 meses |
| Offline prolongado, móvil y sincronización compleja | Proyecto adicional que exige prototipo y nueva estimación | También proyecto adicional; no existe hoy |

No sumar las filas: son hitos acumulados. Sin apoyo experimentado en Odoo, utilizar estos rangos para comprometer fechas sería imprudente. Fiscalidad o datos problemáticos pueden invalidarlos.

Para tres años:

`TCO = implementación + migración + formación + 36 × (licencias + infraestructura + soporte) + evolución/actualizaciones + costo esperado de incidentes y salida`

En Odoo, multiempresa y API externa llevan a evaluar el plan Custom. Odoo.sh, implementación, mantenimiento de código propio y determinados servicios no están incluidos simplemente por pagar una suscripción. Cotizar usuarios/roles de caja y condiciones actuales de empleados/light users, no asumir que todos son gratuitos.

Siete compañías en una base no equivalen automáticamente a siete suscripciones completas. Siete bases locales Enterprise son otra topología comercial y operativa que debe cotizarse expresamente; la documentación de registro habla de una base por código de suscripción. No multiplicar ni omitir licencias sin revisar el contrato.

En desarrollo propio, la ausencia de licencia ERP no elimina horas, soporte de siete locales, seguridad, mejoras, incidentes ni dependencia del desarrollador. El valor económico del cliente importa por el costo de una interrupción o un error, no porque permita presumir presupuesto ilimitado.

## Próximo paso recomendado: prueba decisiva, no desarrollo abierto

Dedicar una fase acotada de 3–4 semanas a reducir incertidumbre, con ayuda funcional/fiscal de Odoo y participación de operadores. Criterios:

1. Mapear las siete unidades legales/operativas y definir permisos, almacenes, POS y datos compartidos.
2. Ejecutar venta, compra/recepción, devolución, anulación, cobro parcial y cierre de caja con hardware real y validación fiscal.
3. Probar cortes de red prolongados, reinicio del dispositivo y sincronización; verificar dinero, duplicados, stock y cambio de compañía. No experimentar destructivamente con operaciones reales pendientes.
4. Probar calle: distinguir preventa provisional de venta/cobro/facturación final offline.
5. Reproducir unos pocos reportes decisivos contra operaciones nativas, no solo campos históricos copiados.
6. Descargar/restaurar un respaldo, comprobar recuperación y acordar pérdida/tiempo de recuperación tolerables.
7. Obtener propuesta de licencias, implantación y soporte que corresponda a la topología elegida.

Si pasa estas condiciones con configuración y adaptaciones acotadas, elegir Odoo y desplegar por ondas, no siete locales de golpe. Si falla una condición esencial, cambiar arquitectura o evaluar un ERP orientado a nodos locales antes de asumir que construir todo desde cero es la única alternativa.

Mientras se decide, mejorar seguridad y recuperación del sistema actual es una tarea independiente y urgente; no debe esperar a la migración.

## Fuentes verificadas

- [Offline general, Odoo 20](https://www.odoo.com/documentation/20.0/applications/general/offline_mode.html): límites, precarga, cola y sincronización.
- [Offline POS, Odoo 20](https://www.odoo.com/documentation/20.0/applications/sales/point_of_sale/use.html#offline-pos): funciones excluidas y restricciones del navegador.
- [Multiempresa, Odoo 20](https://www.odoo.com/documentation/20.0/applications/general/companies/multi_company.html): una base, acceso, maestros, intercompañía y plan.
- [Compañías y sucursales](https://www.odoo.com/documentation/20.0/applications/general/companies.html): estructura y límites de configuración.
- [Odoo Online](https://www.odoo.com/documentation/20.0/administration/odoo_online.html): restricciones de módulos y respaldos.
- [API externa JSON-2](https://www.odoo.com/documentation/20.0/developer/reference/external_api.html): acceso y requisitos comerciales.
- [Precios y exclusiones](https://www.odoo.com/pricing): licencias, implantación y mantenimiento no incluidos.
- [Instalación local Enterprise](https://www.odoo.com/documentation/20.0/administration/on_premise.html): registro por base y validación periódica.
- [Seguridad de Odoo](https://www.odoo.com/security) y [objetivos de servicio](https://www.odoo.com/cloud-sla): compromisos publicados por el proveedor, no auditoría independiente de este análisis.
- [Actualizaciones de Odoo](https://www.odoo.com/documentation/20.0/administration/upgrade.html): pruebas y responsabilidad sobre módulos propios.
- [Control de acceso de Tailscale](https://tailscale.com/kb/1018/acls): alcance de red y política de permisos.

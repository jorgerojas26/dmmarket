# Cuentas por cobrar: diseño y alcance

Estado: diseño confirmado e implementado. La habilitación de cobros reales y la carga de toda la cartera histórica siguen pendientes de conciliación operativa; ver `cuentas-por-cobrar-habilitacion.md`.

## Objetivo

Consultar toda la deuda vigente de los clientes, priorizar cobranza y registrar abonos desde Clientes → Cuentas por cobrar. Incluye deuda histórica conciliada, únicamente de facturas. No limita los saldos al período del reporte ni depende del interruptor global Facturas / Notas de entrega.

## Reglas acordadas

- DMMarket será el registro principal de abonos. No habrá dos sistemas registrando independientemente el mismo cobro.
- La generación actual de documentos CxC seguirá incorporando nuevas deudas. DMMarket no añadirá otro generador ni carga manual de documentos.
- Moneda base USD; abonos en USD o bolívares.
- Para bolívares, usar la tasa REF ya almacenada en `divisas`, disponible mediante `/api/currency_rates`. Conservar importe original, moneda, tasa aplicada e importe convertido; no recalcular movimientos históricos cuando cambie la tasa.
- Distribuir automáticamente por vencimiento más antiguo; no permitir distribución manual.
- Aceptar importes positivos válidos aunque superen la deuda. Aplicar hasta cubrir los documentos elegibles y conservar la diferencia como excedente no aplicado, solo informativo.
- No gestionar anticipos, saldos a favor, aplicaciones futuras del excedente ni devoluciones.
- Permitir cerrar manualmente un documento o todos los pendientes del cliente, aunque quede dinero por cobrar. Registrar motivo e importe extinguido; no presentar el cierre como dinero recibido.
- Permitir reabrir un cierre con motivo, restituyendo solo el importe cerrado y conservando los abonos vigentes. No reabrir ventas anuladas.
- Corregir abonos mediante anulación con motivo, conservando el movimiento original y revirtiendo sus aplicaciones.
- No registrar retenciones ni notas de crédito desde esta pantalla. Los ajustes existentes deben estar correctamente representados en la cartera conciliada.
- Mantener acceso actual, sin usuarios ni roles nuevos. No atribuir autoría a una identidad que el sistema no autentica.

## Layout propuesto

### Pantalla principal

Nueva entrada del sidebar de Clientes: Cuentas por cobrar. Mantener la navegación por `view` que ya utiliza Clientes, con una vista propia de cobranza.

```text
Cuentas por cobrar                  Solo facturas · Saldos actuales · USD

[Saldo pendiente] [Saldo vencido] [Clientes con deuda] [Dinero recibido este mes]

[Buscar cliente…] [Ruta] [Cartera] [Vencimiento]

Cliente        Saldo pendiente   Vencido   Documentos   Último abono   Acción
────────────────────────────────────────────────────────────────────────────
Empresa…            $2.450       $1.200        4         08 oct.     Ver cuenta
```

La tabla ocupa el espacio principal. No añadir gráficos decorativos ni métricas de ventas que compitan con la tarea de cobrar.

- Orden inicial por saldo vencido descendente y luego saldo pendiente descendente.
- Búsqueda por nombre o identificación del cliente; filtro por ruta.
- Dos pestañas dentro de Cuentas por cobrar: «Con deuda actual» por defecto e «Historial de clientes». Usan el mismo patrón visual `report-tabs` de Ventas, Compras y Despacho. Solo la tabla, con su búsqueda, impresión y paginación, está dentro de las pestañas; encabezado, resumen y filtros quedan fuera.
- El historial incluye clientes con documentos CxC de facturas en USD registrados, aunque su saldo actual sea cero; no incorpora al catálogo general de clientes que solo compraron de contado. Permite filtrar por estado: todos, con deuda o sin deuda pendiente.
- En el historial se muestran cliente, estado, saldo actual, último abono y la acción «Ver historial». Saldo cero no se presenta como prueba de pago: el estado de cuenta distingue facturas saldadas, cierres manuales y documentos excluidos.
- Abrir una cuenta desde el historial muestra todas sus facturas; desde la cobranza diaria mantiene pendientes por defecto. Se reutilizan el historial de movimientos y las operaciones existentes, incluida la reapertura de cierres.
- La búsqueda y la ruta se conservan al cambiar de pestaña; se reinicia la página y se ordena el historial por cliente. El filtro de vencimiento solo se aplica a la pestaña de deuda actual.
- Vencimiento: todos, vencidos o por vencer. Los documentos sin vencimiento válido no se presentarán como vencidos por una fecha inventada.
- Paginación y ordenamiento en servidor; mantener búsqueda, filtros, página y desplazamiento al cerrar el modal.
- El saldo pendiente cubre toda la deuda vigente. No aplicar el rango mensual al saldo.
- El KPI de dinero recibido suma importes base de abonos vigentes del mes, incluidos sus excedentes informativos. Excluir abonos anulados; los cierres manuales no son cobros.
- Los KPIs describen toda la cartera de la ruta seleccionada y se identifican como «Resumen de cartera». La búsqueda, la paginación y los filtros de estado/vencimiento afectan la tabla, no cambian silenciosamente el resumen.
- Vencido significa fecha de vencimiento anterior al día actual del negocio. Los documentos que vencen hoy no están vencidos. Usar el calendario de Venezuela para cortes diarios y mensuales.
- Importes alineados a la derecha, cifras con formato uniforme y moneda explícita. No ocultar diferencias pequeñas únicamente por redondeo visual.
- Si el cliente queda saldado, puede desaparecer de la vista «con deuda», pero su modal e historial permanecen abiertos hasta que el usuario los cierre.

### Modal del cliente

Modal amplio, dos columnas en escritorio y contenido apilado a pantalla completa en móvil.

```text
Cliente · identificación · ruta                  [Registrar abono] [×]

[Saldo pendiente] [Saldo vencido] [Documentos pendientes]

Documentos                                         Timeline
Venta · emisión · vencimiento                     Abono · fecha · importe
Original · aplicado · cierre · saldo              Moneda · tasa · método
Estado · acción de cierre/reapertura               Referencia · aplicaciones
                                                   Excedente, si existe
                                                   Anulaciones y cierres

Acción secundaria: Cerrar deuda del cliente
```

- «Registrar abono» es la acción principal.
- «Cerrar deuda» es secundaria y no se disfraza de pago.
- Diferenciar deuda liquidada por abonos de deuda cerrada manualmente.
- Mostrar documentos pendientes por defecto y permitir consultar saldados para historial y reapertura.
- Timeline del registro más reciente al más antiguo, con carga paginada. Conservar y distinguir la fecha de pago cuando sea diferente de la fecha de registro; para movimientos históricos sin metadatos de registro, usar su fecha existente.
- Distinguir visualmente abono, anulación, cierre y reapertura mediante etiqueta y texto, no solo color.
- En el timeline conservar importe recibido, equivalente USD, tasa aplicada, importe aplicado y excedente informativo.
- No fabricar eventos de pago para explicar saldos iniciales sin evidencia. El historial importado solo se mostrará cuando esté conciliado y sin duplicados.

### Registrar abono

Formulario dentro del modal, sin abrir otro modal encima. Puede reemplazar temporalmente la columna del timeline y ofrecer una acción de volver.

Campos propuestos: importe, moneda, fecha del pago, método, referencia y observaciones. Banco cuando corresponda al método. La fecha se propone como hoy y se permite editar; la tasa utilizada para un nuevo abono en bolívares es la REF disponible al confirmar, no una tasa histórica inferida.

Mostrar antes de guardar:

```text
Recibido: Bs …
Tasa aplicada: … Bs/USD
Equivalente: USD …
Aplicación automática: documentos e importes
Saldo resultante: USD …
Excedente no aplicado: USD …, cuando corresponda
```

- No forzar un importe igual a la deuda ni impedir sobrepagos por ese motivo.
- No convertir un excedente informativo en crédito disponible.
- Si hay faltante, conservarlo hasta que el usuario decida cerrarlo mediante la acción explícita.
- Mostrar confirmación y resultado sin perder el contexto del cliente.
- Ante error, conservar los campos y mostrar una explicación accionable.
- Si cambia la deuda o la tasa entre previsualización y confirmación, solicitar revisión del nuevo resultado, sin modificar silenciosamente lo confirmado.
- Si la tasa no está disponible o no es positiva, no inventar una tasa ni registrar un abono en bolívares; los abonos USD no dependen de esa tasa.

### Cerrar, reabrir y anular

Mostrar dentro del mismo modal el alcance de la acción, documentos e importe afectado, y solicitar motivo y confirmación explícita. No exigir coincidencia entre abonos y deuda para permitir un cierre.

- El cierre extingue únicamente el saldo pendiente elegido y genera un evento distinto de un abono.
- Reabrir revierte únicamente un cierre vigente, sin deshacer pagos.
- Anular revierte únicamente las aplicaciones del abono, conserva el importe original y deja sin efecto su excedente informativo.
- Si un documento tiene abonos y cierre manual, sus correcciones son independientes: anular el abono no borra el cierre; reabrir el cierre no anula el abono.
- Impedir aplicar una corrección dos veces.

## Requisitos técnicos propuestos

El esquema ya soporta documentos, abonos multimoneda y aplicaciones, pero no representa explícitamente todos los eventos acordados. La implementación requerirá extensiones mínimas para anulación de abonos, cierres, reaperturas y prevención de registros duplicados. No guardar un cierre como un abono ficticio.

- Operaciones de registro, aplicación y actualización de saldos dentro de una transacción, con bloqueo de los documentos afectados.
- Comprobar en servidor cliente, documento vigente, importe positivo, tasa válida, saldo disponible y estado actual de cada acción.
- Aplicaciones deterministas: vencimiento más antiguo, luego emisión e identificador como desempate. Los documentos conciliados sin vencimiento válido van después de los que sí tienen vencimiento y se ordenan por emisión e identificador; no asignarles una mora ficticia.
- No permitir saldos negativos ni aplicaciones por encima del saldo, aunque el importe recibido sea mayor.
- Calcular importes con aritmética decimal y una política de redondeo explícita compatible con los DECIMAL existentes; no usar flotantes como fuente de verdad financiera.
- Guardar la tasa confirmada desde la fuente del servidor, no confiar únicamente en la tasa enviada por el navegador.
- Evitar duplicados por doble clic, reintentos de red o respuestas perdidas. Deshabilitar el botón durante envío no sustituye la protección del servidor.
- Actualizar KPIs, tabla, documentos y timeline después de cada operación exitosa.
- No usar caché de reportes que pueda mostrar saldos anteriores a una escritura.
- Conservar fechas y motivos de eventos, sin inventar identidad de usuario.

## Accesibilidad y estados

- Nombre accesible para el modal, foco dentro de él, navegación con Tab, cierre con Escape y restauración del foco al elemento de origen.
- Acciones de fila accesibles por teclado; no depender únicamente de clics en la fila.
- Con cambios sin guardar, solicitar confirmación antes de descartarlos, sin superponer diálogos innecesarios.
- Contraste, foco visible, etiquetas de formulario, errores asociados a campos y avisos de resultado accesibles.
- Diferenciar carga, ausencia de deuda, ausencia de resultados y error de consulta. Un error no se muestra como saldo cero.
- El acceso sin usuarios implica que cualquier persona con acceso a DMMarket puede ejecutar acciones financieras; no se presenta este alcance como control de permisos por operador.

Referencias: [WAI-ARIA Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialogmodal/) y [NN/g: Data Tables](https://www.nngroup.com/articles/data-tables/).

## Validación antes de habilitar cobros

Los hallazgos de `cuentas-por-cobrar-validacion.md` corresponden únicamente a la copia local. No son una autorización para corregir o migrar datos operativos.

Antes del corte se debe validar el servidor operativo, el generador actual de documentos y el cese de escrituras externas de abonos; conciliar ventas anuladas, registros de pago, deuda histórica, clientes ausentes y diferencias de estado. El generador de documentos no debe sobrescribir saldos de abonos o cierres administrados por DMMarket.

Los registros dudosos no se mostrarán como deuda cobrable sin validación. No sumar las dos estructuras ni descontar automáticamente todos los registros de `pagos`.

## Casos de aceptación

1. Cliente debe USD 100 y abona USD 30: aplicación automática y saldo USD 70.
2. Cliente debe USD 100 y abona USD 120: recibido USD 120, aplicado USD 100, excedente informativo USD 20 y deuda cero; sin crédito ni devolución.
3. Cliente debe USD 100 y abona USD 99,70: quedan USD 0,30. El usuario puede cerrar ese saldo con motivo; dinero recibido sigue siendo USD 99,70.
4. Reabrir el cierre anterior restituye USD 0,30 y conserva el abono USD 99,70.
5. Anular un abono revierte sus aplicaciones una sola vez, conserva su historial y actualiza saldos y KPIs.
6. Abono en bolívares conserva la tasa REF aplicada aunque cambie después.
7. Dos registros simultáneos no aplican más dinero que el saldo disponible.
8. Reintentar una solicitud no crea un segundo abono.
9. Una venta anulada no recibe abonos ni se reabre.
10. Retomar un cliente saldado permite consultar su timeline y reabrir cierres vigentes.

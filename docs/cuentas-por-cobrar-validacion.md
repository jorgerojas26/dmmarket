# Validación de cuentas por cobrar

## Alcance y límites

Inspección de solo lectura de la copia local `dm_mysql`, base `bdsolser_md_nieto`, utilizada por `docker-compose.yml`. El servidor configurado en el backend no respondió al intento de conexión. Los resultados no certifican la cartera operativa ni su actualización.

Se consultaron esquema, triggers, rutinas, documentos, movimientos, aplicaciones, ventas y registros de medios de pago. No se modificaron datos. Las comparaciones más extensas se ejecutaron dentro de transacciones de solo lectura.

Los nombres «modelo anterior» y «modelo nuevo» distinguen estructuras, no establecen cuál es la fuente autorizada del negocio.

## Soporte existente

| Tabla | Función observada | Registros locales |
|---|---|---:|
| `cxc_documentos` | Documento, cliente, moneda, vencimiento, monto original, saldo y estado | 241 |
| `cxc_movimientos` | Abono, moneda, tasa, monto base, método y referencia | 22 |
| `cxc_cruces` | Aplicación del movimiento a un documento | 27 |
| `cxc_retenciones` | Retenciones de IVA e ISLR | 0 |
| `cxcmoves` | Movimientos de debe y haber por venta | 3.428 |
| `pagos` | Registro de medios de pago por documento y fuente | 204.776 |

Los documentos `cxc_*` corresponden a 117 clientes y al período 2026-07-15 a 2026-09-30. Todos son FAC, USD, y tienen una venta correspondiente en `masterfact`, con el mismo cliente, emisión y vencimiento.

Los movimientos de `cxcmoves` abarcan 2020-01-25 a 2026-09-30. Todos encuentran un identificador en `masterfact`; tres también encuentran un identificador en `masternoe`. Un identificador sin origen explícito no es suficiente para vincular ambos juegos de ventas indistintamente.

Los 22 abonos de `cxc_movimientos` están registrados en BsS. La conversión observada es `MontoBase = MontoPago / TasaCambio`, con diferencias inferiores a USD 0,01. Todos los importes y tasas son positivos; las aplicaciones también.

No se encontraron referencias a las tablas CxC en el código de `packages`. No se encontraron triggers de sincronización entre ambas estructuras en la copia inspeccionada. Esto no descarta escrituras desde un sistema externo.

## Comparación entre estructuras

La coincidencia se evaluó por cliente, identificador de venta y moneda.

- Hay 210 documentos compartidos.
- En 187 coincide el saldo, con tolerancia de USD 0,01.
- En 23 difiere el saldo. En todos, la diferencia coincide con las aplicaciones de `cxc_cruces`: USD 15.226,33 en total. En esta copia, esas aplicaciones no están reflejadas en el saldo de `cxcmoves`.
- Hay 31 documentos exclusivos de `cxc_documentos`: 26 pendientes y cinco anulados.
- Hay 144 grupos de venta/cliente/moneda con saldo positivo en `cxcmoves` sin documento correspondiente en `cxc_documentos`: USD 24.156,39, con fechas de emisión entre 2020-05-21 y 2026-07-03.
- De esos 144, 32 documentos, por USD 21.413,21, tienen cliente identificable en el catálogo; 112, por USD 2.743,18, no encuentran cliente en el catálogo ni usando la identificación de la venta. No deben asignarse automáticamente.

Los importes son saldos observados, no deuda validada para cobro. No se deben sumar ambas estructuras.

## Diferencias que impiden habilitar cobros sin validar

### Anulaciones

Hay 26 documentos PENDIENTE, por USD 20.725,66, cuya venta en `masterfact` está anulada. Son los 26 documentos pendientes exclusivos de `cxc_documentos`.

Otros cinco documentos ANULADO sí coinciden con ventas anuladas y tienen saldo cero.

### Estado y saldo

Seis documentos PAGADO tienen saldo positivo por USD 1.308,62 en total. El saldo coincide con monto original menos aplicaciones de `cxc_cruces`, pero contradice el estado PAGADO.

Excluir solo por estado ocultaría esos saldos. Cobrar solo por saldo positivo también sería incorrecto sin validar anulaciones y pagos.

### Pagos fuera del historial CxC

Cinco documentos PENDIENTE tienen saldo inferior al monto original sin aplicaciones en `cxc_cruces`. Las diferencias coinciden con registros en `pagos`, fuente FAC, medio TD (T. DEBITO): USD 2.657,98 en total.

Esto ofrece una explicación posible de los saldos, pero no demuestra por sí solo cómo el sistema operativo reconoce esos pagos.

Además, 38 documentos PENDIENTE de ventas no anuladas tienen registros TD en `pagos` iguales a su monto completo, mientras `cxc_documentos` mantiene ese mismo importe como saldo: USD 33.091,84.

Dos documentos PAGADO también tienen registros en `pagos` y aplicaciones CxC. No se pueden descontar ambos conjuntos sin establecer si representan el mismo dinero.

Una fórmula global `monto original - pagos - aplicaciones CxC` produce diferencias superiores a USD 0,01 en 43 documentos no marcados ANULADO, tres de ellos con venta anulada. Por tanto, no se recomienda reconstruir automáticamente los saldos con esa fórmula.

### Abono no completamente aplicado

El movimiento 16 tiene monto base USD 999,9863 y aplicaciones por USD 999,10: quedan USD 0,8863 sin aplicar. El esquema no permite concluir si es saldo a favor, redondeo, comisión o error. Ningún movimiento tiene aplicaciones superiores a su monto base con tolerancia de USD 0,01.

## Cifra técnica, no KPI autorizado

Excluyendo ventas anuladas y documentos ANULADO, pero incluyendo todos los saldos positivos independientemente del estado PAGADO, se obtiene:

- 194 documentos.
- 107 clientes.
- USD 109.348,01 de saldo almacenado.

Esta cifra incluye las contradicciones con `pagos` descritas arriba. No debe presentarse como cartera conciliada.

## Decisiones acordadas de UX

- Nueva pestaña en el sidebar de Clientes: Cuentas por cobrar.
- Dashboard pequeño y tabla de clientes con deuda.
- Modal amplio con documentos pendientes y timeline de abonos en dos columnas; disposición apilada en móvil.
- Formulario de abono dentro del mismo modal, sin superponer otro.
- Moneda base USD; permitir abonos en USD o bolívares y conservar la tasa aplicada.

## Decisiones acordadas de operación

- DMMarket será el registro principal de abonos. El sistema anterior dejará de modificar esos mismos cobros; no se mantendrán dos registros independientes del mismo abono.
- La cobertura será toda deuda vigente, incluida la histórica, una vez validada. No se limitará a documentos desde julio de 2026.
- Aplicación siempre automática por vencimiento más antiguo; sin distribución manual.
- Permitir importes positivos aunque excedan la deuda. Conservar importe real, aplicar hasta cubrir deuda y mostrar excedente no aplicado solo como información; sin anticipos, saldos a favor ni devoluciones.
- Permitir cierre manual con motivo por documento o por cliente, sin contar la diferencia como dinero cobrado.
- Corregir abonos mediante anulación con motivo, conservando el original y revirtiendo sus aplicaciones.
- Solo abonos de dinero en esta pantalla; no registrar retenciones ni notas de crédito.
- Usar la tasa REF existente, proveniente de `divisas` mediante `/api/currency_rates`, y conservar la tasa aplicada en cada abono.
- Mantener el acceso actual sin introducir usuarios ni roles; no atribuir autoría confiable donde no existe autenticación.
- Solo facturas; la cartera será independiente del interruptor global Facturas / Notas de entrega.
- Las nuevas deudas seguirán entrando mediante la generación CxC actual del sistema de ventas; DMMarket no incorporará un segundo generador ni carga manual de documentos.
- Permitir reapertura de cierres manuales con motivo, restituyendo solo el importe cerrado y conservando los abonos vigentes; nunca reabrir una venta anulada.
- Estas decisiones no autorizan corregir saldos ni migrar registros todavía.

## Pendientes antes de implementar escrituras

1. Validar estos resultados contra la base operativa y el sistema que actualmente registra cobros.
2. Establecer la fuente autorizada del saldo y la semántica de `pagos` frente a CxC.
3. Definir cobertura histórica y tratamiento de clientes ausentes.
4. Resolver anulaciones, estados contradictorios y abonos no aplicados sin inventar movimientos.
5. Verificar la transición a DMMarket como registro principal de abonos y que el generador actual no sobrescriba los saldos modificados por cobros o cierres.
6. Confirmar el diseño y alcance documentados en `cuentas-por-cobrar-diseno.md` antes de implementar.

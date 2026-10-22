# Cierre masivo de cuentas por cobrar

## Ejecución local simplificada

Realizar y verificar el respaldo manualmente antes de ejecutar. Desde la raíz del repositorio:

```sh
bun scripts/close-local-receivables.mjs
```

Este lanzador está limitado al contenedor `dm_mysql`, base `bdsolser_md_nieto`, conexión `127.0.0.1:3307`, con las credenciales locales del proyecto. No admite cambiar la conexión ni sirve para producción.

Incluye todas las deudas vigentes detectadas, sin exigir una cantidad fija de clientes. Si no hay deuda, termina sin cambios. Muestra cuántos clientes, documentos y dólares se cerrarán. Detener DMMarket y cualquier proceso que escriba ventas o cobranza, sin detener MySQL; escribir `CERRAR` confirma que el respaldo manual ya está listo y autoriza el cierre. Cualquier otra respuesta cancela sin modificar la base.

No genera, lee ni verifica archivos de respaldo. Esa preparación es responsabilidad del operador. Ejecuta el plan con las mismas validaciones transaccionales del script principal y guarda plan, configuración y recibo en una carpeta privada `.cache/cierre-local-*`, cuya ubicación imprime.

Si una ejecución queda con resultado incierto o recibo `prepared`, no repetir este lanzador: investigar y reutilizar el plan existente como se indica al final de esta guía. En producción se mantiene el procedimiento explícito de las secciones siguientes.

## Decisión y estudio local

Alcance confirmado: cierre manual por saneamiento de la deuda visible en DMMarket. **No representa dinero recibido ni una conciliación de pagos.**

Inspección del 19/10/2026, únicamente en `127.0.0.1:3307`, contenedor `dm_mysql`, base `bdsolser_md_nieto`:

| Concepto | Resultado |
|---|---:|
| Clientes con deuda visible | 107 |
| Documentos que se cerrarían | 194 |
| Saldo exacto, USD | 109345.2728 |
| Emisión de estos documentos | 15/07/2026 a 30/09/2026 |
| Documentos incluidos con estado PAGADO pero saldo positivo | 5 |
| Documentos de ventas anuladas excluidos | 26 |
| Saldo de ventas anuladas que no se toca, USD | 20725.6600 |

Se seleccionan documentos `FAC`, moneda `USD`, estado distinto de `ANULADO`, saldo positivo, venta existente en `masterfact` con `Anulada = 0` y mismo cliente. Es el alcance de la cartera visible, no toda la deuda histórica de otras estructuras. Los cinco documentos PAGADO con saldo positivo también están incluidos porque DMMarket los cuenta como deuda.

El saldo difiere de la inspección antigua de [validación de cuentas por cobrar](cuentas-por-cobrar-validacion.md): la copia actual ya contiene operaciones posteriores. No se asume que producción tenga el mismo importe.

**No se cerraron deudas en la base local original y no se accedió a producción.** Solo se generó este plan de lectura, privado e ignorado por Git:

`.cache/receivables-close/local-plan.json`

No usar ese plan en producción: está ligado a la conexión y base local.

## Archivos y comportamiento

Script: `scripts/close-receivables.mjs`. Ejecutarlo con Bun desde la raíz del repositorio, con las dependencias instaladas (`bun install --frozen-lockfile` si hace falta). No es un comando del ejecutable compilado de DMMarket.

- `plan`: transacción de **solo lectura**, genera JSON con cliente, documentos, importe, motivo, huellas de estado e identificadores de operación. Incluye todos los clientes con deuda vigente del destino, sin requisito de cantidad; admite también una cartera vacía.
- `rehearse`: ejecuta todos los cierres y verifica el resultado, pero hace **ROLLBACK**. Es una escritura temporal, no una simulación de solo lectura; puede consumir números autoincrementales y dejar huecos. Preferir una copia restaurada.
- `apply`: ejecuta exactamente el plan aprobado en **una única transacción**. Reutiliza el servicio de cierres de DMMarket, con motivo e historial, sin inventar abonos.

Por cada cliente se registra una operación `CIERRE`; por cada documento, el importe extinguido en `cxc_cierres`. El documento queda con saldo cero y estado `PAGADO`, como en el cierre manual de la aplicación; el historial distingue ese cierre de un pago.

No modifica `cxc_movimientos`, `cxc_cruces`, `cxcmoves`, `pagos`, ventas, inventario ni documentos excluidos. No reconstruye saldos ni borra registros.

## 1. Preparar producción

1. Programar una ventana de mantenimiento. Detener DMMarket y cualquier sistema, tarea o generador que pueda modificar ventas o cobranza. Mantenerlos detenidos desde el respaldo y plan definitivo hasta la verificación posterior. `--maintenance` es tu confirmación, **no detiene servicios automáticamente**.
2. Obtener manualmente un respaldo **completo** de la base correcta y comprobar que se restaura en una base separada. Conservar también triggers, rutinas y eventos según la política de respaldo del negocio. El script **no genera, lee ni verifica respaldos**. `--backup-confirmed` es la declaración del operador de que el respaldo previo está listo y verificado; no es una comprobación automática.
3. Verificar que existen `cxc_documentos`, `cxc_movimientos`, `cxc_cruces`, `cxc_operaciones`, `cxc_cierres`, `clientes` y `masterfact`, todas InnoDB. El usuario de conexión debe poder consultar el esquema y triggers, leer estas tablas y escribir en las tres tablas del cierre.
4. Si faltan `cxc_operaciones` o `cxc_cierres`, detenerse: la copia de producción de referencia no las incluía. Preparar primero el esquema propio mediante el despliegue controlado de la versión de DMMarket que contiene `20261011_add_receivables_operations.js`, siguiendo [habilitación](cuentas-por-cobrar-habilitacion.md) y [ADR-0003](adr/0003-esquema-compartido-y-migraciones.md). **No ejecutar todas las migraciones pendientes como atajo.** Este script no crea tablas ni migra datos.
5. Si hay triggers en `cxc_documentos`, `cxc_operaciones` o `cxc_cierres`, el script se detiene. No quitarlos para forzarlo: hay que revisar sus efectos.

Validado con MySQL **5.7.44**. La transacción de solo lectura utilizada requiere MySQL 5.6.5 o posterior; no usar este procedimiento sin adaptación en MySQL 5.0. Validar previamente la versión y esquema reales de producción en una copia restaurada.

Crear un archivo privado, por ejemplo `C:/DMMarket/privado/cierre-produccion.env` en Windows o `/ruta/privada/cierre-produccion.env` en Linux/macOS:

```dotenv
DATABASE_HOST=127.0.0.1
DATABASE_PORT=3306
DATABASE_USER=USUARIO_AUTORIZADO
DATABASE_PASSWORD=CONTRASENA_REAL
DATABASE_NAME=BASE_REAL
```

Los valores son ejemplos: comprobarlos antes de conectar. El script exige `--env` y lee **solo ese archivo** para la conexión; no utiliza la configuración automática de Bun ni la del backend. Puede ejecutarse en el servidor o desde un equipo administrativo con conexión segura a MySQL. No abrir MySQL a Internet.

Guardar respaldos, planes, recibos y credenciales fuera del repositorio, en un directorio con acceso restringido. Los planes contienen datos de clientes; no compartirlos públicamente. En Windows, comprobar también los permisos de la carpeta.

## 2. Generar y revisar el plan

Sustituir las rutas de ejemplo. El directorio de salida debe existir; el archivo del plan no debe existir todavía.

```sh
bun scripts/close-receivables.mjs plan --env "/ruta/privada/cierre-produccion.env" --out "/ruta/privada/plan-cierre-produccion.json"
```

La salida muestra destino, cantidad de clientes, documentos, total exacto y `SHA256` del archivo. Abrir el JSON y revisar:

- Base, host, puerto e identidad del servidor.
- Todos los clientes detectados y sus documentos; importes exactos con cuatro decimales.
- Motivo: `Cierre manual masivo por saneamiento de cartera autorizado por el responsable del negocio`.
- Total que se autoriza extinguir. **Producción puede diferir de la copia local.**

Guardar la huella impresa. No editar el JSON. Si hay que cambiar el alcance o motivo, revisar el procedimiento, no alterar el plan a mano.

La cantidad de clientes se obtiene de la cartera actual: no hay mínimo, máximo ni requisito de que sean 107. Las cifras de la inspección inicial son solo históricas. Si ya se cerraron deudas manualmente, el siguiente plan incluirá únicamente las que sigan pendientes. El campo `expectedClients` del JSON registra el conteo detectado para comprobar la integridad del archivo, no impone una cantidad fija. Si la cartera cambia después de generar el plan, se mantiene el rechazo por snapshot y debe generarse uno nuevo.

## 3. Ensayar en una copia restaurada

Crear otro `.env` que apunte a la copia, generar **su propio plan** y ejecutar:

```sh
bun scripts/close-receivables.mjs plan --env "/ruta/privada/cierre-copia.env" --out "/ruta/privada/plan-cierre-copia.json"
bun scripts/close-receivables.mjs rehearse --env "/ruta/privada/cierre-copia.env" --plan "/ruta/privada/plan-cierre-copia.json" --confirm "SHA256_DEL_PLAN_DE_LA_COPIA" --maintenance
```

Resultado esperado: `rolled-back`; saldos e historial financiero quedan como antes. Las instrucciones son iguales en PowerShell, sustituyendo las rutas. La huella de la copia no vale para el plan de producción.

En una copia desechable también se puede probar `apply` y sus comprobaciones posteriores antes de autorizar producción. Nunca dar por restaurable un respaldo únicamente porque el ensayo terminó bien.

## 4. Aplicar manualmente en producción

Con respaldo comprobado, mantenimiento todavía activo, plan revisado y **su huella real**:

```sh
bun scripts/close-receivables.mjs apply --env "/ruta/privada/cierre-produccion.env" --plan "/ruta/privada/plan-cierre-produccion.json" --confirm "SHA256_DEL_PLAN_DE_PRODUCCION" --maintenance --backup-confirmed --report "/ruta/privada/recibo-cierre-produccion.json"
```

Resultado esperado: `committed`. El recibo registra `backupConfirmed: true` como confirmación del operador, sin ruta ni hash del respaldo. Conservar el plan, respaldo manual y recibo juntos. `--report` es opcional; si se omite, se crea un recibo de nombre único junto al plan. No se sobrescriben planes ni recibos existentes.

Antes de cerrar, el script bloquea documentos CxC, clientes y ventas relacionados, y cierres; vuelve a calcular y comparar el plan. Si cambió la cartera, el destino no coincide, aparece un error o queda deuda visible pendiente, no confirma el lote. Los cierres de clientes anteriores dentro del mismo lote también se revierten ante un fallo posterior. Las esperas por bloqueos se limitan a 15 segundos.

No ejecutar migraciones ni cambios de esquema concurrentemente. Los bloqueos no sustituyen la ventana de mantenimiento ni controlan escrituras de sistemas externos después del COMMIT.

## 5. Verificar y reanudar

Antes de reanudar los servicios, comprobar en la base correcta:

```sql
SELECT COUNT(DISTINCT d.IdCliente) AS clientes_con_deuda,
       COUNT(*) AS documentos_con_deuda,
       COALESCE(SUM(d.SaldoActual), 0) AS saldo_usd
FROM cxc_documentos d
JOIN masterfact f ON f.IdFactura = d.IdFactura AND f.IdCliente = d.IdCliente
WHERE d.TipoDoc = 'FAC'
  AND d.MonedaOriginal = 'USD'
  AND d.Estatus <> 'ANULADO'
  AND f.Anulada = 0
  AND d.SaldoActual > 0;
```

Los tres resultados deben ser cero en ese instante. Contrastar los `operationIds` del recibo con `cxc_operaciones` y sus documentos de `cxc_cierres`; deben coincidir con el número de clientes, documentos y total del plan. Abrir Clientes → Cuentas por cobrar y revisar el historial de algunos clientes.

El script comprueba esos ceros y el total de cierres antes de COMMIT; la consulta posterior confirma el estado desde otra conexión. El saldo positivo de las 26 ventas anuladas seguirá almacenado: es intencional y está fuera del alcance acordado. `cxcmoves` seguirá mostrando su saldo antiguo si otro sistema lo utiliza; este procedimiento no hace desaparecer la deuda de ese otro sistema.

Reanudar los sistemas y vigilar que el generador antiguo no reconstruya ni sobrescriba saldos cerrados. Las nuevas ventas pueden crear deuda nueva normalmente.

## Fallos, reintentos y reversión

- `already-applied`: todas las operaciones del mismo plan ya están registradas; no vuelve a cerrarlas ni toma deuda nueva. No significa que el cliente no haya adquirido deuda después.
- Error por cambios: investigar y generar un plan nuevo después de una nueva revisión. No forzar el plan anterior.
- Error de conexión durante COMMIT, o recibo `prepared`: el resultado puede ser incierto. Revisar los identificadores del plan en la base antes de decidir. Reintentar **con el mismo plan y huella** es idempotente; usar otro nombre de recibo u omitir `--report`. No generar otro plan para resolver una confirmación incierta.
- Si solo parte de los identificadores está registrada o un identificador corresponde a otra operación, el script se detiene para investigación.
- Un cierre ya confirmado no se revierte con SQL a ciegas ni borrando el historial. DMMarket permite **reabrir el cierre por documento con motivo**, restituyendo únicamente el importe cerrado y conservando los abonos. Una restauración completa del respaldo requiere mantener el corte operativo y valorar cualquier actividad posterior; no es una reversión selectiva.

## Validación realizada

En una copia desechable de las siete tablas necesarias, creada exclusivamente para validar este script:

- Plan local: 107 clientes, 194 documentos, USD 109345.2728.
- Ensayo completo: `rolled-back`, sin cierres financieros persistentes.
- Fallo deliberado en la última solicitud: reversión de los cierres anteriores del lote, comprobada contra los datos de origen.
- Cambio de USD 0.0001 después del plan: rechazo sin cierre.
- Aplicación real en la copia: 107 operaciones `CIERRE`, 194 registros de cierre, importe exacto y cero deuda visible.
- Reintento del mismo plan: `already-applied`, sin duplicados.
- Comprobación de que pagos, aplicaciones, ventas, clientes y documentos excluidos conservan sus datos.
- Tras eliminar la cantidad fija: generación de plan para la cartera local actual de 106 clientes y cancelación sin cambios.
- En otra copia desechable: cartera vacía, cierre de 2 clientes con 3 documentos, ensayo con rollback y reintento sin duplicados, sin generar respaldos.

No se añadieron pruebas unitarias. El único COMMIT de cierres realizado durante la validación fue sobre la copia desechable, no sobre `bdsolser_md_nieto` ni producción.

# Habilitar cuentas por cobrar

## Pantalla

Clientes → Cuentas por cobrar, o `/clientes?view=receivables`.

El módulo permite registrar abonos, anularlos, cerrar deudas y reabrir cierres cuando su esquema está disponible, sin una habilitación adicional por configuración. Se conservan las validaciones de cliente, deuda, tasa, previsualización y confirmación de cada operación.

La inspección de la copia local encontró inconsistencias y no certifica la cartera operativa. El respaldo, la conciliación y el corte del sistema anterior siguen siendo requisitos operativos antes de registrar cobros.

## Esquema

El módulo requiere las tablas actuales `cxc_documentos`, `cxc_movimientos`, `cxc_cruces`, además de `clientes`, `masterfact` y `divisas`.

La migración `20261011_add_receivables_operations.js` añade:

- `cxc_operaciones`: operaciones confirmadas, identificador de solicitud, huella, fecha, motivo y detalle para historial e idempotencia.
- `cxc_cierres`: importe extinguido por documento y su eventual reapertura.

No migra deuda desde `cxcmoves`, no corrige saldos ni genera pagos históricos. Conserva `cxc_cruces` al anular un abono; la anulación queda explícita en `cxc_operaciones` y las consultas de DMMarket excluyen sus aplicaciones y cobros.

Si faltan las tablas CxC originales, la migración no crea la extensión y la pantalla devuelve un error de esquema, no una cartera vacía. Es necesario instalar y validar primero el esquema de origen. Si la migración ya quedó registrada sin esas tablas, la extensión se puede aplicar idempotentemente desde `packages/backend` una vez instalado el esquema:

```sh
bun -e 'require("dotenv").config(); const db=require("./database"); await require("./migrations/20261011_add_receivables_operations").up(db); await db.destroy();'
```

## Antes del corte operativo

1. Generar y comprobar un respaldo recuperable de la base correcta.
2. Validar la cartera operativa, no asumir que coincide con el dump local. Revisar `cuentas-por-cobrar-validacion.md`.
3. Conciliar pagos de `pagos` y `cxcmoves`, aplicaciones CxC, ventas anuladas, estados contradictorios y clientes ausentes. Incluir toda deuda histórica vigente en la cartera validada sin duplicar ventas ni cobros.
4. Revisar que el generador actual crea documentos de facturas en USD y no sobrescribe saldos modificados por abonos o cierres. DMMarket no añade otro generador.
5. Detener las escrituras de abonos del sistema anterior para esa misma cartera. El sistema de ventas puede seguir generando documentos CxC conforme al proceso validado.
6. Aplicar las migraciones y verificar la cartera conciliada antes de registrar operaciones.

En desarrollo, verificar primero el destino definido en `.env` y luego ejecutar:

```sh
bun --filter @dmmarket/backend migrate
```

El binario compilado aplica las migraciones pendientes al iniciar. No ejecutar una actualización sobre una cartera sin respaldo y validación del esquema.

## Operación

Se mantiene el acceso actual sin usuarios: quien acceda a DMMarket puede operar. Restringir el acceso al sistema al personal autorizado.

La tasa de un abono en bolívares es editable y debe ser positiva con hasta 6 decimales. Si el pago es de hoy y no se indica otra, se usa la REF de `divisas` (`Simbolo = 'BsS'`). Si la fecha es anterior, la tasa es obligatoria: la conversión no consulta todavía `bcv_tasas` y no reutiliza la de hoy. El servidor conserva la tasa aplicada y su origen (`REF` o indicada por el operador) en el movimiento y en el historial de la operación.

## Verificaciones de operación

- Un abono requiere previsualización y confirmación. Cambios de deuda o tasa invalidan la previsualización.
- El importe real recibido puede superar la deuda; el excedente se conserva únicamente como información y no queda disponible para nuevas aplicaciones.
- Un cierre manual no es dinero cobrado. Su reapertura restituye solo el importe cerrado, conservando abonos.
- La anulación de un abono conserva el original, revierte sus aplicaciones y lo excluye de dinero recibido.
- Las acciones se ejecutan transaccionalmente y los reintentos con la misma solicitud no duplican operaciones.
- El KPI de dinero recibido incluye todo el importe base de abonos vigentes del mes, incluso excedentes informativos; no incluye cierres ni abonos anulados.
- Las consultas de cobranza usan `no-store` y no pasan por la caché de reportes de una hora.

No ejecutar rollback de la migración después de registrar operaciones: eliminaría el historial necesario para interpretar los saldos. La migración rechaza esa reversión cuando existen operaciones.

## Pruebas

```sh
bun --filter @dmmarket/backend test --runInBand __tests__/receivables.test.js __tests__/receivables-routes.test.js
CI=true bun --filter @dmmarket/frontend test --watchAll=false --runInBand src/components/Receivables/index.test.js src/api/receivables.test.js src/pages/clientes/index.test.js
```

Para las pruebas transaccionales MySQL, el módulo crea y elimina una base aislada `test_receivables_<pid>`; nunca usa `DATABASE_NAME` como destino de sus escrituras:

```sh
RUN_CXC_DB_TESTS=1 TEST_MYSQL_HOST=127.0.0.1 TEST_MYSQL_PORT=3307 TEST_MYSQL_USER=root TEST_MYSQL_PASSWORD=root bun --filter @dmmarket/backend test --runInBand __tests__/receivables.test.js
```

Las credenciales indicadas corresponden exclusivamente al contenedor de desarrollo descrito en `docker-compose.yml`. Las suites antiguas de dashboard y compras usan la base configurada y algunas escriben fixtures: ejecutarlas contra una copia desechable, no contra la cartera operativa.

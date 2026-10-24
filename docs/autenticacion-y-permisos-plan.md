# Plan de autenticación y permisos de DMMarket

Estado: plan simplificado; implementación no iniciada. Este documento no acredita que el sistema actual esté protegido.

Decisión: [ADR-0006](adr/0006-identidad-local-y-autorizacion-granular.md), revisado para sustituir Keycloak por autenticación integrada. El objetivo es proteger una aplicación interna, no construir una plataforma de identidad.

## 1. Alcance y decisiones

- Cuentas locales para más de 60 empleados, independientes de `vendedores`; funcionamiento sin Internet en Windows y Linux.
- Inicio de sesión con usuario y contraseña, sesiones de servidor y administración asistida sin correo ni autorregistro.
- Roles personalizados, varios roles por usuario y catálogo cerrado de permisos por recurso y acción.
- Alcance global o limitado a vendedores vinculados al usuario, solo en recursos cuya regla esté implementada. Costos, utilidad y datos personales requieren capacidades explícitas.
- MFA para usuarios privilegiados, 30 minutos de inactividad y máximo absoluto de 12 horas por sesión.
- Auditoría básica y atribución de cambios financieros; recuperación administrativa desde el servidor.
- Activación única en mantenimiento, después de validar en un entorno separado.

Se eliminan Keycloak, OIDC, `openid-client`, Java y PostgreSQL como dependencias de autenticación. No se añaden Redis, Docker obligatorio, JWT en el navegador ni otro servicio de identidad.

Quedan fuera de esta entrega: SSO, equipos/sucursales, herencia de roles, excepciones individuales, aprobaciones entre personas, editor de condiciones y permisos arbitrarios por columna. Si se necesitan más adelante, se revisará una necesidad concreta, no se construirán anticipadamente.

## 2. Arquitectura y almacenamiento

```text
Navegador en LAN → HTTPS → Caddy → Express en loopback → MySQL existente
                                  ├─ autenticación y sesiones
                                  ├─ permisos con CASL + filtros Knex
                                  └─ tablas propias de acceso y auditoría
```

Se conserva el ejecutable y los supervisores actuales. Caddy aporta HTTPS; Express autentica y autoriza; React adapta la interfaz, pero no decide el acceso. El puerto interno de Express no se expone a la LAN y no hay acceso autenticado alternativo por HTTP.

El modelo mínimo contiene usuarios, roles, permisos de cada rol, relación usuario-rol, vínculos usuario-vendedor, sesiones y eventos. Los identificadores internos de usuario son estables: renombrar o desactivar una cuenta no cambia su atribución histórica. No crear usuarios automáticamente a partir de vendedores ni eliminar físicamente cuentas con historial.

Todas las tablas nuevas son propias de DMMarket, con prefijo identificable y motor InnoDB. Se usa MySQL con Knex y `mysql2`, sin otra base. Antes de implementar hay que comprobar versión, motores y rollback de las tablas que participan en cambios financieros; comprobar existencia no demuestra atomicidad. Si el esquema no permite las garantías necesarias, se bloquea la función y se acuerda una solución, sin convertir tablas compartidas automáticamente.

Las migraciones siguen [ADR-0003](adr/0003-esquema-compartido-y-migraciones.md). Revisar los privilegios MySQL de ejecución y mantenimiento; no crear tablas desde una petición de lectura ni conceder acceso administrativo general para facilitar el login.

## 3. Autenticación local

### Contraseñas y sesiones

- Usar `scrypt` asíncrono de `node:crypto`, con sal aleatoria por contraseña y parámetros almacenados junto al hash. Ajustar el coste según [OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html), midiendo memoria y concurrencia en el servidor. No inventar algoritmos ni usar hashes rápidos para contraseñas.
- Usar `express-session` con un store MySQL mantenido y compatible con la versión real. Elegir y comprobar el adaptador antes de implementar; no usar MemoryStore ni desarrollar un framework de sesiones propio.
- Cookie de host, `HttpOnly`, `Secure` y `SameSite=Lax`; identificador opaco regenerado al autenticar. Secretos de sesión fuera de la base y del repositorio.
- HTTPS confiable en los equipos, `trust proxy` limitado al proxy real, protección CSRF para login y acciones con efectos, incluido logout. Ningún GET modifica datos de negocio.
- Límites de intentos por cuenta y origen, límites de tamaño/concurrencia y errores de login genéricos. Permitir contraseñas largas y gestores de contraseñas; sin rotaciones periódicas obligatorias.
- Una sesión pendiente de cambio de contraseña o MFA solo accede a completar ese paso o salir, nunca a APIs de negocio.

### MFA y recuperación

Conservar TOTP para usuarios privilegiados mediante una biblioteca mantenida, no una implementación propia. El catálogo marcará como privilegiadas la administración de acceso, edición de comisiones, correcciones de deuda y acciones operativas sensibles; cerrar la lista con negocio antes de otorgarlas. TOTP funciona sin Internet, con reloj local sincronizado.

Exigir enrolamiento y MFA antes de crear una sesión privilegiada. Guardar las semillas cifradas con una clave fuera de MySQL, respaldada y restringida en el servidor. No mostrarlas de nuevo ni registrarlas en logs. Cambiar credenciales, MFA o roles exige nueva autenticación; recuperar una cuenta no permite saltarse el enrolamiento. Para cambiar acceso o recuperar cuentas, exigir contraseña y TOTP recientes, con ventana inicial de 5 minutos verificada por servidor.

Un administrador puede emitir una contraseña temporal aleatoria, de un solo uso y con vencimiento de 30 minutos, entregada por un canal con identidad verificada. Solo habilita el cambio de contraseña y el enrolamiento requerido. El reset revoca sesiones; las contraseñas permanentes nunca son visibles. Recuperar MFA es una acción privilegiada y auditada, no una pregunta secreta.

El primer administrador y la recuperación de emergencia se gestionan mediante un comando local con permisos administrativos del sistema operativo, motivo registrado y credencial temporal. Debe funcionar con la web detenida, pero requiere MySQL disponible. Sin contraseñas maestras ni rutas HTTP de bypass. Proteger el último administrador habilitado con MFA frente a cambios concurrentes; recomendar dos responsables.

### Expiración, revocación y equipos compartidos

- El servidor verifica estado de cuenta, validez y versión de sesión en cada petición protegida. Bloqueo, reset y cambios de roles o vínculos revocan las sesiones afectadas; editar un rol incluye a todos sus usuarios. Guardar cambio, invalidación y evento en la misma transacción.
- Consultar permisos actuales sin caché de autorización inicialmente. Antes de confirmar una escritura sensible, volver a validar sesión y permiso. El objetivo es rechazar la siguiente petición tras confirmar un cambio; no prometer cancelar efectos ya confirmados. Las sesiones revocadas no se recrean por guardados de peticiones en curso.
- Medir las 12 horas desde la autenticación y los 30 minutos desde actividad explícita. Polling, SWR y comprobaciones de sesión no renuevan inactividad; no se pretende demostrar presencia humana infaliblemente.
- Logout invalida la sesión del servidor y borra la cookie. Al salir, expirar o cambiar de cuenta, desmontar la aplicación autenticada, recrear su caché SWR y limpiar estados y peticiones pendientes. Sincronizar pestañas y comprobar la sesión al restaurar una página; no mostrar datos anteriores durante la transición.
- Aplicar `Cache-Control: no-store` a respuestas sensibles independientemente de la caché de reportes. No persistir datos sensibles en el navegador. Si MySQL no permite validar la sesión o los permisos, denegar acceso; nunca continuar anónimamente.

## 4. Roles granulares sin un motor genérico

```text
Usuario → uno o varios roles → capacidades del catálogo + alcance permitido
```

Los roles son combinaciones editables de capacidades existentes, no código. CASL comprueba esas capacidades; el filtrado SQL se implementa explícitamente con Knex. No construir un traductor general de reglas CASL a SQL ni duplicar políticas diferentes entre frontend y backend.

Catálogo inicial a contrastar con las rutas reales:

| Recurso | Capacidades separadas |
| --- | --- |
| Ventas y documentos | Consultar, consultar costos, consultar utilidad, exportar |
| Clientes | Consultar y consultar datos de contacto/identificación necesarios |
| Comisiones | Consultar, editar porcentajes |
| Cartera | Consultar, registrar abono, anular abono, cerrar deuda, reabrir deuda |
| Compras, proveedores e inventario | Consulta, capacidades de campos sensibles y exportación por cada recurso, no un permiso conjunto |
| Tasas y operación | Consultar tasas, sincronizar BCV, invalidar caché, consultar respaldos, crear respaldo, consultar y ejecutar actualizaciones |
| Acceso | Administrar usuarios, roles y vínculos; recuperar credenciales |
| Auditoría | Consultar historial autorizado |

No añadir creación/eliminación de ventas, compras o productos que DMMarket no implementa. Exportar en el navegador controla la función oficial, no impide copiar datos que ya se pueden consultar.

### Alcances y campos

Cada capacidad conserva su alcance, global o por vendedores vinculados cuando sea aplicable. Los vínculos se administran en tablas propias; un identificador enviado por el cliente no concede acceso. Asignaciones vacías, inválidas o registros sin relación verificable deniegan acceso restringido. Equipos y sucursales no se modelan en esta entrega.

Los roles son aditivos, pero no se unen campos y alcances por separado. Ejemplo: leer importes globales y utilidad propia no concede utilidad global. Para cada registro, los campos adicionales deben estar cubiertos por su capacidad y alcance; en un agregado, si no cubren todo el conjunto consultado, se omite esa métrica, sin presentar un subtotal como total. Usar grupos de campos definidos en código, no un editor de columnas arbitrarias.

Filtrar en SQL antes de sumar, contar o paginar. Aplicar el mismo alcance a detalles, búsqueda, gráficos, comparaciones y ambos juegos de `showNoe`. Los parámetros de filtro y ordenación tampoco pueden usar campos prohibidos. Proteger costos/utilidad y sus derivados en cualquier módulo que los exponga, incluidas combinaciones que permitan deducirlos; nunca enviar cero como sustituto de un campo oculto.

### Límites de negocio y administración

La matriz por perfiles se aprueba antes de dar acceso. Dirección no significa acceso total y cobranza no implica anular abonos ni cerrar deuda. El administrador de acceso no obtiene lectura financiera automáticamente, pero es un responsable de plena confianza: puede conceder roles y recuperar cuentas. No se promete impedirle obtener acceso indirectamente; la administración delegada queda fuera de esta versión.

No está resuelta la cartera de clientes compartidos. Hasta acordarlo, no habilitar cartera restringida por vendedor ni dar acceso global como sustituto. Registrar un abono debe conservar su distribución por antigüedad, según [ADR-0002](adr/0002-registro-principal-abonos.md); no recortarla silenciosamente por vendedor.

## 5. Integración y auditoría necesarias

- Instalar autenticación antes de caché y routers en `packages/backend/index.js`. Enumerar excepciones públicas mínimas: recursos de login, login y health sin secretos. Sin sesión válida: 401 en APIs; sin permiso: 403.
- Deshabilitar la caché compartida de reportes inicialmente, conservando `no-store`. Centralizar el manejo de 401/403 y la limpieza en fetchers y en `packages/frontend/src/App.js`, `packages/frontend/src/index.js` y `packages/frontend/src/hooks/swr-wrapper.js`; ocultar navegación no protege endpoints.
- Autorizar previsualización y ejecución por el tipo validado de operación en `packages/backend/routes/receivables.js`. Comprobar autorización antes de devolver un resultado idempotente y obtener el actor de la sesión, nunca del body.
- Guardar actor y contexto mínimo junto con la operación en MySQL. Cambios de porcentajes de comisión necesitan validación, transacción y evento, no solo un permiso. Preservar idempotencia y reglas de tasa de [ADR-0004](adr/0004-tasa-editable-por-abono.md). No inventar actores para registros históricos.
- Registrar login correcto/fallido, logout, MFA/reset, cambios de acceso y operaciones financieras u operativas. Incluir actor estable cuando exista, fecha, objetivo, resultado y motivo cuando corresponda. Producir los eventos al implementar cada escritura, no añadirlos al final.
- Normalizar errores públicos; no serializar errores SQL ni registrar contraseñas, cookies, semillas, tokens o claves. Retención inicial propuesta: 12 meses para seguridad, pendiente de confirmación; no aplicar esa limpieza al historial financiero. Sin plataforma de eventos ni promesas de auditoría inmutable frente al administrador del servidor.

### Actualizaciones existentes y funciones aplazadas

Se conserva el flujo actual de buscar, descargar y aplicar actualizaciones desde la web; no se deshabilita ni se sustituye por actualización local. Sus endpoints quedan sujetos a autenticación, permisos operativos y CSRF como el resto de acciones protegidas. En esta entrega no se rediseña el mecanismo de descarga o reemplazo del ejecutable.

El endurecimiento del actualizador se registra como trabajo posterior: hoy acepta URLs de binario y hash enviadas por el cliente, y añadir un rol no garantiza la procedencia del ejecutable. Ese riesgo sigue abierto y su corrección no bloquea el plan de autenticación; ver [ticket de seguimiento en Notion](https://app.notion.com/p/403f8094b13381fc827fe3e8765d6c66).

Se mantiene fuera de esta entrega la vinculación/reconfiguración o exportación de claves de Drive desde la web; las cargas ya configuradas pueden continuar. El control local actual de Drive es incompatible con acceder por Caddy y no debe relajarse ni sustituirse por un bypass sin autenticación para hacerlo funcionar.

## 6. Implementación en cuatro fases

| Fase | Trabajo | Criterio de salida |
| --- | --- | --- |
| 0. Cerrar lo mínimo | Aprobar capacidades, perfiles y vínculos; revisar versión/motores MySQL; probar hash, store de sesiones, TOTP y CASL con Node/Bun y binarios Windows/Linux; elegir HTTPS y respaldo de claves | Viabilidad comprobada, dependencias fijadas y funciones pendientes explícitamente deshabilitadas; sin migrar producción |
| 1. Login local | Tablas propias, HTTPS, login/logout, sesiones, CSRF, expiración, MFA, altas/reset y comando de recuperación; eventos desde el inicio | Dos usuarios comparten un equipo sin datos residuales; revocación y recuperación funcionan sin Internet |
| 2. Permisos e interfaz | Catálogo por endpoint, roles/vínculos, filtros y campos, administración sencilla, limpieza React/SWR y atribución financiera | APIs y pantallas respetan los mismos permisos; sin escalada por ID, parámetros, combinación de roles o tipo de operación |
| 3. Validación y corte | Verificaciones de integración/seguridad, compilaciones, carga sin caché, reinicio, respaldo/restauración y capacitación | Aceptación funcional/técnica y procedimiento de recuperación aprobados antes de abrir acceso general |

No crear pruebas unitarias, conforme a `AGENTS.md`. Usar Bun como gestor y task runner; ejecutar verificaciones existentes aplicables y casos reproducibles de integración. No desplegar endpoints parcialmente protegidos a producción ni alterar los workarounds CRA/OpenSSL o el empaquetado sin necesidad.

Aceptación mínima:

- Anónimo no obtiene datos por APIs ni puertos alternativos; los tokens operativos y loopback no omiten autenticación.
- Vendedor A no accede a datos de B fuera de concesiones explícitas; asignaciones vacías deniegan.
- Campos prohibidos no aparecen en JSON, gráficos, errores o exports, ni se usan para ordenar/buscar. Probar lectura global combinada con utilidad propia.
- Cambiar un rol usado por varias cuentas, bloquear, resetear o salir invalida el acceso correspondiente; probar peticiones concurrentes y vuelta atrás.
- MFA no se evita mediante alta, recuperación o cambio de rol. Las sesiones incompletas no llaman APIs de negocio.
- Operaciones manipuladas o repetidas no eluden permisos ni duplican efectos; actor y cambio se conservan juntos ante fallo.
- CSRF, fijación de sesión y cabeceras de proxy falsificadas no permiten operar. Las consultas tienen límites de tamaño y carga medidos.
- Arranque sin sesión de escritorio, pérdida de Internet, fallo de MySQL y restauración se verifican en Windows y Linux.

## 7. Activación y pendientes

1. Preparar HTTPS confiable y validar en un entorno separado. Las instrucciones actuales de [servicios](services.md) y [Linux](linux.md) describen el despliegue existente y deberán actualizarse para esta versión.
2. Acordar ventana, responsables y criterios de aborto. Respaldar MySQL, configuración, claves de sesión/MFA/TLS y ejecutable; probar restauración. Las copias ahora contienen credenciales derivadas y deben tener acceso restringido.
3. Detener acceso, aplicar solo migraciones propias autorizadas e instalar la versión protegida. Preparar roles, cuentas y MFA privilegiado antes de abrir la LAN.
4. Verificar login, aislamiento, una operación financiera controlada y recuperación. Ante fallo, mantener mantenimiento; no reabrir una versión anónima a toda la red.
5. No restaurar MySQL descartando abonos nuevos ni asumir que cambiar el binario revierte migraciones. Tras restaurar, invalidar todas las sesiones y comprobar usuarios, roles y claves compatibles.

Antes de empezar deben quedar cerrados: matriz y campos sensibles, store MySQL compatible, versión/motores y privilegios de base, HTTPS/distribución de confianza y responsable de recuperación. Cartera compartida queda deshabilitada si su regla no se aprueba. Retención, frecuencia de copias y objetivos de recuperación se acuerdan con operación, sin prometer alta disponibilidad con un solo servidor.

Esta entrega solo cambia documentación. La implementación futura afectará autenticación y migraciones propias, routers/controladores, fetchers y pantallas, configuración HTTPS, instalación y guías; no añade procesos de identidad ni modifica datos compartidos durante la planificación.

## Referencias

- [ADR-0006: autenticación integrada y autorización granular](adr/0006-identidad-local-y-autorizacion-granular.md)
- [Express: sesiones](https://expressjs.com/en/resources/middleware/session.html)
- [OWASP: almacenamiento de contraseñas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)
- [CASL](https://casl.js.org/v6/en/)

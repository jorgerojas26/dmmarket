# Autenticación integrada y autorización granular acotada

## Contexto

DMMarket necesita acceso individual para empleados de una sola aplicación interna, con roles personalizados y restricciones sobre acciones, datos asignados y campos sensibles. Debe funcionar sin Internet en un servidor de la LAN, con Windows y Linux. El módulo actual de empleados consulta `vendedores`; un vendedor no es una cuenta de acceso.

La primera versión de esta decisión elegía Keycloak local y OIDC. Se revisa expresamente: operar un proveedor de identidad, Java y otra base añade más coste del que justifica este alcance, y no resuelve los permisos de negocio que DMMarket debe aplicar de todas formas.

## Decisión acordada

Integrar autenticación local en Express, con usuarios propios, contraseñas derivadas mediante `scrypt` asíncrono de `node:crypto` y sesiones de servidor mediante `express-session` y un store MySQL mantenido. Usar mecanismos estándar, parámetros seguros y bibliotecas compatibles con Node/Bun y los ejecutables; no diseñar criptografía ni un framework de autenticación.

Guardar usuarios, roles, vínculos, sesiones y eventos en tablas propias InnoDB del MySQL existente. Comprobar versión, motores, privilegios y atomicidad antes de habilitar escrituras; seguir [ADR-0003](0003-esquema-compartido-y-migraciones.md) sin alterar automáticamente tablas compartidas. No añadir otra base para identidad.

Conservar CASL como biblioteca para comprobar un catálogo cerrado de capacidades. Los roles agrupan capacidades y sus alcances admitidos; pueden asignarse varios roles a un usuario. Knex aplica explícitamente los filtros SQL antes de agregar o paginar. No construir un traductor genérico de políticas a SQL.

El alcance inicial es global o por vendedores vinculados, donde exista una regla verificable. Los campos sensibles se habilitan mediante capacidades y grupos definidos en código. Combinar roles no convierte un permiso sobre campos propios en acceso a esos campos globalmente. El backend deniega por defecto; React solo adapta la interfaz.

Las altas y recuperaciones son asistidas, sin correo ni autorregistro. Mantener MFA TOTP para usuarios privilegiados, con biblioteca mantenida, semillas cifradas y clave fuera de la base. La recuperación usa credenciales temporales, revoca sesiones y no omite el enrolamiento requerido.

Exigir HTTPS confiable, cookies seguras, CSRF, límites de intentos y sesiones revocables. En equipos compartidos, cerrar tras 30 minutos de inactividad y como máximo a las 12 horas, sin renovar inactividad por polling y sin conservar datos entre cuentas. La recuperación de emergencia se realiza desde el servidor con permisos administrativos, sin bypass HTTP.

El administrador de acceso es un responsable de plena confianza: puede conceder roles y recuperar cuentas. No recibe lectura financiera automáticamente, pero no se promete impedirle obtenerla indirectamente. La administración delegada, herencia, excepciones individuales, aprobaciones, equipos/sucursales y reglas arbitrarias quedan fuera de esta entrega.

## Consecuencias

Se retiran Keycloak, OIDC, `openid-client`, Java y PostgreSQL del diseño de autenticación. No hay sincronización de identidades, segunda sesión SSO ni nuevos procesos de identidad. Se conserva el ejecutable y los supervisores actuales; HTTPS sigue siendo necesario.

DMMarket asume el mantenimiento del ciclo de contraseñas, MFA y sesiones utilizando mecanismos probados. La compatibilidad y el coste del hash/store deben verificarse en ambas plataformas; si no son viables, se revisa la decisión antes de implementar, sin degradar la seguridad ni incorporar silenciosamente servicios nuevos.

La atribución financiera se guarda junto al cambio, conservando idempotencia e historial. La activación es única, precedida por validación y respaldos restaurables. No se promete alta disponibilidad ni protección frente a un administrador del servidor o acceso directo autorizado a MySQL.

Se conserva el flujo actual de actualizaciones desde la web, sujeto a autenticación, permisos y CSRF, sin sustituirlo por actualización local. Corregir la confianza en las URLs de descarga y hash queda como [trabajo posterior en Notion](https://app.notion.com/p/403f8094b13381fc827fe3e8765d6c66), no como bloqueo del login. La reconfiguración/exportación de claves Drive desde la web sigue fuera de esta entrega; las cargas ya configuradas pueden continuar.

La cartera de clientes compartidos, la matriz final, HTTPS, compatibilidad MySQL y operación de respaldos mantienen sus bloqueos explícitos. El [plan simplificado](../autenticacion-y-permisos-plan.md) concreta las capacidades, cuatro fases y aceptación. No se habilitan funciones pendientes mediante acceso global por defecto.

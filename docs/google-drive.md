# Google Drive opcional

**Los respaldos locales son la función principal y no dependen de Google Drive.** Sin cliente OAuth, sin cuenta vinculada o sin Internet, DMMarket continúa respaldando MySQL y conservando los últimos 30 archivos. La integración no requiere rclone ni otro servicio alojado.

## Activar desde Configuración

Una versión con el cliente OAuth de DMMarket configurado muestra los controles en **Configuración → Respaldos → Google Drive**:

1. En el propio servidor, abrir `http://127.0.0.1:8000/configuracion#respaldos` (ajustar el puerto si es diferente).
2. Pulsar **Conectar con Google**. Se abre la página oficial de Google en otra pestaña; si el navegador bloquea ventanas, usar el enlace **Autorizar en Google**.
3. Elegir la cuenta del negocio y aceptar el permiso para los archivos de DMMarket. No se pide ni se guarda la contraseña de Google.
4. Volver a Configuración. La carpeta **Respaldos DMMarket** se crea automáticamente en esa cuenta.
5. **Descargar clave de recuperación**, guardarla fuera del servidor y confirmar que se conservó una copia.
6. Pulsar **Habilitar cargas automáticas**. Se procesan los respaldos finales disponibles, incluidos los anteriores que aún estén localmente.
7. Opcionalmente, usar **Probar subida** para enviar o verificar el respaldo local más reciente.

La cuenta y la columna **Google Drive** muestran el estado separado del respaldo local: desactivado, pendiente, subiendo, subido o error. Las fechas de subida se muestran en el huso horario del navegador. «Subido» registra una carga verificada; no es una comprobación permanente de que nadie haya borrado el archivo posteriormente en Google.

Cada nueva vinculación requiere confirmar de nuevo la clave antes de habilitar cargas. **Desconectar** cancela la carga activa, elimina los tokens guardados y trata de revocar la autorización en Google. Si no hay Internet, la desconexión local se realiza igualmente y se muestra una advertencia para revisar los permisos en la cuenta Google. No borra copias de Drive ni cambia la clave de recuperación. La revocación de Google puede afectar otras instalaciones que usen la misma aplicación y cuenta.

## Acceso local y autorización

- Las operaciones de vincular, exportar clave, habilitar, probar y desconectar requieren acceso directo por loopback al servidor, un Host local válido, origen coincidente y un token anti-CSRF.
- Las solicitudes con cabeceras de proxy/forwarding no pueden configurar Drive. Tampoco se admite hacerlo desde otra computadora de la LAN. En desarrollo, usar directamente el backend con el frontend compilado, no el proxy de CRA/portless.
- El retorno OAuth usa un listener temporal en `127.0.0.1`, puerto aleatorio, PKCE S256 y estado aleatorio de un solo uso. La sesión expira en 10 minutos.
- No hay un sistema nuevo de usuarios/roles: **las cuentas y procesos con acceso al servidor deben ser de confianza**. No exponer DMMarket a Internet ni a través de un proxy que convierta usuarios remotos en solicitudes locales sin identificar su procedencia.
- Un servidor sin navegador necesitará un diseño de autorización remota o un túnel controlado para el retorno; esta primera versión está dirigida a configuración desde el propio servidor.

El permiso solicitado es únicamente [`drive.file`](https://developers.google.com/workspace/drive/api/guides/api-specific-auth). No se solicita acceso general a archivos existentes, Gmail ni Google Photos. Los tokens OAuth y el verificador PKCE nunca se devuelven al frontend.

## Cargas y recuperación de errores

Un trabajador independiente revisa los respaldos cada minuto, al arrancar y al habilitar la cuenta. Solo considera `dmmarket-AAAA-MM-DD.sql.gz` regulares y no vacíos; no sube `.env`, archivos `.partial` ni credenciales temporales.

- Cifrado en streaming **AES-256-GCM**, clave aleatoria de 256 bits y un IV por contenido. Los reintentos de un mismo archivo inmutable reconstruyen el mismo ciphertext; un cambio de contenido genera otro identificador e IV. El hash de los bytes realmente cifrados se comprueba antes de enviarlos.
- Nombres opacos `dm-IDENTIFICADOR.dmbak`. El nombre original y el contenido están cifrados. Google sigue viendo tamaño, carpeta y fecha de carga.
- API de carga resumable con envío del archivo completo en streaming. Esta versión reinicia sesiones incompletas después de un fallo; no persiste offsets entre reinicios.
- Verificación de tamaño y MD5 del archivo cifrado que devuelve Google. AES-GCM verifica autenticidad al recuperar el contenido.
- Identificador HMAC basado en nombre y contenido para detectar una carga ya completada, evitando duplicados tras perder una respuesta.
- Estado persistente cifrado: tokens, carpeta, confirmación de recuperación, IV por archivo, cargas y próximo intento.
- Tras un fallo se reintenta una hora después. La prueba manual puede adelantar el siguiente intento. Los errores de Internet, cuota, permisos o configuración privada solo afectan a Drive.

**La retención local no espera a la nube.** Se siguen conservando 30 respaldos locales, incluso si Drive está desconectado o fallando. Solo pueden reintentarse archivos que aún existan localmente: vigilar errores antes de que expire esa ventana.

La retención remota es independiente: **no se borran automáticamente copias de Google Drive**. Controlar la cuota y eliminar copias antiguas manualmente cuando sea necesario. Google ofrece [15 GB gratuitos compartidos con Gmail y Photos](https://support.google.com/drive/answer/9312312?hl=es), no almacenamiento ilimitado. Esta integración no ofrece copias inmutables frente a una cuenta Google o servidor comprometidos.

## Archivos privados del servidor

Dentro de la carpeta local de respaldos se crea `.google-drive` al vincular una cuenta:

- `recovery.key`: clave de los respaldos. La descarga entrega una versión textual portable de esta clave.
- `credentials.key`: clave independiente para proteger el estado OAuth. **No se exporta** con la clave de recuperación.
- `state.enc`: estado cifrado y publicado mediante reemplazo atómico.
- Archivos `.upload`: temporales cifrados durante una carga; se eliminan al terminar. Una interrupción brusca puede dejar alguno, que se puede limpiar con DMMarket detenido.

En Unix se crean carpetas `0700` y archivos `0600`; en Windows deben heredar los permisos privados del servicio. No copiar esta carpeta a Drive ni a un directorio público. Proteger también el disco: cifrar un archivo de estado no protege contra alguien que obtenga además su clave privada del mismo servidor.

## Recuperar una copia sin el servidor original

La recuperación no depende de tokens OAuth de la instalación perdida:

1. Entrar a Google Drive con la cuenta del negocio y descargar un archivo `.dmbak` de **Respaldos DMMarket**.
2. Obtener `DMMarket-clave-recuperacion.txt` desde el gestor de contraseñas/dispositivo donde se guardó.
3. Desde este repositorio, ejecutar:

```sh
bun scripts/decrypt-backup.mjs copia.dmbak DMMarket-clave-recuperacion.txt recuperado.sql.gz
```

El comando informa el nombre original, autentica el contenido y produce el `.sql.gz`. Requiere que el destino no exista; nunca lo sobrescribe. Si la clave es incorrecta o hay corrupción, no publica el archivo y limpia el temporal. Después seguir la [guía de restauración MySQL en un servidor aislado](backups.md#comprobar-recuperación).

Formato versión 1: encabezado `DMMARKET-BACKUP-1` seguido de salto de línea, IV de 12 bytes, ciphertext y tag GCM de 16 bytes. El encabezado es AAD. Dentro del ciphertext: longitud de metadatos (uint32 big-endian), JSON UTF-8 con nombre original, y bytes exactos del `.sql.gz`.

**Sin la clave de recuperación, no podemos recuperar los archivos cifrados.** Conservarla aunque se desconecte la cuenta o se reinstale DMMarket. También conservar la configuración privada del servidor si se necesita reanudar registros/reintentos existentes.

## Registro único de DMMarket: mantenedor

No es un paso para cada usuario del negocio. El mantenedor registra **un cliente OAuth de escritorio para DMMarket** y distribuye el binario ya configurado. Mientras no se registre, Drive aparece deshabilitado y los respaldos locales funcionan normalmente.

1. En [Google Cloud Console](https://console.cloud.google.com/), crear/seleccionar el proyecto de DMMarket y habilitar **Google Drive API**.
2. En **Google Auth Platform**, completar **Branding**, **Audience** y **Data Access**. Para cuentas personales, usar audiencia externa. Declarar solo `https://www.googleapis.com/auth/drive.file`. Completar las políticas/URLs y verificación básica que Google solicite si se distribuirá la aplicación.
3. En **Clients**, crear un cliente OAuth de tipo **Desktop app / Aplicación de escritorio**. No usar credenciales de aplicación web ni cuentas de servicio. Descargar su JSON y conservar `client_id` y `client_secret` de la sección `installed`.
4. Para uso estable, publicar el consentimiento según las reglas de Google; no dejarlo en **Testing**, donde las autorizaciones externas de Drive pueden expirar a los siete días. No confundir publicación del consentimiento con verificación: los requisitos dependen de audiencia y distribución. Ver [documentación OAuth para aplicaciones de escritorio](https://developers.google.com/identity/protocols/oauth2/native-app).
5. En el `.env` privado de `packages/backend` del mantenedor, o en su entorno de compilación, configurar:

```dotenv
GOOGLE_DRIVE_CLIENT_ID=ID.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=VALOR_DEL_CLIENTE_DESKTOP
```

6. Ejecutar `bun run build:backend` o el build de plataforma correspondiente. `scripts/generate-google-client.js` produce un JSON ignorado por git y Bun lo incluye en el ejecutable. No se incluyen tokens de usuario ni claves de respaldo.
7. Probar consentimiento real, renovación del token, subida, desconexión y restauración con una cuenta de prueba antes de distribuir el binario habilitado.

En desarrollo, las mismas variables del `.env` del backend funcionan sin recompilar. En un binario se pueden sobrescribir mediante el entorno del servidor, pero **el usuario final no debería necesitar hacerlo**.

Un cliente OAuth de escritorio es un cliente público: su `client_secret` embebido no constituye una contraseña privada ni autentica al propietario del programa. La protección del flujo viene de PKCE y de la autorización de cada cuenta. No publicar tokens ni claves de recuperación en git o logs. Revisar cuotas y políticas de Google para el proyecto que se distribuye.

**Validación actual:** pruebas automatizadas con respuestas simuladas de Google, callback loopback real, cifrado/descifrado real y compilación del binario. El consentimiento y la carga contra una cuenta Google real quedan pendientes del registro OAuth; no se han realizado con credenciales ficticias.

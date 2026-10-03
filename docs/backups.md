# Respaldos automáticos

DMMarket respalda la base MySQL configurada en `DATABASE_NAME` una vez por fecha programada, a las **02:00, hora local del servidor**. La aplicación debe estar ejecutándose; instalarla como servicio permite que funcione sin una sesión abierta.

Al arrancar recupera únicamente el último respaldo pendiente, no todos los días en que estuvo apagada. Antes de las 02:00, la fecha programada pendiente corresponde al día anterior. El nombre identifica esa fecha; la pantalla muestra la fecha y hora reales de finalización. Revisa cada minuto si corresponde ejecutar. Un intento fallido se reintenta después de una hora. El proceso de dump tiene un límite de una hora.

## Requisitos

- Instalar el cliente **MySQL** (`mysqldump`) o **MariaDB** (`mariadb-dump`) en la máquina donde corre DMMarket, con una versión compatible con el servidor. No es necesario instalar un segundo servidor MySQL. El ejecutable de DMMarket no incluye estas herramientas.
- Ubuntu: instalar `mysql-client` para MySQL o `mariadb-client` para MariaDB.
- Windows: instalar las herramientas de cliente MySQL y configurar la ruta completa del ejecutable si no está en el PATH del servicio.
- macOS: instalar el cliente correspondiente y configurar su ruta completa si el servicio no encuentra el comando.
- El usuario configurado necesita permisos para leer datos, vistas, triggers, eventos y rutinas, y realizar el bloqueo global usado por `--lock-all-tables`. Los privilegios concretos dependen de la versión de MySQL/MariaDB; en MySQL se requiere `RELOAD` o `FLUSH_TABLES` para el bloqueo global, además de los permisos de los objetos. Consultar la documentación de `mysqldump` de esa versión.
- La cuenta del servicio debe poder escribir en la carpeta de respaldos y ejecutar la herramienta.

Se usa **bloqueo global de lectura** durante el dump para respaldar de forma consistente también tablas MyISAM. **Las escrituras de otras aplicaciones pueden quedar esperando mientras se genera el respaldo**; no basta una transacción para proteger tablas no transaccionales. Ejecutarlo en horario de poca actividad. No modificar esquemas durante el dump.

## Ubicación estándar

Con DMMarket instalado como servicio:

| Sistema | Carpeta |
| --- | --- |
| Ubuntu/Linux | `/var/lib/dmmarket/backups` |
| Windows | `%ProgramData%\\DMMarket\\backups` |
| macOS | `/Library/Application Support/DMMarket/backups` |

Sin servicio:

| Sistema | Carpeta |
| --- | --- |
| Linux | `$XDG_DATA_HOME/dmmarket/backups`, o `~/.local/share/dmmarket/backups` |
| Windows | `%LOCALAPPDATA%\\DMMarket\\backups` |
| macOS | `~/Library/Application Support/DMMarket/backups` |

Variables opcionales en el `.env` del servidor:

```dotenv
BACKUP_DIRECTORY=/ruta/privada/respaldos
BACKUP_DUMP_COMMAND=/ruta/al/mysqldump
```

`BACKUP_DUMP_COMMAND` es un ejecutable, no una línea de comandos ni un script de shell con argumentos. Por ejemplo, en Windows: `BACKUP_DUMP_COMMAND="C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysqldump.exe"`. Reinicia DMMarket después de cambiar estas variables. Usa una carpeta privada, fuera del directorio público del frontend, en un disco con espacio suficiente. Ejecuta una sola instancia de DMMarket por carpeta de respaldos y base de datos.

## Archivos y retención

- Formato: `dmmarket-AAAA-MM-DD.sql.gz`.
- Incluye estructura, datos, vistas, triggers, rutinas y eventos de la base configurada. No incluye otras bases, usuarios/permisos de MySQL ni el archivo `.env`.
- El SQL se comprime en streaming, sin cargar toda la base en memoria.
- La contraseña se pasa mediante un archivo temporal privado, no en los argumentos del proceso. Se elimina al terminar. En Unix la carpeta temporal tiene permisos `0700` y los archivos `0600`.
- Solo se publica el archivo final si el dump termina con código cero, produce datos y la compresión termina correctamente. Los `.partial` no aparecen en la lista.
- Se conservan **los últimos 30 respaldos exitosos disponibles**. Los más antiguos se eliminan únicamente después de publicar un nuevo respaldo exitoso; los archivos ajenos al patrón no se borran.
- La lista se reconstruye desde los archivos y sobrevive a reinicios. No es un registro histórico de los archivos ya eliminados.
- Los respaldos locales están comprimidos, **no cifrados**. Proteger el disco y sus permisos. Una interrupción brusca del proceso puede dejar archivos temporales privados; revisarlos con la aplicación detenida antes de eliminarlos.

En **Configuración → Respaldos** se muestran la carpeta, próxima ejecución, respaldo en curso, último error del proceso actual, nombre, fecha de finalización, tamaño comprimido y estado exitoso. Si no se pudieron eliminar los archivos antiguos, se muestra una advertencia separada: el respaldo nuevo sigue siendo exitoso. La lista se actualiza cada minuto o con **Actualizar lista**. La fecha de ejecución usa el huso horario del servidor; las fechas mostradas usan el del navegador.

`GET /api/backups` devuelve esos metadatos con `Cache-Control: no-store`. No permite descargar SQL ni crear/restaurar/borrar respaldos desde HTTP. Como el resto de esta aplicación, debe mantenerse en una red de confianza; no exponer el servidor directamente a Internet.

## Comprobar recuperación

El código cero de la herramienta indica que el dump terminó; no sustituye una prueba de restauración. Regularmente:

1. Copiar un archivo a un servidor MySQL de prueba aislado, con versión compatible.
2. Comprobar la integridad de gzip y descomprimir el archivo.
3. Importar con el cliente `mysql` o `mariadb`, usando credenciales privadas de ese servidor.
4. Comparar tablas y conteos de registros, y revisar vistas, rutinas, triggers y eventos.

El dump incluye `CREATE DATABASE` y `USE` con el nombre original, y sentencias que reemplazan tablas. **No importarlo en el servidor del negocio para hacer una prueba**. Los definidores de vistas/rutinas/triggers pueden requerir ajustes de usuarios y privilegios en el servidor de destino. Las credenciales de conexión deben conservarse por separado en un gestor de contraseñas.

## Copia opcional en Google Drive

Google Drive está **desactivado por defecto** y es independiente del respaldo local. Sin cuenta Google, sin credenciales OAuth o sin Internet, los respaldos locales y su retención siguen funcionando.

En **Configuración → Respaldos → Google Drive** se puede conectar la cuenta desde el servidor, descargar la clave de recuperación, habilitar cargas cifradas, probar una subida y desconectar. El cliente OAuth debe registrarse una vez por el mantenedor de DMMarket; el usuario del negocio solo autoriza su cuenta desde Google.

La integración usa directamente Google Drive API, sin rclone. Las copias se cifran con AES-256-GCM antes de enviarlas, incluyen el nombre original dentro del contenido cifrado y tienen reintentos persistentes. Google ofrece 15 GB gratuitos compartidos con Gmail y Photos. No se sincronizan los borrados locales ni se eliminan automáticamente copias remotas.

Ver [setup, seguridad, recuperación y registro OAuth del mantenedor](google-drive.md).

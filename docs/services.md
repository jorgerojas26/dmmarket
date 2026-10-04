# Arranque automático y acceso en red local

La instalación de servidor es la opción recomendada en Ubuntu, Windows y macOS. Se hace una sola vez con permisos de administrador. Después, DMMarket arranca al encender la máquina, sin que nadie inicie sesión, y vuelve a arrancar si el proceso termina. No abre un navegador ni espera interacción en consola.

La instalación básica registra únicamente el servicio de DMMarket y usa acceso directo. No requiere Caddy, un dominio ni DNS. **Configuración de dominio local** y cambios de firewall son opciones adicionales, deshabilitadas por defecto en instalaciones nuevas. Se pueden configurar más adelante desde el mismo asistente; al reinstalar se conserva un dominio previamente habilitado para revisarlo antes de confirmar. Sin autorización explícita no se modifican reglas de firewall; las reglas existentes no se eliminan.

El ejecutable incluye aplicación, interfaz web y runtime: el servidor no necesita Node.js ni Bun. MySQL debe estar disponible por separado; no se instala con DMMarket. Si la base de datos no está lista al arrancar, el supervisor reintenta el inicio. Respaldar la base de datos antes de instalar o actualizar: las migraciones pendientes se aplican al iniciar.

## Instalación recomendada: asistente gráfico

Descargar el ZIP `DMMarket-<versión>-linux.zip`, `DMMarket-<versión>-windows.zip` o `DMMarket-<versión>-macos.zip` desde [Releases](https://github.com/jorgerojas26/dmmarket/releases) y extraer todos sus archivos. Cada ZIP incluye ejecutable, hash de verificación, instrucciones, un lanzador **Instalar** y Caddy con su licencia. Caddy es opcional: el acceso directo sigue disponible. No se descarga software durante la instalación.

| Plataforma | Cómo abrir el asistente |
| --- | --- |
| Ubuntu con escritorio | Clic derecho en `Instalar.sh` → Ejecutar como programa |
| Windows | Doble clic en `Instalar.cmd` |
| macOS | Doble clic en `Instalar.command` |

El lanzador verifica el hash del ejecutable, pide los permisos de administrador y abre el navegador desde la sesión del usuario. No crea un `.env` antes del asistente ni requiere instalar Node.js/Bun. No ejecutar desde el interior del ZIP.

### Pantallas del asistente

1. **Bienvenida:** detecta configuración existente y explica qué se va a instalar.
2. **Base de datos:** servidor, puerto, base, usuario y contraseña de MySQL. Si hay contraseña guardada, puede reutilizarse sin mostrarla ni enviarla al navegador.
3. **Comprobación:** conecta con MySQL y verifica las tablas principales, sin escrituras ni migraciones. Si falla, explica cómo corregir los datos.
4. **Acceso:** acceso directo (red local o solo este servidor, puerto fijo), disponible sin configurar extras. El apartado **Configuración adicional (opcional)** permite habilitar **Configuración de dominio local** y autorizar cambios de firewall por separado; ninguna de estas opciones se activa automáticamente en una instalación nueva. Las reglas automáticas se restringen a una red privada indicada; en Ubuntu usan UFW sin activarlo ni cambiar SSH, y en Windows se limitan a perfiles privado/dominio. Otros firewalls y macOS requieren revisión manual.
5. **Confirmación:** muestra el resumen sin contraseña y exige confirmar respaldo e instalación. Solo entonces guarda la configuración y registra el servicio.
6. **Resultado:** espera hasta 45 segundos para comprobar que la aplicación responde como servicio —a través de Caddy si fue seleccionado—, muestra la dirección de acceso y las advertencias. Para Caddy también muestra los registros DNS sugeridos; no afirma que el nombre ya funciona en las otras máquinas. Si aún no responde, no muestra un éxito falso: permite volver a comprobar y ofrece el comando de diagnóstico.

El asistente permite corregir la configuración y reinstalar. Conserva los valores anteriores como punto de partida, pero actualiza explícitamente los campos confirmados y mantiene las otras variables del `.env`. El comando manual `--install-service`, en cambio, sigue conservando el `.env` permanente sin sobrescribirlo.

La sesión solo escucha en `127.0.0.1:8765`, exige un token aleatorio para las operaciones y bloquea otros orígenes. El enlace aparece en la ventana del instalador; mantenerla abierta. La sesión expira después de 30 minutos y **Finalizar** o **Cancelar** cierran el asistente. No compartir el enlace. Cerrar la pestaña por sí solo no detiene el servidor del asistente; usar Cancelar, Ctrl+C en su ventana o esperar la expiración.

### Ubuntu sin escritorio

Desde la carpeta extraída:

```sh
bash Instalar.sh
```

Desde tu computadora, abrir un túnel y mantenerlo activo:

```sh
ssh -L 8765:127.0.0.1:8765 USUARIO@SERVIDOR
```

Abrir el enlace completo del instalador en el navegador de tu computadora, incluido el fragmento después de `#`. El asistente no se expone en la LAN ni transmite las credenciales de instalación por HTTP abierto entre máquinas. El puerto local 8765 debe estar libre para usar el enlace del asistente.

Si el servidor requiere sudo para leer una configuración previa, los lanzadores ya solicitan ese permiso al comenzar. Una sesión root directa en macOS no está soportada: abrir `Instalar.command` desde la cuenta habitual.

### Protecciones del sistema operativo

Los paquetes no eluden SmartScreen, Gatekeeper ni las políticas del equipo. Si el sistema bloquea un archivo descargado, verificar su origen y autorizarlo mediante las opciones del sistema, o pedir ayuda al administrador. En Ubuntu, si el menú no ofrece Ejecutar como programa, se puede usar `bash Instalar.sh` desde una terminal en esa carpeta.

## Instalación manual: preparación común

1. Descargar el ejecutable y su archivo `.sha256` de la misma versión desde [Releases](https://github.com/jorgerojas26/dmmarket/releases), y verificar el hash.
2. Crear un archivo `.env` en la carpeta de descarga, con las credenciales reales:

```dotenv
DATABASE_HOST=localhost
DATABASE_PORT=3306
DATABASE_USER=dmmarket
DATABASE_PASSWORD=tu-clave
DATABASE_NAME=tu-base
HOST=0.0.0.0
PORT=8000
```

3. Ejecutar la instalación desde esa carpeta. El instalador copia el ejecutable y `.env` a una ubicación permanente y registra el arranque automático. No mover la carpeta permanente ni lanzar otra copia del programa.

La instalación conserva el `.env` permanente si ya existe: una reinstalación no sobrescribe credenciales ni configuración. Para cambiar la conexión o el puerto, editar ese archivo y reiniciar el servicio.

El puerto es fijo: si está ocupado, el inicio falla y se reintenta; nunca se cambia silenciosamente a 8001. Esto mantiene estable la dirección de acceso.

## Ubuntu 22.04 o posterior (Intel/AMD de 64 bits)

Desde la carpeta de descarga:

```sh
printf '%s  %s\n' "$(cat dmmarket-app-linux.sha256)" dmmarket-app-linux | sha256sum --check -
chmod +x dmmarket-app-linux
chmod 600 .env
sudo ./dmmarket-app-linux --install-service
```

Continuar solo si la verificación indica `OK`.

- Supervisor: `systemd`, servicio `dmmarket.service`, habilitado al arrancar.
- Usuario del proceso: cuenta de sistema `dmmarket`, sin inicio de sesión y sin permisos root.
- Aplicación y configuración: `/var/lib/dmmarket/`.
- Definición: `/etc/systemd/system/dmmarket.service`.
- Reinicio tras terminar el proceso: 5 segundos, sin límite de reintentos por fallos de arranque.

Comprobar y administrar:

```sh
sudo systemctl status dmmarket.service
sudo systemctl is-enabled dmmarket.service
sudo journalctl -u dmmarket.service -n 100 --no-pager
sudo systemctl restart dmmarket.service
sudo systemctl stop dmmarket.service
```

Para quitar el arranque automático, sin borrar configuración ni aplicación:

```sh
sudo /var/lib/dmmarket/dmmarket-app --uninstall-service
```

## Windows 10/11 o Windows Server con PowerShell 5.1

Abrir **PowerShell como administrador** y entrar a la carpeta de descarga:

```powershell
$expected = (Get-Content .\dmmarket-app.exe.sha256).Trim()
if ((Get-FileHash .\dmmarket-app.exe -Algorithm SHA256).Hash.ToLower() -ne $expected.ToLower()) { throw "Hash incorrecto" }
.\dmmarket-app.exe --install-service
Get-ScheduledTask -TaskName DMMarket
Get-ScheduledTaskInfo -TaskName DMMarket
```

- Supervisor: tarea programada `DMMarket`, disparada al iniciar Windows, sin iniciar sesión.
- Usuario del proceso: `LOCAL SERVICE`, no administrador.
- Aplicación y configuración: `%ProgramData%\DMMarket\` (normalmente `C:\ProgramData\DMMarket\`).
- La tarea ejecuta `run-service.ps1`, que relanza el programa 5 segundos después de cada salida, incluidas las actualizaciones.
- Si el supervisor falla, la tarea reintenta cada minuto (hasta 999 intentos). No tiene límite de duración y puede funcionar con batería.
- La carpeta queda restringida a Administradores, SYSTEM y LOCAL SERVICE.
- Log: `dmmarket.log` en esa carpeta. Revisar también el historial del Programador de tareas. Los logs de archivo deben archivarse periódicamente para evitar crecimiento indefinido.

Para reinstalar o cambiar configuración y reiniciar, editar el `.env` permanente y ejecutar nuevamente `--install-service` desde una copia descargada del ejecutable. El instalador detiene la tarea y su árbol de procesos antes de copiar y volver a iniciarla.

Para quitar el arranque automático y detener el árbol de procesos, sin borrar los archivos:

```powershell
& "$env:ProgramData\DMMarket\dmmarket-app.exe" --uninstall-service
```

No usar solamente `Stop-ScheduledTask` para una parada de mantenimiento: puede dejar vivo el proceso hijo. Usar `--uninstall-service` y volver a instalar al terminar.

## macOS

Usar un binario compatible con la arquitectura de la Mac. Desde la carpeta de descarga, en la sesión de tu usuario habitual:

```sh
printf '%s  %s\n' "$(cat dmmarket-app-mac.sha256)" dmmarket-app-mac | shasum -a 256 --check -
chmod +x dmmarket-app-mac
chmod 600 .env
sudo ./dmmarket-app-mac --install-service
```

- Supervisor: LaunchDaemon `com.dmmarket.server`, no LaunchAgent de sesión.
- Usuario del proceso: quien ejecuta `sudo`; no ejecuta la aplicación como root. No requiere iniciar sesión al encender.
- Aplicación y configuración: `/Library/Application Support/DMMarket/`.
- Definición: `/Library/LaunchDaemons/com.dmmarket.server.plist`.
- `RunAtLoad` y `KeepAlive` activados, con intervalo mínimo de arranque de 5 segundos.
- Logs: `dmmarket.log` y `dmmarket-error.log` en la carpeta permanente; archivarlos periódicamente.

Comprobar y reiniciar:

```sh
sudo launchctl print system/com.dmmarket.server
sudo launchctl kickstart -k system/com.dmmarket.server
```

Para quitar el arranque automático:

```sh
sudo "/Library/Application Support/DMMarket/dmmarket-app" --uninstall-service
```

## Acceso desde otras máquinas

Abrir `http://IP-DEL-SERVIDOR:8000`. Por ejemplo: `http://192.168.1.50:8000`.

- Reservar una IP fija para el servidor en el router o configurar una IP estática.
- Permitir el puerto TCP elegido **solo desde la red local de confianza** en el firewall. El asistente puede agregar una regla privada si lo confirmas; el comando manual `--install-service` no cambia el firewall.
- Ejemplo Ubuntu con UFW, reemplazando el rango por el de tu negocio:

```sh
sudo ufw allow from 192.168.1.0/24 to any port 8000 proto tcp
```

- En Windows, configurar una regla entrante TCP para ese puerto en el perfil privado, restringiendo las IP remotas a la red local.
- Las reglas opcionales de firewall no se eliminan al quitar el servicio. En UFW, una reinstalación que cambie puerto o red tampoco borra reglas anteriores; revisar y eliminar manualmente las que ya no se necesiten. En Windows se reemplaza la regla propia `DMMarket-LAN`.
- No configurar redirección de puertos en el router ni exponer directamente DMMarket en Internet. La aplicación no ofrece autenticación ni HTTPS para acceso público.
- Para limitar el acceso a la propia máquina, usar `HOST=127.0.0.1`.

## Configuración de dominio local (opcional)

Esta opción sirve para una LAN de confianza. Usa **HTTP sin cifrado**, no configura certificados y no agrega autenticación. El proxy no vuelve seguro el acceso desde Internet.

En el paso **Acceso** del asistente:

1. Abrir **Configuración adicional (opcional)** y elegir **Configuración de dominio local**. Esta opción instala Caddy para ofrecer acceso HTTP mediante el dominio; no es necesaria para el servicio básico.
2. Indicar un nombre, por ejemplo `reportes.solser.internal`. Usar `.internal` o un subdominio de un dominio propio; evitar dominios ajenos y `.local`, reservado para mDNS. No incluir esquema, puerto ni ruta.
3. Mantener `8000` como puerto interno, o elegir otro puerto no privilegiado. DMMarket escuchará en `127.0.0.1`, no en todas las interfaces.
4. Si se autoriza una regla de firewall, se abre **TCP 80**, no el puerto interno, y solo desde la red privada indicada. En macOS se revisa manualmente.
5. Confirmar y esperar la comprobación a través del proxy.

El asistente comprueba los puertos; la instalación verifica el ejecutable de Caddy contra un SHA-256 fijado en el programa y valida la configuración. Estas comprobaciones se hacen antes de detener el servicio anterior. Si el puerto 80 pertenece a otro servidor web, no lo detiene ni lo reemplaza: hay que resolver el conflicto o continuar con acceso directo.

```text
Navegador → servidor:80 (Caddy) → 127.0.0.1:8000 (DMMarket)
```

El proxy atiende el nombre elegido; la IP por sí sola no es una URL alternativa en este modo. La comprobación local usa ese nombre en la cabecera Host y verifica la respuesta de DMMarket, sin depender de que el DNS ya esté configurado.

### Configuración pendiente en la red

El instalador **no instala un servidor DNS, no modifica el router y no garantiza la resolución desde otros equipos**.

- Reservar la IP del servidor mediante DHCP en el router.
- En el DNS del router, si admite registros locales, o en el DNS interno existente, crear un registro A:

```text
reportes.solser.internal → 192.168.1.50
```

- Configurar DHCP para anunciar ese DNS a los equipos y renovar sus concesiones. No anunciar un DNS público como alternativo para este nombre interno.
- Si aparecen varias interfaces privadas en el asistente, elegir la IP de la LAN correcta, no crear automáticamente todos los registros sugeridos.
- Desde otra computadora, ejecutar `nslookup reportes.solser.internal` y abrir **`http://reportes.solser.internal`**. Usar HTTP explícitamente si el navegador intenta HTTPS.
- No redirigir puertos del router hacia Internet.

### Archivos, arranque y mantenimiento

| Plataforma | Archivos del proxy | Arranque automático |
| --- | --- | --- |
| Ubuntu | `/var/lib/dmmarket-web` | `dmmarket-web.service`, systemd |
| Windows | `%ProgramData%\\DMMarket-web` | Servicio nativo `DMMarket-Web` |
| macOS | `/Library/Application Support/DMMarket-web` | LaunchDaemon `com.dmmarket.web` |

La configuración generada se llama `Caddyfile`. La API de administración de Caddy y HTTPS automático están deshabilitados. Los logs de Caddy quedan en `logs/caddy.log`, con rotación de 10 MiB y hasta tres archivos anteriores.

En Ubuntu corre como `dmmarket`, con únicamente la capacidad de enlazar puertos privilegiados. En Windows corre como LOCAL SERVICE. En macOS el proxy corre como root para enlazar el puerto 80, pero su ejecutable y configuración quedan en una carpeta separada, propiedad de root; DMMarket sigue ejecutándose como el usuario habitual. El instalador no reutiliza un Caddy/Nginx ajeno ni su configuración.

Volver a ejecutar el asistente actualiza nuestro proxy y su configuración. Elegir acceso directo desregistra el arranque de nuestro proxy y conserva sus archivos. `--uninstall-service` también quita el arranque del proxy, sin borrar configuración ni logs. Las reglas anteriores de firewall pueden requerir limpieza manual, igual que en el modo directo.

No editar manualmente el `Caddyfile` para cambios permanentes: el instalador lo regenera. Cambiar el nombre o el puerto interno desde el asistente para mantener sincronizados proxy, aplicación y configuración. Las actualizaciones desde la interfaz reemplazan solo el ejecutable de DMMarket; **Caddy se actualiza reinstalando desde un ZIP nuevo**.

Para instalación manual por nombre, extraer el ZIP completo y usar `--install-service` con esta configuración, además de los datos de MySQL:

```dotenv
HOST=127.0.0.1
PORT=8000
WEB_MODE=caddy
WEB_HOSTNAME=reportes.solser.internal
```

El ejecutable busca Caddy dentro de `web/<plataforma>-<arquitectura>/` junto al binario descargado, o en su instalación permanente si coincide con la versión fijada. Un binario individual descargado no incluye Caddy: para instalarlo o actualizarlo usar el ZIP completo.

Para diagnóstico, revisar `logs/caddy.log` y el supervisor correspondiente:

```sh
sudo systemctl status dmmarket-web.service
sudo journalctl -u dmmarket-web.service -n 100 --no-pager
```

```powershell
Get-Service DMMarket-Web
```

```sh
sudo launchctl print system/com.dmmarket.web
```

Después de instalar, verificar acceso desde otra máquina y reiniciar físicamente el servidor para comprobar ambos procesos sin iniciar sesión.

## Actualizaciones y disponibilidad

Las actualizaciones desde la interfaz descargan y verifican el nuevo binario. En modo servicio se coloca el reemplazo antes de salir; el supervisor vuelve a iniciar la misma ruta. No se crea una instancia independiente ni se modifica el registro de arranque automático.

Hay una interrupción breve mientras reinicia y aplica migraciones. Esto no es alta disponibilidad: no se puede atender mientras el servidor está apagado, suspendido, sin red o con la base de datos caída. Desactivar la suspensión automática y, si MySQL es local, habilitar también su arranque automático.

Al terminar la instalación, comprobar el estado y acceder desde otra máquina. Luego reiniciar físicamente el servidor y verificar que la misma URL vuelve a responder sin iniciar sesión.

## Ejecución manual y desarrollo

Abrir el ejecutable sin argumentos mantiene el modo manual, sin registrar nada en el sistema operativo. En ese modo el binario intenta abrir el navegador. No usarlo simultáneamente con el servicio instalado.

`bun run dev` no instala servicios ni requiere permisos de administrador. Los comandos `--setup`, `--install-service` y `--uninstall-service` solo están disponibles en los binarios compilados. El asistente se puede abrir directamente con `--setup` desde una sesión con permisos de administrador, aunque los lanzadores evitan tener que hacerlo a mano.

## Generar paquetes de instalación

`bun run build:installer:linux` y `bun run build:installer:windows` compilan y generan el ZIP de la plataforma. `bun run package:installers` empaqueta todos los binarios ya compilados, incluido `dmmarket-app-mac`, en `dist/` junto con sus hashes. Necesita las herramientas del sistema `zip`, `unzip` y `tar`. El empaquetado prepara automáticamente Caddy; la primera preparación necesita Internet. También se puede ejecutar `bun run prepare:caddy` o `bun run prepare:caddy windows` previamente.

La fuente única de la versión y los hashes de Caddy es `packages/backend/caddy-manifest.json`. `scripts/prepare-caddy.mjs` descarga archivos oficiales de esa versión, verifica su SHA-512 y el SHA-256 del ejecutable, y guarda la caché ignorada por Git en `.cache/caddy/`. `scripts/package-installers.mjs` vuelve a verificar los ejecutables al incluirlos en los ZIP. La instalación final no depende de Internet ni de Homebrew/apt/Chocolatey.

Linux y Windows incluyen Caddy x64, igual que sus binarios DMMarket. El ZIP de macOS incluye Caddy para Intel y Apple Silicon; el ejecutable DMMarket sigue teniendo la arquitectura seleccionada durante su compilación. Para actualizar Caddy, fijar una nueva versión con hashes oficiales y hashes de los binarios extraídos, vaciar `.cache/caddy/`, recompilar DMMarket y generar los paquetes; nunca usar una descarga `latest` en el instalador.

`bun run test:caddy` prepara el ejecutable nativo y realiza una prueba HTTP real de la configuración generada: frontend de prueba, API, POST y selección por nombre. Usa puertos temporales no privilegiados, no registra servicios ni modifica el firewall o el router. La prueba de arranque sin iniciar sesión requiere además validar el instalador y reiniciar una máquina de cada plataforma.

La publicación de releases adjunta los tres ZIP y sus hashes, además de los seis assets originales de binarios y hashes. Estos assets individuales se mantienen para no romper las actualizaciones desde la aplicación. No se publica ninguna release al generar los ZIP localmente.

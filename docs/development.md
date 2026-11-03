# Desarrollo aislado por worktree

Cada checkout tiene su propio backend, frontend, proyecto Docker Compose, MySQL y volumen persistente. Portless es el único servicio HTTP compartido. No se comparten datos entre worktrees.

## Requisitos

- Bun y Node.js en PATH.
- Docker funcionando y Docker Compose v2 con `up --wait`.
- Portless 0.7.2 o posterior, instalado globalmente.
- mprocs en PATH. El ejecutable de compatibilidad `mprocs` de dekit también sirve.
- Un dump SQL compatible con MySQL 5.7.

Instala dependencias dentro de cada worktree:

```sh
bun install
bun run dev
```

El lanzador valida el dump, inicia MySQL, espera el final de la importación, verifica las tablas principales y aplica solo las migraciones con `config.scope = "dmmarket"`. Después abre mprocs con los paneles `backend`, `frontend` y `mysql`. Backend y frontend quedan detenidos: selecciona el que necesites y pulsa `s` para iniciarlo (`x` para detenerlo). El panel de logs MySQL sí inicia automáticamente.

La primera importación puede tardar varios minutos. MySQL solo se considera listo cuando terminó el dump, se escribió la marca final de inicialización y responde por TCP; el servidor temporal de importación no cuenta como listo. Si falla, consulta los logs; no se borra ni se reinicializa el volumen automáticamente. Las migraciones sobre tablas compartidas no se ejecutan en este arranque: sigue vigente la [política de migraciones](adr/0003-esquema-compartido-y-migraciones.md).

## Identidad, URLs y puertos

La identidad combina el nombre de la carpeta con ocho caracteres derivados de su ruta absoluta real. Por ejemplo:

```text
Identidad: main-365ecda8
Compose:   dmmarket-main-365ecda8
Frontend:  http://main-365ecda8.dmmarket.localhost:1355
Backend:   http://api.main-365ecda8.dmmarket.localhost:1355
Volumen:   dmmarket-main-365ecda8_mysql_data
```

El sufijo evita reutilizar los recursos de otro checkout con el mismo nombre. Cambiar de rama dentro del mismo worktree conserva los datos. Mover o renombrar el worktree cambia su identidad: no borra el volumen anterior, pero no lo adopta automáticamente.

Portless asigna los puertos HTTP y Docker asigna el puerto MySQL, publicado exclusivamente en `127.0.0.1`. No hay que reservar bloques ni editar puertos. El lanzador consulta Docker al arrancar cada backend; no guarda un puerto que pueda quedar obsoleto al recrear el contenedor.

El navegador usa `/api`. El proxy de CRA reenvía esas peticiones al nombre Portless del backend del mismo ambiente y cambia `Host` para seleccionar la ruta correcta. El WebSocket de desarrollo usa el puerto público del navegador. No se usa el proxy antiguo a `localhost:8000`.

```sh
bun run dev:status
bun run dev:doctor
```

`status` muestra las URLs esperadas, conexión MySQL sin contraseña, volumen y carpeta de respaldos. No implica que los servidores HTTP estén arrancados. `doctor` también valida herramientas, dump, Compose, propiedad del contenedor, publicación en loopback y tablas principales.

El proxy Portless puede autoarrancar. Nunca se detiene desde estos comandos, porque puede estar sirviendo otros proyectos. Si usas Safari y no resuelve `.localhost`, configura la sincronización de hosts de Portless.

## Ubicación del dump

Se busca en este orden:

1. La ruta `dump` de `.dev.local.json`, si existe.
2. `bdsolser_md_nieto.dump` dentro del checkout.
3. `main/bdsolser_md_nieto.dump` junto al repositorio bare compartido.

Para indicar otra ruta, crea `.dev.local.json` en la raíz del worktree:

```json
{
  "dump": "../main/bdsolser_md_nieto.dump"
}
```

Las rutas relativas se resuelven desde el worktree. El archivo debe existir, no estar vacío y ser un archivo regular. El montaje es de solo lectura y Docker no crea directorios para sustituir archivos faltantes.

El dump solo se importa al inicializar un volumen vacío. Modificar el archivo no actualiza una base que ya existe. Usa un respaldo de desarrollo adecuado; cada worktree recibirá su propia copia completa y consumirá espacio en disco.

## Ctrl+Q en Herdr

El shortcut local mantiene el toggle de una pestaña `mprocs` por workspace, pero pasa por `~/.dotfiles/scripts/shell/herdr-dev.sh`:

- En DMMarket actualizado, localiza la raíz Git aunque estés en una subcarpeta y ejecuta `bun run dev`.
- En worktrees de DMMarket sin `scripts/dev.mjs`, muestra un aviso y no inicia la configuración antigua.
- En otros proyectos, ejecuta `mprocs` en el directorio actual, igual que antes. No intenta ejecutar sus scripts `dev` ni requiere el setup de DMMarket.

La configuración y el dispatcher de Herdr viven en los dotfiles locales, no en este repositorio. En otra máquina debes configurar ese atajo aparte; `bun run dev` funciona sin Herdr.

Pulsar Ctrl+Q otra vez solo vuelve a la pestaña anterior: no detiene los procesos. Si ya tenías mprocs abierto antes de actualizar el shortcut, sal con `q` y vuelve a abrirlo para usar el lanzador nuevo.

## Procesos y cierre

Cierra mprocs con `q` y confirma si lo solicita. Se detienen backend, frontend y seguimiento de logs. MySQL queda encendido para permitir reinicios rápidos y conserva los datos.

```sh
bun run dev:down
```

Detiene y elimina el contenedor y la red de este ambiente, pero conserva el volumen. No afecta otros proyectos Compose ni el MySQL anterior `dm_mysql`.

No se permite abrir otra sesión `bun run dev`, detener o resetear el ambiente mientras la sesión del lanzador sigue activa. Un cierre abrupto deja un marcador en `.dev/session.json`; el siguiente arranque lo recupera si su PID ya no existe.

Para usar mprocs directamente o arrancar procesos en terminales separadas:

```sh
bun run dev:prepare
mprocs
```

O, después de preparar:

```sh
bun run dev:backend
bun run dev:frontend
```

Ejecuta los dos últimos comandos en terminales distintas. En estos modos manuales tú administras el ciclo de vida: detén los servidores antes de usar `dev:down` o `dev:reset`. Los comandos de paquetes `start` son comandos internos sin coordinación; usa los de la raíz para obtener aislamiento.

Para reconstruir exclusivamente la base de este ambiente:

```sh
bun run dev:reset
```

El comando no borra nada sin confirmación. Muestra el comando completo que debes ejecutar con `--confirm NOMBRE-DEL-PROYECTO`. Antes de borrar comprueba que el volumen pertenece a la ruta del worktree. Después ejecuta `bun run dev` para importar nuevamente. No borra los respaldos locales.

## Configuración y respaldos

La conexión de desarrollo siempre usa el MySQL local de su proyecto Compose, con `root/root` y la base `bdsolser_md_nieto`. Son credenciales exclusivamente locales de desarrollo, no una configuración de producción.

El lanzador fija los datos de conexión e impide heredar puertos, destinos de base, directorios de respaldo y credenciales Google Drive del shell o del `.env` del backend. Los respaldos usan el `mysqldump` del propio contenedor mediante `scripts/dev-mysqldump.sh`, en modo transaccional: no requieren un cliente MySQL nativo ni dependen de su compatibilidad con MySQL 5.7. Los respaldos y el estado de Google Drive quedan dentro de `.dev/backups/`, ignorado por Git; no se reutilizan tokens del servicio instalado. Un cliente OAuth embebido de una compilación previa puede habilitar la conexión manual, pero no aporta los tokens de producción.

Se conservan los ajustes OpenSSL y preflight de CRA. El proceso de desarrollo sigue usando el runtime Node de react-scripts; no se añade `--bun`.

## Transición desde la configuración anterior

El contenedor `dm_mysql` y el volumen `main_mysql_data_57` no se adoptan ni se borran. El ambiente nuevo usa otro volumen y se inicializa desde el dump configurado, no desde los cambios recientes del MySQL anterior.

Si necesitas esos cambios recientes, exporta un respaldo consistente del contenedor anterior antes de la primera preparación y configura ese archivo como `dump`. No copies los archivos físicos de un volumen MySQL en funcionamiento. Si ya preparaste el ambiente nuevo, respáldalo antes de resetearlo para importar otro dump.

Las ramas creadas antes de esta infraestructura necesitan incorporar estos cambios y ejecutar `bun install` en su propio checkout. No copies `.env` de producción ni enlaces los `node_modules` de otro worktree. Los comandos de desarrollo no hacen merges, commits ni modificaciones automáticas de otras ramas.

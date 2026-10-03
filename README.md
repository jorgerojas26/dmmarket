# DMMarket

Sistema de reportes de compras, ventas, productos, clientes, proveedores y vendedores.

## Instalación fácil en un servidor

1. Descarga el **ZIP de instalación de tu plataforma** desde [Releases](https://github.com/jorgerojas26/dmmarket/releases).
2. Extrae todos los archivos en una carpeta.
3. Abre el archivo **Instalar**:
   - **Windows:** doble clic en `Instalar.cmd`.
   - **macOS:** doble clic en `Instalar.command`.
   - **Ubuntu con escritorio:** clic derecho en `Instalar.sh` → **Ejecutar como programa**.
4. Acepta los permisos de administrador y sigue el asistente en el navegador.

El asistente pide los datos de **tu MySQL existente**, comprueba la conexión, configura el acceso por red local y registra el arranque automático. No necesitas editar `.env`, instalar Node.js/Bun ni escribir comandos de servicios.

Necesitas un respaldo reciente de la base del negocio. Al iniciar, DMMarket aplica sus migraciones pendientes. No instala MySQL ni importa una base de datos nueva.

### Ubuntu sin escritorio

En la carpeta extraída, ejecuta una sola vez:

```sh
bash Instalar.sh
```

El instalador muestra un enlace privado. Para abrirlo en el navegador de tu computadora, mantén un túnel SSH al servidor:

```sh
ssh -L 8765:127.0.0.1:8765 USUARIO@SERVIDOR
```

Abre el enlace **completo**, incluido su código después de `#`. No compartas ese enlace: el asistente solo escucha en la propia máquina y la sesión dura 30 minutos.

Ver [la guía completa de instalación, firewall y mantenimiento](docs/services.md).

## Desarrollo

```sh
bun install
bun run dev
bun run test:backend
```

Para generar el paquete de instalación de Ubuntu:

```sh
bun run build:installer:linux
```

Para Windows:

```sh
bun run build:installer:windows
```

Los ZIP y sus hashes se guardan en `dist/`. `bun run package:installers` empaqueta los binarios ya compilados de las tres plataformas. La publicación de releases compila también el binario macOS para su arquitectura objetivo y adjunta todos los instaladores, manteniendo los assets individuales usados por las actualizaciones.

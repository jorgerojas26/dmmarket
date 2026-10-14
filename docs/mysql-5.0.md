# MySQL 5.0.24 para desarrollo

El respaldo `bdsolser_md_nieto_2026_10_10.dump` identifica el servidor de origen como `5.0.24-community-nt` (Windows) y el cliente que lo exportó como `5.7.23` (macOS). No son la misma versión: para reproducir el motor de origen se usa **MySQL 5.0.24**, no MySQL 5.7.

## Imagen

`docker/mysql-5.0/Dockerfile` compila el código oficial de MySQL, etiqueta `mysql-5.0.24`, commit `1917a99270248262f7420fc61a6f1f50bf03b9a6`. La descarga se verifica mediante SHA-256. El compilador histórico usa Ubuntu 14.04; la imagen que ejecuta el servidor usa Ubuntu 22.04. Se compila también GNU Bison 2.3, con descarga verificada, para generar el parser SQL sin modificar la gramática histórica. No se modifica el código fuente del motor.

MySQL 5.0 y el entorno de compilación están fuera de soporte. Esta imagen es únicamente para desarrollo y validación local; no expongas su puerto a Internet ni la uses como recomendación de instalación de producción.

## Inicio

Desde la raíz del repositorio:

```sh
MYSQL_DUMP_PATH="$HOME/Downloads/bdsolser_md_nieto_2026_10_10.dump" docker compose up -d --build mysql
```

Si no se indica `MYSQL_DUMP_PATH`, se usa `./bdsolser_md_nieto.dump`. El archivo debe existir antes de iniciar. La primera compilación es lenta, especialmente con emulación amd64 en un Mac ARM.

La base se importa **solo al inicializar un volumen nuevo**. Cambiar el archivo de respaldo no reemplaza los datos de un volumen existente. Si la importación falla, el contenedor no considera el volumen listo; inspecciona los registros y usa otro volumen vacío para volver a intentarlo.

El servidor se publica solamente en `127.0.0.1:3307`. Las credenciales de desarrollo se definen en `docker-compose.yml`. La aplicación sigue usando el mismo host, puerto y nombre de base.

```sh
docker compose logs -f mysql
docker compose exec mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -e "SELECT VERSION(); SHOW VARIABLES WHERE Variable_name IN (\"lower_case_table_names\", \"character_set_server\", \"collation_server\", \"sql_mode\", \"time_zone\");"'
docker compose exec mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqlcheck -uroot --check "$MYSQL_DATABASE"'
```

## Diferencias Windows/Linux

- `lower_case_table_names=1` se establece antes de inicializar InnoDB para reproducir el comportamiento habitual de Windows con los nombres de tablas.
- El respaldo declara tablas InnoDB con `latin1`. Se conserva ese esquema y se usa `latin1_swedish_ci` como collation predeterminada; no se convierte a `utf8mb4`.
- Se usa `sql-mode=` para admitir datos históricos, incluyendo fechas cero. Es una configuración de compatibilidad elegida, no una medición del servidor original: el `SET SQL_MODE` del respaldo describe la sesión de importación.
- El respaldo establece UTC durante su importación y luego restaura la zona de la sesión. La zona horaria del servidor Windows no queda registrada; debe contrastarse antes de afirmar equivalencia de operaciones dependientes de la hora.
- La compilación Linux no devolverá el sufijo `community-nt`, propio de Windows. No se falsifica la cadena de versión.

La coincidencia de versión y una importación correcta no garantizan equivalencia absoluta entre plataformas. Para cerrar la validación se requieren `my.ini` o `SHOW VARIABLES` del servidor Windows, las consultas y operaciones reales de la aplicación, y una comparación de sus resultados. Deben comprobarse especialmente zona horaria, SQL mode, collations, transacciones y triggers.

## Conservar o recuperar MySQL 5.7

MySQL 5.0 usa el volumen independiente `dmmarket_mysql_data_50`. El volumen anterior `dmmarket_mysql_data_57` no se reutiliza ni se convierte. Nunca conectes MySQL 5.0 a un directorio de datos de MySQL 5.7.

Durante el cambio local, el contenedor anterior se conserva detenido como `dm_mysql_57_previous`. Para recuperar ese contenedor:

```sh
docker compose stop mysql
docker start dm_mysql_57_previous
```

Ambos publican el puerto 3307, por lo que no deben ejecutarse simultáneamente. No ejecutes `docker compose down -v` ni elimines el volumen anterior si necesitas conservarlo.

# Changelog

Todos los cambios visibles para el usuario de DMMarket, ordenados de más reciente a más antiguo.

El formato sigue la convención: `## [vX.Y.Z] - AAAA-MM-DD` con las categorías
`### Nuevas funciones`, `### Mejoras` y `### Correcciones` (se omiten las vacías).
Este archivo es la fuente única del resumen de producto que aparece al inicio de cada
release en GitHub. Después, `scripts/release.mjs` agrega la lista de commits incluidos.

## [v1.9.0] - 2026-10-22

### Nuevas funciones

- **Módulo de Vendedores**: nuevo espacio en el menú para seguir al equipo de ventas. Incluye un tablero con la cobertura del equipo, quiénes mejoraron respecto al período anterior, la venta promedio por vendedor, la concentración de las ventas y los vendedores que llevan más de 30 días sin vender. El ranking muestra además cómo cambió cada vendedor frente al período anterior.
- **Detalle de cada vendedor**: abre a cualquier vendedor desde el tablero o desde el desglose para ver su tendencia mensual, sus mejores clientes y productos, y su historial de facturas con búsqueda, orden, paginación e impresión.
- **Desglose de vendedores**: consulta en una sola tabla las ventas, utilidad, margen, facturas, clientes, ticket promedio, última venta y días sin vender de cada vendedor, con búsqueda, orden y totales.

## [v1.8.2] - 2026-10-19

### Mejoras

- **Más atajos de fechas**: consulta los últimos 3 o 6 meses con un solo clic.

### Correcciones

- **Período seleccionado visible**: el atajo que coincide con las fechas elegidas queda resaltado en azul, incluso al entrar al dashboard de ventas. «Este año» abarca desde el 1 de enero hasta hoy.

## [v1.8.1] - 2026-10-19

### Nuevas funciones

- **Búsqueda de productos en Despacho**: encuentra productos por nombre, identificador o categoría sin volver a cargar los datos. La búsqueda ignora mayúsculas y acentos, y los totales y la impresión reflejan los resultados filtrados sin cambiar las facturas seleccionadas.

### Correcciones

- **Buscadores con altura estable**: las barras de búsqueda de las tablas conservan su tamaño tanto cuando hay resultados como cuando el listado está vacío.

## [v1.8.0] - 2026-10-19

### Nuevas funciones

- **Historial de clientes con deuda**: consulta desde Cuentas por cobrar a los clientes que tuvieron deuda, aunque ya no tengan saldo pendiente. Revisa todas sus facturas, abonos y cierres manuales, busca por cliente y filtra por ruta o estado de deuda.

## [v1.7.1] - 2026-10-18

### Correcciones

- **Fechas de documentos sin desfases**: las facturas, notas de entrega y compras conservan su fecha original al consultar e imprimir los reportes, aunque el servidor y la computadora usen zonas horarias distintas. Al filtrar un día o un período, las fechas mostradas coinciden con el rango elegido, sin retroceder al día anterior.

## [v1.7.0] - 2026-10-18

### Mejoras

- **Cobranza sin activación adicional**: registra abonos, anúlalos y gestiona cierres y reaperturas de deuda directamente desde Cuentas por cobrar, conservando la revisión y confirmación de cada operación.

### Correcciones

- **Actualizaciones listas sin recargar a mano**: la página se recarga automáticamente cuando termina el reinicio de la aplicación. Si el reinicio tarda más de lo esperado, muestra un aviso y permite recargarla.

## [v1.6.0] - 2026-10-16

### Nuevas funciones

- **Vendedores de cada proveedor**: consulta cuánto vendió cada vendedor, su utilidad, las unidades vendidas y los clientes atendidos. Abre sus clientes y facturas para revisar el detalle e imprimir los listados.
- **Seguimiento de un producto hasta sus clientes**: desde los productos de un proveedor puedes consultar quiénes lo vendieron, a qué clientes y en qué documentos. Filtra por vendedor o vuelve a ver todos los clientes del producto, con búsqueda, ordenamiento e impresión.

### Mejoras

- **Ventas del cliente más fáciles de consultar**: busca por documento o vendedor, ordena los resultados e imprime todas las páginas filtradas desde la ficha del cliente.
- **Ficha del cliente con un período más cercano**: el rango inicial pasa de un año a un mes, conservando la referencia a la última factura cuando corresponde.
- **Tablas con una presentación uniforme**: los listados de los distintos módulos y ventanas comparten colores, encabezados y filas de totales, también en respaldos, segmentos de clientes y facturas seleccionadas para despacho.

### Correcciones

- **Filtros de fechas más claros**: Despacho muestra el día actual al entrar y el filtro de Desglose de Clientes vuelve a aparecer a la derecha del título.
- **Facturas y reportes completos aunque falten fichas**: las ventas, compras y sus importes se conservan cuando falta el registro de un cliente, vendedor, producto, grupo o proveedor. Los detalles de las facturas y notas de entrega también pueden abrirse en esos casos.
- **Despachos con todas sus líneas**: las líneas repetidas de una factura ya no desaparecen y los importes se calculan sin redondear antes de tiempo sus cantidades o precios.
- **Cartera histórica consultable**: las cuentas de clientes que ya no tienen ficha siguen disponibles para consulta, sin habilitar cobros sobre ellas ni relajar las comprobaciones de seguridad.
- **Datos no disponibles claramente indicados**: cuando falta la información necesaria para determinar una comisión o el valor de inventario, se muestra «No disponible» en lugar de asumir un importe.
- **Ventanas de detalle mejor separadas**: cada ventana superpuesta oscurece la anterior y permite regresar a ella sin perder la selección ni la información consultada.

## [v1.5.6] - 2026-10-16

### Mejoras

- **Tablero de clientes más rápido en servidores antiguos**: se reducen las esperas y el trabajo del servidor al consultar actividad, retención y cobertura, conservando los indicadores y los filtros por fecha y ruta.

## [v1.5.5] - 2026-10-16

### Mejoras

- **Tablero de clientes más ágil**: se retiran el indicador de ventas en riesgo y el gráfico de inactividad para evitar el cálculo histórico que provocaba largas esperas y una carga elevada en el servidor.

## [v1.5.4] - 2026-10-16

### Correcciones

- **Inicio con MySQL antiguo**: se corrige un error que impedía arrancar al preparar cuentas por cobrar en servidores antiguos.
- **Recuperación después de una interrupción**: el inicio puede recuperar una preparación abandonada sin permitir que dos instancias preparen la misma base al mismo tiempo.
- **Protección de la base compartida**: el arranque solo prepara tablas propias de DMMarket. Los cambios de índices y la activación de la captura histórica de comisiones que afectan al sistema de ventas requieren mantenimiento autorizado; no se modifican los mecanismos ya existentes.
- **Índices existentes conservados**: la optimización manual del desglose de ventas ya no elimina el índice anterior, que puede ser utilizado por otros sistemas.
- **Respaldos compatibles con la herramienta instalada**: las copias se ajustan a las opciones disponibles y muestran la causa real cuando fallan, sin exponer la contraseña.
- **Respaldos sin detener las ventas cuando la base lo permite**: el modo habitual crea una copia consistente sin bloqueo global. Si la base requiere bloquear las escrituras, exige habilitación expresa en lugar de hacerlo automáticamente.
- **Instalación con un diagnóstico más claro**: el asistente permite que la primera preparación tarde varios minutos y muestra los errores del intento actual, sin confundirlos con fallos anteriores.

## [v1.5.3] - 2026-10-16

### Correcciones

- **Primera instalación en Windows**: se corrige un error que detenía el asistente al confirmar la instalación en un equipo donde DMMarket todavía no estaba instalado.

## [v1.5.2] - 2026-10-16

### Correcciones

- **Desglose de ventas completo**: las ventas vigentes ya no se omiten cuando falta el registro del cliente, vendedor, producto o grupo. Los productos sin registro se mantienen separados y los importes siguen incluidos en los totales.
- **Facturas ordenadas por número**: al ordenar la columna Factura, el orden ascendente o descendente se aplica a todo el resultado, también al cambiar de página.

## [v1.5.1] - 2026-10-15

### Correcciones

- **Inicio después de actualizar**: se corrige un error que impedía arrancar DMMarket al preparar las nuevas funciones de cuentas por cobrar en algunas instalaciones.

## [v1.5.0] - 2026-10-14

### Nuevas funciones

- **Cuentas por cobrar en Clientes**: nueva sección para consultar la cartera de clientes con deuda, sus saldos pendientes y vencidos, las facturas y el historial de cobranza. Incluye búsqueda y filtros por ruta y vencimiento.
- **Abonos y gestión de deuda**: con la cobranza habilitada, registra pagos en bolívares o dólares, revisa su distribución entre las facturas antes de confirmar y consulta el saldo actualizado. También puedes anular abonos, cerrar deudas y reabrir cierres, indicando el motivo y conservando el historial. Los cierres manuales se distinguen del dinero recibido.
- **Estados de cuenta para imprimir**: genera el listado de cuentas por cobrar y el estado de cuenta de cada cliente, con sus facturas, abonos y movimientos de cobranza.
- **Nuevo icono de DMMarket**: las pestañas del navegador y los accesos directos en dispositivos Apple muestran las letras DM en blanco sobre fondo azul para identificar fácilmente la aplicación.

## [v1.4.1] - 2026-10-11

### Correcciones

- **Pareto de ventas con productos recientes**: el análisis vuelve a cargar sin errores al ordenar las fechas de primera compra de los productos nuevos, manteniendo la clasificación según el límite de 30 días.

## [v1.4.0] - 2026-10-11

### Correcciones

- **Tablero de ventas sin esperas interminables**: si una consulta anterior queda detenida, las nuevas consultas pueden continuar sin quedarse esperando indefinidamente. Al renovar los reportes también se liberan las consultas que estaban esperando.
- **Reportes más ágiles en Linux**: las consultas recientes se reutilizan correctamente al volver a abrirlas, evitando repetir cálculos innecesarios.

## [v1.3.0] - 2026-10-10

### Nuevas funciones

- **Respaldos cuando los necesites**: desde Configuración puedes crear una copia del negocio en cualquier momento, sin reemplazar las anteriores ni cambiar el horario diario. Antes de empezar se pide confirmación y se avisa del posible bloqueo temporal de las escrituras. Las copias manuales también cuentan dentro del límite de 30 respaldos conservados.

### Mejoras

- **Acerca de más accesible**: aparece como primera opción del menú lateral de Configuración.

### Correcciones

- **Configuración conserva la sección elegida**: al recargar la página o navegar atrás y adelante, sigues en Acerca de o Respaldos según la dirección que tienes abierta.

## [v1.2.0] - 2026-10-03

### Nuevas funciones

- **Respaldos diarios del negocio**: con la herramienta de respaldo del servidor configurada, DMMarket guarda una copia de la base de datos a las 02:00, hora del servidor, y conserva los últimos 30 respaldos completados.
- **Configuración de dominio local (opcional)**: el instalador permite preparar el acceso al sistema mediante una dirección fácil de recordar. Requiere configurar ese nombre en la red del negocio; el acceso directo sigue disponible.

### Mejoras

- **Pantalla de respaldos más clara**: consulta las copias disponibles, sus fechas y tamaños, la próxima ejecución y los avisos de error desde Configuración. La pantalla distingue los respaldos del servidor de la integración opcional con Google Drive.
- **Instalación básica sin pasos adicionales**: puedes dejar el sistema con arranque automático después de reiniciar el equipo, sin configurar un dominio. Las opciones adicionales se muestran por separado y pueden configurarse más adelante.

### Correcciones

- **Permisos de red bajo tu control**: los ajustes de protección de la red ya no se seleccionan automáticamente durante la instalación; debes autorizarlos de forma expresa.

## [v1.1.0] - 2026-10-03

### Nuevas funciones

- **Avisos de nuevas versiones**: mientras tienes la aplicación abierta en el navegador, DMMarket busca actualizaciones cada 12 horas y te avisa cuando hay una disponible. Puedes actualizar y reiniciar desde el aviso, ver el progreso y reintentar si ocurre un error.
- **Instalación guiada en Windows, Mac y Ubuntu**: descarga el paquete de tu plataforma y sigue un asistente en el navegador para comprobar la conexión con la base de datos del negocio y configurar el acceso desde la red local, sin editar archivos a mano.
- **Arranque automático del sistema**: DMMarket puede iniciar al encender el servidor, sin que alguien tenga que abrir el programa o iniciar sesión, y volver a arrancar si se detiene.

### Mejoras

- **Actualizaciones que conservan el arranque automático**: al actualizar una instalación con inicio automático, el sistema vuelve a funcionar desde la misma ubicación y conserva su configuración.

## [v1.0.6] - 2026-10-03

### Nuevas funciones

- **DMMarket en Ubuntu y Linux**: ahora puedes usar el programa en computadoras Linux de 64 bits, incluido Ubuntu, sin instalar herramientas adicionales para ejecutarlo.
- **Actualizaciones desde la aplicación en Linux**: busca nuevas versiones, descárgalas y reinicia el programa desde la aplicación, igual que en Windows y Mac.

## [v1.0.5] - 2026-09-29

### Nuevas funciones

- **Detalle de ventas desde la ficha del cliente**: abre una factura para consultar sus artículos y montos sin salir del resumen del cliente.

### Mejoras

- **Tableros de ventas y compras más claros**: compara los indicadores del período junto a la distribución por categorías y al mejor vendedor o proveedor, en una vista que se adapta al tamaño de pantalla.
- **Búsqueda de proveedores más ágil**: encuentra y selecciona proveedores sin esperar a que cargue el informe completo.
- **Proveedores ordenados por utilidad**: el listado destaca primero a quienes más contribuyen a las ganancias.
- **Informes más rápidos al volver a consultarlos**: las consultas recientes responden antes y los cambios registrados en el sistema renuevan la información.
- **Vistas de clientes e inventario más cómodas**: la información se reorganiza para aprovechar mejor tanto las pantallas pequeñas como las grandes.

### Correcciones

- **Actividad de clientes más precisa**: las facturas vacías ya no detienen el contador de inactividad.

## [v1.0.4] - 2026-09-29

### Nuevas funciones

- **Más claridad sobre la rentabilidad**: los reportes de ventas, clientes y proveedores ahora muestran las ganancias y los totales para ayudar a comparar resultados.
- **Seguimiento de productos recientes e inventario**: consulta en una tabla aparte los productos incorporados hace menos de 30 días, sin que alteren la clasificación de los demás, y revisa el valor actual del inventario.
- **Historial de versiones en Configuración**: revisa las versiones publicadas, sus fechas y sus notas desde la sección Acerca de.

### Mejoras

- **Impresiones más predecibles**: al imprimir una tabla, se conserva el orden de filas que elegiste.

### Correcciones

- **Promedios de ganancia coherentes**: el porcentaje promedio de ganancia ahora se calcula de la misma manera en los reportes por producto y por factura.

## [v1.0.3] - 2026-08-19

### Nuevas funciones

- **Actualización automática en Mac**: el programa ahora también se actualiza solo en computadoras Mac, igual que en Windows.

## [v1.0.2] - 2026-08-19

### Mejoras

- **Ficha del cliente más cómoda**: el gráfico aparece arriba y la tabla ocupa todo el ancho, con altura limitada para que la pantalla no se llene.
- **Navegación en pantallas pequeñas**: la barra superior y el menú lateral se adaptan para usarse cómodamente en pantallas angostas.
- **Menú de inventario más claro**: la pestaña del inventario ahora se llama "Desglose", con un ícono de lista.

### Correcciones

- **Rutas de clientes limpias**: se eliminaron los valores vacíos o inválidos que a veces aparecían en la lista de rutas de un cliente.
- **Ficha del cliente más rápida**: el resumen del cliente podía quedarse esperando para siempre; ahora carga al instante.

## [v1.0.1] - 2026-08-19

Primera versión del sistema de reportes de distribución de alimentos. Incluye:

- **Ventas**: tablero con indicadores (totales, utilidad, ranking de productos y clientes), gráficos y desglose por categorías, vendedores y facturas.
- **Clientes**: ficha completa de cada cliente con su historial, utilidad por cliente y análisis de clasificación ABC (Pareto).
- **Compras e inventario**: totales globales y desglose con formato de números venezolano.
- **Despacho**: vista con pestañas adaptables y totales por proveedor.
- **Tablas mejoradas**: ordenamiento, búsqueda, paginación, totales e impresión desde cualquier tabla.
- **Auto-update en Windows**: el programa se actualiza solo a nuevas versiones.

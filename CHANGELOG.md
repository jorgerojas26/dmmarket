# Changelog

Todos los cambios visibles para el usuario de DMMarket, ordenados de más reciente a más antiguo.

El formato sigue la convención: `## [vX.Y.Z] - AAAA-MM-DD` con las categorías
`### Nuevas funciones`, `### Mejoras` y `### Correcciones` (se omiten las vacías).
Este archivo es la fuente única del resumen de producto que aparece al inicio de cada
release en GitHub. Después, `scripts/release.mjs` agrega la lista de commits incluidos.

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

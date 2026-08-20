# Changelog

Todos los cambios visibles para el usuario de DMMarket, ordenados de más reciente a más antiguo.

El formato sigue la convención: `## [vX.Y.Z] - AAAA-MM-DD` con las categorías
`### Nuevas funciones`, `### Mejoras` y `### Correcciones` (se omiten las vacías).
Este archivo es la fuente única de las notas de cada release en GitHub: el script
`scripts/release.mjs` lo lee para construir las notas de la versión.

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

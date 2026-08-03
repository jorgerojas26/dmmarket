# 05 — Limpieza: eliminar página de Productos y código huérfano

**What to build:** Eliminar todo lo que quedó obsoleto al nacer el módulo de Compras: la ruta `/productos`, sus tres cards (fluctuación de costo, stock por grupo, costo por grupo), los endpoints del backend que solo ellas usaban y cualquier código frontend sin consumidores. El navbar queda con "compras" en vez de "productos".

**Blocked by:** 03 — Página de Compras: layout con sidebar y dashboard

**Status:** ready-for-agent

- [ ] La ruta `/productos` devuelve 404; el navbar muestra "compras" en su lugar (sin redirects ni capas de compatibilidad).
- [ ] Las tres cards de productos (fluctuación de costo, stock por grupo, costo por grupo de producto) se eliminan del código.
- [ ] Los endpoints del backend de productos que solo alimentaban esas cards se eliminan (fluctuación de costo, stock, costo por grupo), dejando intactos los que usa el resto del sistema (búsqueda de productos, listas de precios).
- [ ] Todo código frontend (API client, hooks, componentes) que quedó sin consumidores tras la eliminación se elimina también.
- [ ] El sistema completo compila y los tests existentes pasan tras la limpieza.

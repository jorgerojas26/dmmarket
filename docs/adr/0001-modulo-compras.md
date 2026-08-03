# Módulo Compras reemplaza la página Productos

La página `/productos` (cards de fluctuación de costo, stock por grupo y costo por grupo) se elimina sin reemplazo y se sustituye por un módulo `/compras` que replica la estructura de `/ventas`: sidebar con vistas **dashboard** y **desglose**, KPIs con comparación vs período anterior, torta de categorías, Pareto ABC por monto comprado, top productos/proveedores y desglose con tablas de facturas de compra y productos (filtros proveedor + grupo, export PDF).

La duplicación del esqueleto de ventas en lugar de extraer una abstracción compartida es deliberada: los módulos divergen (ventas tiene `showNoe` y despacho; compras no tiene margen ni toggle) y generalizar antes de tiempo contradice la regla del repo de no crear abstracciones especulativas.

Las cards anteriores (CostFluctuation, GroupStock, ProductCostPerGroup) y sus endpoints (`/api/products/cost-fluctuation`, `/stock`, `/cost/group`) se eliminan por obsoletos — sin capas de compatibilidad ni redirects. Compras ignora `showNoe`: siempre usa `mastercomp`/`slavecomp` fijos.

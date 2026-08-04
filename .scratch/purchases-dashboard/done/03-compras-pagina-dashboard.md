# 03 — Página de Compras: layout con sidebar y dashboard

**What to build:** El módulo de Compras navegable. La ruta `/compras` reemplaza el punto de entrada del módulo con un layout de sidebar lateral (como Ventas) con dos vistas: **Dashboard** y **Desglose**. La vista Dashboard muestra los 6 KPIs (Total Comprado, Unidades, Transacciones, Ticket Promedio, Costo Promedio por Unidad) con deltas vs período anterior, tarjeta del Mejor Proveedor, torta de categorías por monto, Pareto ABC por monto comprado, Top Productos y Top Proveedores. El rango de fechas y la vista activa quedan persistidos en la URL (`view`, `from`, `to`) y el navbar muestra "compras". La vista Desglose es un placeholder en este ticket.

**Blocked by:** 01 — API de compras: dashboard y pareto

**Status:** ready-for-agent

- [ ] Navegar a `/compras` muestra el layout con sidebar lateral (Dashboard / Desglose) y el DateRangePicker compartido arriba del contenido.
- [ ] El DateRangePicker tiene defaults: dashboard desde inicio de año hasta hoy; al cambiar la vista a desglose, desde hoy hasta hoy.
- [ ] La URL refleja la vista y el rango (`view`, `from`, `to`); recargar o compartir la URL restaura el estado.
- [ ] La vista Dashboard consume los endpoints de compras (dashboard + pareto) y muestra: Total Comprado, Unidades, Transacciones, Ticket Prom, Costo Prom/Unidad (con indicador ▲/▼ vs período anterior donde aplique), tarjeta Mejor Proveedor con su monto, torta de categorías por monto comprado, Pareto ABC (reutilizando el componente de Pareto existente con etiquetas y métricas de compras), Top Productos y Top Proveedores por monto.
- [ ] Cambiar el rango de fechas actualiza todo el dashboard junto (KPIs, gráficos, tablas, comparativa) sin recargar por sección.
- [ ] El módulo ignora el toggle de facturas/notas de entrega del navbar (no envía el parámetro ni cambia tablas).
- [ ] La vista Desglose muestra un placeholder (se implementa en el ticket 04).
- [ ] El layout es responsive (sidebar colapsa en móvil) y reutiliza el patrón de layout de sidebar del resto del sistema.
- [ ] Estados de carga y error visibles (spinner mientras carga, mensaje si el API falla).

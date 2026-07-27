# DMMarket

Sistema de reportes para un negocio de distribución de alimentos. Analiza compras, ventas, productos, clientes, proveedores y vendedores.

## Language

**Proveedor (Provider)**:
Entidad que suministra productos al negocio. Tiene compras asociadas (mastercomp/slavecomp) y ventas indirectas a través de sus productos (masterfact/slavefact filtrado por `productos.Proveedor`).
_Avoid_: Supplier

**Cliente (Client)**:
Entidad que compra productos mediante facturas de venta. Referenciado en `masterfact.IdCliente` / `masternoe.IdCliente`.
_Avoid_: Buyer, customer

**Producto (Product)**:
Ítem con precio, costo, grupo y proveedor asociado. Tabla `productos`.
_Avoid_: Item, SKU

**Venta (Sale)**:
Factura de venta registrada en `masterfact`/`masternoe` (cabecera) + `slavefact`/`slavenoe` (líneas). Agrupa productos vendidos a un cliente por un vendedor. Anulada = factura descartada.
_Avoid_: Invoice (usar solo para contexto de API), factura

**Compra (Purchase)**:
Factura de compra registrada en `mastercomp` (cabecera) + `slavecomp` (líneas). Agrupa productos comprados a un proveedor.
_Avoid_: Purchase order, procurement

**Total Ventas (Gross Sales)**:
`SUM(Precio * Cantidad)` — ingreso bruto de ventas para un alcance dado (proveedor, cliente, producto, período).
_Avoid_: Revenue, gross revenue

**Utilidad (Net Profit / Margin)**:
`SUM((Precio - Costo) * Cantidad)` — ganancia neta después de restar costo de adquisición.
_Avoid_: Ganancia, profit margin (usar solo al referirse al porcentaje)

**Vendedor (Salesperson)**:
Persona que realiza ventas. Tabla `vendedores`. Referenciado en `masterfact.IdVend`.
_Avoid_: Employee, sales rep

**Grupo (Group/Category)**:
Categoría a la que pertenece un producto. Tabla `grupos`. Usado para agrupar reportes de ventas y comisiones.
_Avoid_: Category

**showNoe**:
Flag booleano que alterna entre dos juegos de tablas de ventas: `masterfact/slavefact` (false) y `masternoe/slavenoe` (true). Representa dos sistemas de facturación diferentes o períodos contables.
_Avoid_: (n/a — es un flag técnico, no un concepto de negocio)

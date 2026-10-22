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

**Total Compras (Gross Purchases)**:
`SUM(Precio * Cantidad)` sobre `slavecomp` — inversión en inventario para un alcance dado (proveedor, grupo, producto, período). En compras `Precio` es el costo de adquisición; no existe margen.
_Avoid_: Purchases, gasto de adquisición, procurement

**Utilidad (Net Profit / Margin)**:
`SUM((Precio - Costo) * Cantidad)` — ganancia neta después de restar costo de adquisición.
_Avoid_: Ganancia, profit margin (usar solo al referirse al porcentaje)

**Vendedor (Salesperson)**:
Persona que realiza ventas. Tabla `vendedores`. Referenciado en `masterfact.IdVend`.
_Avoid_: Employee, sales rep

**Grupo (Group/Category)**:
Categoría a la que pertenece un producto. Tabla `grupos`. Usado para agrupar reportes de ventas y comisiones.
_Avoid_: Category

**Cuenta por cobrar (Receivable)**:
Importe pendiente que el negocio tiene derecho a cobrar a un cliente por una venta vigente. Incluye deuda histórica mientras continúe pendiente de cobro.
_Avoid_: Total Ventas (incluye ventas que ya no tienen saldo pendiente)

**Documento por cobrar (Receivable Document)**:
Registro individual de la deuda de una venta, con su importe, vencimiento y saldo pendiente. Un cliente puede tener varios; no es un archivo ni un comprobante de pago.
_Avoid_: PDF, archivo, comprobante de pago

**Abono (Payment)**:
Dinero recibido de un cliente para pagar total o parcialmente sus cuentas por cobrar. Su moneda puede ser distinta de la moneda base de cobranza.
_Avoid_: Venta (origina la deuda, no representa su cobro)

**Aplicación de abono (Payment Allocation)**:
Parte de un abono destinada a reducir el saldo de una cuenta por cobrar. Los abonos se distribuyen automáticamente comenzando por los documentos con vencimiento más antiguo.
_Avoid_: Abono (representa el dinero recibido, no su distribución)

**Anulación de abono (Payment Reversal)**:
Corrección que deja sin efecto un abono registrado por error y revierte sus aplicaciones, conservando el registro original y el motivo.
_Avoid_: Eliminación (borra el historial de lo ocurrido)

**Cierre manual de deuda (Manual Debt Closure)**:
Decisión de dar por terminada una cuenta por cobrar aunque quede dinero pendiente. Puede abarcar un documento o todos los documentos pendientes de un cliente; no representa dinero recibido.
_Avoid_: Abono, pago (representan dinero recibido)

**Reapertura de deuda (Debt Reopening)**:
Corrección que revierte un cierre manual y restituye únicamente el importe extinguido por ese cierre, conservando los abonos vigentes. Mantiene el motivo y el historial de la corrección.
_Avoid_: Anulación de abono (revierte dinero aplicado, no un cierre manual)

**Excedente no aplicado (Unallocated Excess)**:
Parte del dinero recibido que supera la deuda disponible para aplicar el abono. Se conserva como información del abono, sin generar saldo a favor ni devolución gestionados por DMMarket.
_Avoid_: Anticipo, saldo a favor (implicarían dinero disponible para futuras aplicaciones)

**Moneda base de cobranza (Receivables Base Currency)**:
USD, moneda en la que se expresa el saldo de las cuentas por cobrar. Un abono en bolívares se expresa también en USD mediante la tasa de cambio aplicada al abono.
_Avoid_: Moneda de pago (puede ser distinta de la moneda base)

**Moneda de pago (Payment Currency)**:
Moneda en la que se recibe un abono del cliente: USD o bolívares.
_Avoid_: Moneda base (describe el saldo, no necesariamente el dinero recibido)

**showNoe**:
Flag booleano que alterna entre dos juegos de tablas de ventas: `masterfact/slavefact` (false) y `masternoe/slavenoe` (true). Representa dos sistemas de facturación diferentes o períodos contables.
_Avoid_: (n/a — es un flag técnico, no un concepto de negocio)

**Tasa BCV (BCV Reference Rate)**:
Tipo de cambio de referencia Bs/USD que el Banco Central de Venezuela publica una vez por día hábil con fecha valor. El BCV lo publica en dos columnas (compra y venta): DMMarket captura ambas en `bcv_tasas` para auditar la fuente, pero llama **tasa** a la de venta, que es el valor de referencia con el que se convierte. Es historial, no la tasa vigente de `divisas`.
_Avoid_: Tasa oficial (esa es la de `divisas`, sin fecha, que mantiene el sistema de ventas), compra, venta (la aplicación expone una sola tasa)

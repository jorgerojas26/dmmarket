# La tasa del abono en bolívares es editable y no se infiere del historial

La base no conserva historial de tasas: `divisas` guarda una sola tasa vigente por moneda, sin fecha, y la mantiene el sistema de ventas. `masterfact.TasaDeCambio` existe por factura, pero las ventas se registran en USD con tasa 1.000 y DMMarket nunca la lee; `cxc_documentos` no guarda tasa. Por eso un abono en bolívares con fecha anterior se convertía con la REF del momento de capturarlo, no con la del día del pago, y la diferencia quedaba en el saldo del cliente.

Se decidió que el operador pueda indicar la tasa al registrar el abono. Si la fecha es hoy y no indica otra, se usa la REF vigente; si la fecha es anterior, la tasa es obligatoria. El servidor valida que sea positiva y con hasta 6 decimales, y guarda la tasa aplicada en `cxc_movimientos.TasaCambio` y el origen (`REF` o indicada) en el historial de la operación. No se usa una tasa de hoy en silencio ni se infiere una histórica.

La alternativa de congelar la tasa en la factura se descartó: la deuda está en USD y un cobro en bolívares se convierte al valor del día del pago, no al de la emisión. Congelarla en la factura acreditaría al cliente un importe en USD que no corresponde a lo recibido, y exigiría migrar una tabla compartida.

Esta decisión es deliberadamente parcial. La serie histórica del BCV (`bcv_tasas`) ya está implementada, pero la conversión del abono no la consulta: la tasa de fechas pasadas depende de que el operador la indique hasta que se decida usarla como fuente automática. Corregir un abono ya registrado con una tasa incorrecta se hace anulándolo y registrándolo de nuevo, conservando el historial.

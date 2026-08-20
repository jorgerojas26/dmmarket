# Ejemplo de sección de changelog bien redactada

Escribe cada ítem como una frase que un operador del sistema entienda sin contexto técnico.
Encabezado en negrita con el beneficio, seguido de una explicación en lenguaje de producto.

```markdown
## [v1.1.0] - 2026-08-19

### Nuevas funciones

- **Impresión de rutas de despacho**: ahora puedes imprimir el detalle de cada
  despacho con las rutas y proveedores, para llevarlo de respaldo en papel.

### Mejoras

- **Reportes más rápidos al filtrar por fecha**: al cambiar el rango de fechas,
  los totales del tablero se actualizan al instante.

### Correcciones

- **Totales correctos con descuentos**: cuando una factura tenía descuentos, el
  total general podía salir desfasado; ya coincide con la suma de sus líneas.
```

## Antes (mal) vs Después (bien)

| Mal (técnico) | Bien (no técnico) |
|---|---|
| "Agrega endpoint GET /api/despacho/:id y refactoriza el hook de impresión" | "Impresión de rutas de despacho: imprime el detalle de cada despacho con sus rutas y proveedores." |
| "Corrige cálculo del total con JOIN y CTE en MySQL 5.7" | "Totales correctos con descuentos: el total general ya coincide con la suma de sus líneas." |
| "chore: bump a 1.1.0" | *(omitido: sin efecto visible para el usuario)* |

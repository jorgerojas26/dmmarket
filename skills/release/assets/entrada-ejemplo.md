# Ejemplo de sección de changelog bien redactada

Escribe cada ítem como una frase que un operador del sistema entienda sin contexto técnico.
Encabezado en negrita con el beneficio, seguido de una explicación en lenguaje de producto.

Clasifica respecto de la última versión publicada, no respecto de los commits de desarrollo.
En este ejemplo, el tablero y los descuentos ya existían en v1.0.0; la impresión de rutas no.
Por eso las tres categorías describen capacidades independientes, no partes de una misma novedad.
Si solo hay una capacidad nueva, usa únicamente Nuevas funciones.

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

## Evitar mejoras de una función que se estrena

Si el cierre residual se presenta por primera vez en esta release, esto es incorrecto:

```markdown
### Nuevas funciones

- **Cierre residual al abonar**: permite cerrar pequeñas diferencias pendientes.

### Mejoras

- **Cierre residual más claro**: muestra cuatro decimales y registra el cierre en el historial.
```

Los cuatro decimales y el historial son parte de la capacidad nueva, no una mejora de algo
que el usuario ya conocía. La entrada correcta los agrupa, aunque provengan de commits distintos:

```markdown
### Nuevas funciones

- **Cierre de pequeñas diferencias al abonar**: al revisar un abono, puedes cerrar el saldo residual. Se muestra con cuatro decimales y el cierre queda registrado por separado en el historial, sin contarlo como dinero recibido.
```

En una release posterior, si ese cierre ya estaba publicado y se añade una opción nueva para
consultar sus registros, esa ampliación sí puede ir en Mejoras. Que Cuentas por cobrar existiera
antes no convierte los detalles del estreno del cierre residual en mejoras.

## Revisión antes de presentar las notas

- ¿Qué capacidad ya publicada modifica cada entrada en Mejoras? Si no hay evidencia, reclasifica.
- ¿Alguna mejora solo completa la explicación de una novedad de esta misma release? Fusiónala con esa novedad.
- ¿Hay ajustes de desarrollo de una novedad listados como Correcciones? Intégralos en su presentación inicial.
- ¿Se crearon categorías solo para repartir los detalles de una misma capacidad? Elimínalas.

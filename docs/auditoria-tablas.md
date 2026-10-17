# Auditoría de tablas

## Alcance

Revisión de todos los archivos JavaScript/JSX y CSS de `packages/frontend/src`, excluyendo pruebas y artefactos de compilación. Incluye ventas, compras, clientes, proveedores, inventario, vendedores, cuentas por cobrar, configuración y sus modales.

Resultado: 24 usos de `Table` en 22 archivos consumidores. El único elemento HTML `<table>` de la aplicación está en `packages/frontend/src/components/Table/index.js`.

## Hallazgos y correcciones

| Ubicación | Diferencia encontrada | Corrección |
| --- | --- | --- |
| Proveedores | Tipografía, colores, padding y hover propios | Eliminadas la clase de tabla y sus reglas locales |
| Detalle de documentos | Cabecera, bordes, alineación y tamaños propios | Eliminados los estilos de tabla; se conserva la búsqueda, el scroll accesible y la opción de mostrar utilidad |
| Modal de proveedor | Reglas antiguas de tabla, sin uso actual | Eliminadas |
| Segmentos del dashboard de clientes | Tabla HTML con clases Bootstrap | Migrada a `Table` |
| Facturas seleccionadas para despacho | Tabla HTML y estilos propios | Migrada a `Table`, conservando quitar facturas, limpiar selección y total |
| Historial de respaldos | Tabla Bootstrap y presentación móvil como tarjetas | Migrada a `Table` con scroll, conservando tamaños, fechas y estados de Google Drive |
| Cuentas por cobrar | Regla antigua para celdas de documentos | Eliminada |
| Estilos globales | Apariencia de tablas repartida entre `index.css` y `Table/styles.css` | Centralizada en `Table/styles.css`, bajo la clase común `data-table` |

El modal de cliente también utiliza los estilos compartidos, sin la clase Bootstrap `table` ni overrides locales.

## Contrato visual

- Fuente única de apariencia: `packages/frontend/src/components/Table/styles.css`.
- Todas las tablas reciben la clase `data-table` desde el componente compartido.
- Ningún consumidor pasa `className` o `style` a `Table`.
- No quedan imports del componente Table de Bootstrap ni elementos `<table>` fuera del componente compartido.
- Los módulos pueden definir el layout del contenedor y conservar botones, badges y estados del negocio. No definen el aspecto de cabeceras, celdas, filas o footers.
- Los rankings, gráficos y listas de documentos desplegables no son tablas y conservan su presentación.
- Los documentos PDF conservan su formato de impresión; esta auditoría corresponde a las tablas de la interfaz.

## Validación

- Compilación de producción del frontend: correcta.
- Suite existente del frontend: 39 suites y 363 pruebas aprobadas, sin agregar ni modificar pruebas.
- Verificación estática de JSX: único `<table>` en el componente compartido; sin tablas Bootstrap ni props de apariencia en consumidores.
- Revisión de CSS: sin overrides visuales de tablas fuera de `Table/styles.css`; permanecen únicamente reglas de layout de contenedores.
- Navegador: Clientes, modal de cliente, detalle de factura y Proveedores presentan los mismos estilos computados de cabeceras y celdas. Los footers comprobados tienen fondo opaco `#252830`.

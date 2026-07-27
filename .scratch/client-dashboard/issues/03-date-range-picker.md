## What to build

Crear un componente `DateRangePicker` usando la librería `react-date-range`. El componente permite seleccionar un rango de fechas (from/to) de forma intuitiva con un calendario visual. Hace auto-submit: al seleccionar fechas, emite inmediatamente el nuevo rango al componente padre sin necesidad de botón "Enviar".

El valor por defecto es desde hace 1 año hasta hoy.

Se usa inicialmente solo en el modal de dashboard del cliente (Slice 4). Reemplazar los inputs de fecha existentes en otras páginas está fuera del alcance.

### Instalación

```bash
npm install react-date-range date-fns
```

### API del componente

```jsx
<DateRangePicker
  initialFrom={DateTime.now().minus({ years: 1 }).toISODate()}
  initialTo={DateTime.now().toISODate()}
  onChange={({ from, to }) => { /* auto-submit */ }}
/>
```

Ambas fechas se emiten como strings ISO (YYYY-MM-DD).

## Acceptance criteria

- [ ] `react-date-range` y `date-fns` instalados sin conflictos de dependencias
- [ ] El componente renderiza un calendario con selección de rango
- [ ] Al seleccionar un rango, `onChange` se dispara automáticamente con `{ from, to }` en formato ISO
- [ ] El valor inicial por defecto es [hoy - 1 año, hoy]
- [ ] El componente se integra visualmente con Bootstrap 5 (estilos consistentes)
- [ ] Funciona en React 17

## Blocked by

None — can start immediately.

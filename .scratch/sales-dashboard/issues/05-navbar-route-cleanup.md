# 05 — Limpieza de rutas y navbar

**Status:** ready-for-agent

**Blocked by:** 04 (todas las vistas migradas al sidebar).

## What to build

Eliminar las rutas independientes de `/categorias`, `/vendedores`, `/facturas` del router. Reducir el navbar de 7 a 4 items. Aplicar la clase `has-clients-sidebar` al navbar cuando la ruta activa es `/ventas`.

## Acceptance criteria

- [ ] Las rutas `/categorias`, `/vendedores`, `/facturas` ya no existen en el `<Switch>` de `App.js`.
- [ ] El navbar muestra solo 4 items en orden: Ventas, Clientes, Productos, Proveedores.
- [ ] Al hacer clic en cada item del navbar, navega a la ruta correspondiente correctamente.
- [ ] Cuando la ruta activa es `/ventas`, el navbar recibe la clase `has-clients-sidebar`.
- [ ] Clientes y Proveedores siguen funcionando igual.
- [ ] Los archivos originales (`pages/categories/index.js`, `pages/employees/index.js`, `pages/invoices/index.js`) NO se borran.

## Implementation details

### 1. Modificar `packages/frontend/src/App.js`

#### 1a. Array del navbar

**ANTES:**
```js
["facturas", "ventas", "clientes", "productos", "vendedores", "categorias", "proveedores"]
```

**DESPUÉS:**
```js
["ventas", "clientes", "productos", "proveedores"]
```

#### 1b. Clase has-clients-sidebar

**ANTES:**
```js
className={`app-navbar d-flex align-items-center ${(location.pathname === '/clientes' || location.pathname === '/proveedores') ? 'has-clients-sidebar' : ''}`}
```

**DESPUÉS:**
```js
className={`app-navbar d-flex align-items-center ${(location.pathname === '/ventas' || location.pathname === '/clientes' || location.pathname === '/proveedores') ? 'has-clients-sidebar' : ''}`}
```

#### 1c. Eliminar rutas del Switch

Eliminar estas líneas:
```jsx
<Route exact path="/categorias">
  <CategoriesPage />
</Route>
<Route exact path="/facturas">
  <InvoicesPage />
</Route>
<Route exact path="/vendedores">
  <EmployeesPage />
</Route>
```

#### 1d. Eliminar imports

Eliminar:
```js
import CategoriesPage from "./pages/categories";
import InvoicesPage from "./pages/invoices";
import EmployeesPage from "./pages/employees";
```

Solo si no se usan en otro lado. Verificar que el linter no reporte errores de imports no utilizados.

### 2. Archivos a modificar

- `packages/frontend/src/App.js` — únicamente.

### 3. No tocar

Nada más.

# Testing: cómo correr los tests del backend y sus gotchas

Los tests de contrato del backend (jest + supertest) corren contra la base de datos
MySQL local real (docker-compose, dump `bdsolser_md_nieto.sql`), NO contra mocks.
Sin la DB levantada, todos fallan.

## Cómo correr

```sh
# 1. Verificar DB
docker ps --filter name=dm_mysql          # debe estar "Up"
docker start dm_mysql                     # si está caída (ver gotcha 3)

# 2. Correr desde packages/backend
npx jest                                  # suite completa (~74 tests, 10-30s)
npx jest __tests__/purchases.test.js      # un archivo
```

La suite completa son 4 archivos en `packages/backend/__tests__/` y
`packages/backend/tests/` (unit con mocks). Se recomienda
`npx jest --testTimeout=20000` para márgenes contra DB real bajo carga paralela.

## Gotchas conocidos (resueltos — no repetir el debugging)

### 1. Jest se cuelga o tira `ENOENT: no such file or directory, open 'node:fs'`

- **Síntoma**: al importar `supertest`, jest-runtime falla con
  `ENOENT ... open 'node:fs'` (bug conocido de jest 30 + node ≥ 22 con
  `formidable`, dependencia de superagent), o jest corre para siempre sin
  imprimir nada.
- **Causa**: cache de jest corrupta (pasa tras matar un worker a la fuerza,
  e.g. un run que excedió timeout).
- **Fix permanente (ya aplicado)**: `"jest": { "cache": false }` en
  `packages/backend/package.json`. Si vuelve a aparecer: `npx jest --clearCache`.
- **No perseguir**: el warning "Jest did not exit one second after the test
  run has completed" es por el pool de knex sin cerrar; es inofensivo, los
  tests pasan igual.

### 2. Suites paralelas que siembran facturas se pisan entre sí

- **Síntoma**: un test de la suite X falla con totales que difieren en
  EXACTAMENTE el monto sembrado por la suite Y (e.g. `Expected: 644325.37
  Received: 144325.37` — diferencia de 500000).
- **Causa**: los tests de exclusión de anuladas insertan facturas
  `TESTAN%` en `mastercomp`/`slavecomp` y las des-anulan; jest corre los
  archivos en workers paralelos contra la MISMA DB, y si los rangos de
  fechas de las suites se solapan, una suite ve la semilla de la otra.
- **Regla para suites nuevas que siembren en la DB**: prefijo único
  (`TESTAN` en purchases.test.js, `TESTD2` en purchases-desglose.test.js) Y
  ventanas de fecha que NO se solapen (dashboard usa 2021-05; desglose usa
  2021-01-01..04-30). Limpieza defensiva en `afterAll` + `finally`.

### 3. Contenedor `dm_mysql` muere (exit 137) a mitad de sesión

- **Síntoma**: de golpe `ECONNREFUSED` en `127.0.0.1:3307` desde los tests
  (o desde `node -e` con `require('./database')`).
- **Causa**: exit 137 = SIGKILL (OOM del host o kill manual); MySQL no da
  error propio.
- **Fix**: `docker start dm_mysql` y esperar ~15s antes de reintentar
  (`docker ps --filter name=dm_mysql` para confirmar "Up").

### 4. El CLI de mysql del host no conecta al contenedor

- **Síntoma**: `ERROR 2059 (HY000): Authentication plugin
  'mysql_native_password' cannot be loaded` con el `mysql` de Homebrew (9.x).
- **Fix**: no usar el CLI; verificar la DB desde node con el propio
  `database.js` del backend (dotenv carga `.env` solo):
  `node -e "require('dotenv').config(); require('./database').raw('SELECT 1')..."`

## Notas

- El backend es CommonJS sin TypeScript; el "typecheck" es
  `npx biome check <archivos cambiados>`.
- Patrón de los tests: `__tests__/` = contrato supertest contra DB real;
  `tests/` = unit con `jest.doMock("../database")`.

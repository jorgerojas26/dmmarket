const http = require("node:http");
const https = require("node:https");
const tls = require("node:tls");
const { X509Certificate } = require("node:crypto");
const XLSX = require("xlsx");
const knex = require("./database");
const CA_INTERMEDIO = require("./bcv-ca");

const TABLA = "bcv_tasas";
const SITIO = "www.bcv.org.ve";
const TRIMESTRES = ["a", "b", "c", "d"];
const MESES_DE_HISTORIAL = 3;

const DIA_MS = 86_400_000;
const LOTE = 500;
const INTERVALO_MS = 30 * 60 * 1000;
const TIEMPO_LIMITE_MS = 60_000;
const MARGEN_DIAS = 7;
const VALOR_MAXIMO = 1e12;
const MAXIMO_DESCARTE = 0.05;
const MISMA_TASA = 1e-8;

// OpenSSL no descarga intermedios: si bcv.org.ve cambia de emisor, estas son
// las fallas de cadena con las que vale la pena resolver el AIA y reintentar.
const ERRORES_CADENA = new Set([
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "CERT_UNTRUSTED",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
]);

const fechaEnCaracas = (fecha = new Date()) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Caracas" }).format(fecha);

// La primera sincronización siembra solo los últimos tres meses y desde ahí se
// acumula la tasa de cada día hábil. El negocio convierte importes recientes, no
// reconstruye años de historial.
const ventanaDesde = (hoy) => {
  const [anio, mes, dia] = hoy.split("-").map(Number);
  return new Date(Date.UTC(anio, mes - 1 - MESES_DE_HISTORIAL, dia)).toISOString().slice(0, 10);
};

// El BCV publica un archivo por trimestre con una hoja por día de operación.
const indiceTrimestre = (fecha) => {
  const [anio, mes] = fecha.split("-").map(Number);
  return anio * 4 + Math.floor((mes - 1) / 3);
};

const urlDelTrimestre = (indice) => {
  const anio = Math.floor(indice / 4);
  const trimestre = TRIMESTRES[indice % 4];
  return `https://${SITIO}/sites/default/files/EstadisticasGeneral/2_1_2${trimestre}${String(anio).slice(2)}_smc.xls`;
};

const urlTrimestral = (fecha) => urlDelTrimestre(indiceTrimestre(fecha));

// Cada archivo cubre las fechas valor del trimestre y además la del primer día
// hábil siguiente, porque se publica el último día del trimestre. Por eso el
// primer día de la ventana vive en el archivo del trimestre anterior.
function trimestresEnVentana(desde, hoy) {
  const urls = [];
  for (let indice = indiceTrimestre(desde) - 1; indice <= indiceTrimestre(hoy); indice++) {
    urls.push(urlDelTrimestre(indice));
  }
  return urls;
}

function fechaDesdeDmy(texto) {
  const partes = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(texto);
  if (!partes) return null;
  const [, dia, mes, anio] = partes;
  return `${anio}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
}

// Cada hoja es un día: la fila de USD trae la cotización en Bs./M.E. (las dos
// últimas columnas Compra/Venta de la cabecera) y la fecha vigente está en la
// celda "Fecha Valor", la del día hábil siguiente a la operación. Se busca por
// etiqueta y no por posición fija: el rango de la hoja empieza en la columna B y
// los índices del arreglo no coinciden con las columnas.
function parsearTrimestral(archivo) {
  const libro = XLSX.read(archivo, { type: "array" });
  const tasas = [];
  for (const nombre of libro.SheetNames) {
    const filas = XLSX.utils.sheet_to_json(libro.Sheets[nombre], { header: 1 });
    const cabecera = filas.find((fila) => fila.includes("Moneda/País"));
    if (!cabecera) continue;
    const compra = cabecera.lastIndexOf("Compra (BID)");
    const venta = cabecera.lastIndexOf("Venta (ASK)");
    const etiqueta = filas.flat().find((celda) => typeof celda === "string" && celda.startsWith("Fecha Valor:"));
    const dolar = filas.find((fila) => fila.slice(0, 3).some((celda) => String(celda || "").trim() === "USD"));
    if (!etiqueta || !dolar) continue;
    const Fecha = fechaDesdeDmy(etiqueta.slice("Fecha Valor:".length).trim());
    if (!Fecha) continue;
    tasas.push({ Fecha, Compra: dolar[compra], Venta: dolar[venta] });
  }
  return tasas;
}

const plausible = (valor) => Number.isFinite(valor) && valor > 0 && valor < VALOR_MAXIMO;

// Antes de tocar la historia guardada: la fecha tiene que ser una fecha valor
// posible y los importes, bolívares plausibles. Un cambio de formato que desplace
// columnas produce filas fuera de rango, no tasas falsas.
function seleccionarEnVentana(tasas, { desde, hoy }) {
  const limite = new Date(Date.parse(`${hoy}T00:00:00Z`) + MARGEN_DIAS * DIA_MS).toISOString().slice(0, 10);
  const ventana = tasas.filter(({ Fecha }) => Fecha && Fecha >= desde);
  const validas = [];
  let descartadas = 0;
  for (const tasa of ventana) {
    if (tasa.Fecha > limite || !plausible(tasa.Compra) || !plausible(tasa.Venta)) {
      descartadas++;
      continue;
    }
    validas.push(tasa);
  }
  return { validas, descartadas, total: ventana.length };
}

function solicitar(url, opciones = {}, saltos = 3) {
  const { ca, etag, tiempoLimite = TIEMPO_LIMITE_MS } = opciones;
  return new Promise((resolve, reject) => {
    const modulo = url.startsWith("http://") ? http : https;
    const peticion = modulo.get(
      url,
      {
        ca,
        timeout: tiempoLimite,
        headers: etag ? { "If-None-Match": etag } : {},
      },
      (respuesta) => {
        const { location } = respuesta.headers;
        if (respuesta.statusCode >= 300 && respuesta.statusCode < 400 && location && saltos > 0) {
          respuesta.resume();
          resolve(solicitar(new URL(location, url).toString(), opciones, saltos - 1));
          return;
        }
        const trozos = [];
        respuesta.on("data", (trozo) => trozos.push(trozo));
        respuesta.on("error", reject);
        respuesta.on("end", () =>
          resolve({ estado: respuesta.statusCode, cabeceras: respuesta.headers, cuerpo: Buffer.concat(trozos) }),
        );
      },
    );
    peticion.on("timeout", () =>
      peticion.destroy(Object.assign(new Error("El BCV no respondió a tiempo."), { code: "ETIMEDOUT" })),
    );
    peticion.on("error", reject);
  });
}

// OpenSSL entrega el AIA como texto plano: "CA Issuers - URI:http://...".
function destinosAia(certificado) {
  const prefijo = "CA Issuers - URI:";
  return String(certificado.infoAccess || "")
    .split("\n")
    .map((linea) => linea.trim())
    .filter((linea) => linea.startsWith(prefijo))
    .map((linea) => linea.slice(prefijo.length).trim());
}

function firmadoPorRaizConocida(certificado) {
  return tls.rootCertificates.some((pem) => {
    try {
      const raiz = new X509Certificate(pem);
      return certificado.checkIssued(raiz) && certificado.verify(raiz.publicKey);
    } catch {
      return false;
    }
  });
}

// Se lee la hoja del servidor sin validar la cadena: solo para descubrir a quién
// dice que pertenece. Nada de esa conexión se usa como dato de la tasa.
function certificadoDelSitio(tiempoLimite = 20_000) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: SITIO, port: 443, servername: SITIO, rejectUnauthorized: false, timeout: tiempoLimite },
      () => {
        try {
          resolve(new X509Certificate(socket.getPeerCertificate(true).raw));
        } catch (error) {
          reject(error);
        } finally {
          socket.destroy();
        }
      },
    );
    socket.on("timeout", () => socket.destroy(new Error("El BCV no respondió a tiempo.")));
    socket.on("error", reject);
  });
}

// El AIA viaja por HTTP, así que el intermedio solo se acepta si su firma llega
// a una raíz del sistema. Si no se puede comprobar, no se usa.
async function intermediarioDesdeAia() {
  const hoja = await certificadoDelSitio();
  for (const url of destinosAia(hoja)) {
    try {
      const { cuerpo } = await solicitar(url, { tiempoLimite: 20_000 });
      const intermedio = new X509Certificate(cuerpo);
      if (firmadoPorRaizConocida(intermedio)) return intermedio.toString();
    } catch {}
  }
  throw new Error("No se pudo completar la cadena TLS del BCV.");
}

let intermedioResuelto = null;

async function descargar(url, { etag } = {}) {
  const ca = [...tls.rootCertificates, intermedioResuelto || CA_INTERMEDIO];
  try {
    return await solicitar(url, { ca, etag });
  } catch (error) {
    if (intermedioResuelto || !ERRORES_CADENA.has(error.code)) throw error;
    intermedioResuelto = await intermediarioDesdeAia();
    return await solicitar(url, { ca: [...tls.rootCertificates, intermedioResuelto], etag });
  }
}

// El archivo trae el trimestre completo y el BCV puede corregir un valor pasado.
// Se compara contra lo guardado para escribir solo lo nuevo o lo corregido, en
// vez de reescribir el trimestre en cada pasada. La tolerancia absorbe el
// redondeo de DECIMAL(18,8) al releer.
async function cambiosPendientes(connection, tasas) {
  const guardadas = await connection(TABLA).select("Fecha", "Compra", "Venta");
  const porFecha = new Map(guardadas.map((fila) => [fila.Fecha, fila]));
  return tasas.filter(({ Fecha, Compra, Venta }) => {
    const guardada = porFecha.get(Fecha);
    return (
      !guardada ||
      Math.abs(Number(guardada.Compra) - Compra) > MISMA_TASA ||
      Math.abs(Number(guardada.Venta) - Venta) > MISMA_TASA
    );
  });
}

const aTasa = (fila) =>
  fila
    ? { fecha: fila.Fecha, compra: Number(fila.Compra), venta: Number(fila.Venta), actualizado: fila.Actualizado }
    : null;

function crearServicioTasas({
  connection = knex,
  logger = console,
  now = () => new Date(),
  intervaloMs = INTERVALO_MS,
} = {}) {
  let etags = new Map();
  let enCurso = null;
  let temporizador;
  let ultimaSincronizacion = null;
  let ultimoError = null;

  function registrarError(mensaje) {
    if (mensaje === ultimoError) return;
    ultimoError = mensaje;
    logger.error(`Tasas BCV: ${mensaje}`);
  }

  async function sincronizar() {
    if (enCurso) return enCurso;
    enCurso = (async () => {
      try {
        if (!(await connection.schema.hasTable(TABLA))) {
          throw new Error("falta la tabla bcv_tasas; ejecuta `bun run migrate`.");
        }
        const hoy = fechaEnCaracas(now());
        const desde = ventanaDesde(hoy);
        const obligatorio = urlTrimestral(hoy);
        const tasas = new Map();
        const actualizadas = new Map(etags);
        const fallos = [];
        let revisadas = 0;
        for (const url of trimestresEnVentana(desde, hoy)) {
          const nombre = url.split("/").pop();
          try {
            const respuesta = await descargar(url, { etag: etags.get(url) });
            if (respuesta.estado === 304) {
              revisadas++;
              continue;
            }
            if (respuesta.estado !== 200) throw new Error(`el BCV respondió ${respuesta.estado}`);
            actualizadas.set(url, respuesta.cabeceras.etag || null);
            const { validas, descartadas, total } = seleccionarEnVentana(parsearTrimestral(respuesta.cuerpo), {
              desde,
              hoy,
            });
            // Un archivo de borde puede no aportar fechas a la ventana; el del
            // trimestre en curso sí tiene que aportar.
            if (total === 0) {
              if (url === obligatorio) throw new Error(`no trae tasas desde ${desde}`);
              revisadas++;
              continue;
            }
            if (descartadas / total > MAXIMO_DESCARTE) {
              throw new Error(`${descartadas} de ${total} filas fuera de rango; no se guardó nada`);
            }
            if (descartadas > 0) logger.warn(`Tasas BCV (${nombre}): se descartaron ${descartadas} de ${total} filas.`);
            for (const tasa of validas) tasas.set(tasa.Fecha, tasa);
            revisadas++;
          } catch (error) {
            fallos.push(`${nombre}: ${error.message}`);
          }
        }
        etags = actualizadas;
        if (revisadas === 0) throw new Error(fallos.join(" | "));
        if (tasas.size === 0) {
          ultimaSincronizacion = now();
          if (fallos.length) registrarError(fallos.join(" | "));
          else ultimoError = null;
          return { omitido: true, escritas: 0, fallos };
        }
        const actualizado = now();
        const cambios = await cambiosPendientes(connection, [...tasas.values()]);
        for (let inicio = 0; inicio < cambios.length; inicio += LOTE) {
          await connection(TABLA)
            .insert(cambios.slice(inicio, inicio + LOTE).map((tasa) => ({ ...tasa, Actualizado: actualizado })))
            .onConflict("Fecha")
            .merge(["Compra", "Venta", "Actualizado"]);
        }
        ultimaSincronizacion = actualizado;
        if (fallos.length) registrarError(fallos.join(" | "));
        else ultimoError = null;
        return { omitido: false, escritas: cambios.length, fallos };
      } catch (error) {
        registrarError(error.message);
        throw error;
      } finally {
        enCurso = null;
      }
    })();
    return enCurso;
  }

  // "Vigente" es la última fecha valor que ya aplica: el BCV publica por la tarde
  // la tasa del día hábil siguiente, así que la fila más nueva puede ser futura.
  async function estado() {
    const disponible = await connection.schema.hasTable(TABLA);
    const hoy = fechaEnCaracas(now());
    const publicada = disponible ? await connection(TABLA).orderBy("Fecha", "desc").first() : null;
    const vigente = disponible
      ? await connection(TABLA).where("Fecha", "<=", hoy).orderBy("Fecha", "desc").first()
      : null;
    return {
      disponible,
      desde: ventanaDesde(hoy),
      sincronizando: Boolean(enCurso),
      ultimaSincronizacion,
      ultimoError,
      intervaloMinutos: Math.round(intervaloMs / 60_000),
      ultimaTasa: aTasa(vigente),
      publicadaHasta: publicada?.Fecha ?? null,
    };
  }

  function start() {
    if (temporizador) return;
    void sincronizar().catch(() => {});
    temporizador = setInterval(() => void sincronizar().catch(() => {}), intervaloMs);
    temporizador.unref();
  }

  function stop() {
    clearInterval(temporizador);
    temporizador = undefined;
  }

  return { sincronizar, estado, start, stop };
}

const bcvRateService = crearServicioTasas();

module.exports = {
  TABLA,
  urlTrimestral,
  trimestresEnVentana,
  fechaDesdeDmy,
  fechaEnCaracas,
  ventanaDesde,
  parsearTrimestral,
  seleccionarEnVentana,
  descargar,
  intermediarioDesdeAia,
  crearServicioTasas,
  bcvRateService,
};

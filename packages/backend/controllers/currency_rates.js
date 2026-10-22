const knex = require("../database");
const { TABLA, fechaEnCaracas, bcvRateService } = require("../bcv");

const GET_CURRENCY_RATES = async (_req, res) => {
  try {
    const currencyRates = await knex("divisas");

    res.json(currencyRates);
  } catch (error) {
    console.log("Currency Rates Error: ", error);

    res.status(500).json({
      error: {
        message: "Error al obtener las divisas",
      },
    });
  }
};

const FECHA_ISO = /^\d{4}-\d{2}-\d{2}$/;
const DIAS_POR_DEFECTO = 90;
const DIA_MS = 86_400_000;

// `new Date` acepta 2026-09-31 y la corre a octubre: se valida que la fecha
// devuelta coincida con la pedida.
const fechaValida = (valor) => {
  if (typeof valor !== "string" || !FECHA_ISO.test(valor)) return null;
  const fecha = new Date(`${valor}T00:00:00Z`);
  if (Number.isNaN(fecha.getTime())) return null;
  return fecha.toISOString().slice(0, 10) === valor ? valor : null;
};

// La tasa de referencia es la columna de venta del archivo del BCV. La de compra
// se sigue guardando para poder auditar la fuente, pero no se expone.
const responderTasa = (fila) => ({ fecha: fila.Fecha, tasa: Number(fila.Venta) });

// El BCV publica una sola vez por día hábil, así que la ventana por defecto son
// los últimos tres meses: suficiente para una gráfica y sin traer diez años.
const GET_BCV_RATES = async (req, res) => {
  try {
    const desde = fechaValida(req.query.from);
    const hasta = fechaValida(req.query.to);
    if ((req.query.from !== undefined && !desde) || (req.query.to !== undefined && !hasta)) {
      return res.status(400).json({
        error: { message: "Las fechas deben tener el formato AAAA-MM-DD." },
      });
    }

    const fin = hasta || fechaEnCaracas();
    const inicio =
      desde || new Date(Date.parse(`${fin}T00:00:00Z`) - (DIAS_POR_DEFECTO - 1) * DIA_MS).toISOString().slice(0, 10);
    if (inicio > fin) {
      return res.status(400).json({
        error: { message: "La fecha inicial no puede ser posterior a la final." },
      });
    }

    const filas = await knex(TABLA)
      .whereBetween("Fecha", [inicio, fin])
      .orderBy("Fecha", "asc")
      .select("Fecha", "Venta");

    res.json(filas.map(responderTasa));
  } catch (error) {
    console.log("BCV Rates Error: ", error);

    res.status(500).json({
      error: { message: "Error al obtener las tasas del BCV" },
    });
  }
};

// La tasa vigente es la última fecha valor que ya aplica. El BCV publica por la
// tarde la del día hábil siguiente, así que la fila más nueva puede ser futura y
// no es la que el operador espera al pedir "la tasa de hoy".
const GET_BCV_LATEST = async (_req, res) => {
  try {
    const fila = await knex(TABLA).where("Fecha", "<=", fechaEnCaracas()).orderBy("Fecha", "desc").first();
    if (!fila) {
      return res.status(404).json({
        error: { message: "Todavía no hay tasas del BCV registradas" },
      });
    }

    res.json(responderTasa(fila));
  } catch (error) {
    console.log("BCV Latest Error: ", error);

    res.status(500).json({
      error: { message: "Error al obtener la última tasa del BCV" },
    });
  }
};

// La tasa que rige una fecha es la última publicada hasta ese día: el BCV no
// publica sábados, domingos ni feriados. `exacta` distingue el caso para que la
// pantalla pueda decir de dónde salió el número.
const GET_BCV_RATE_BY_DATE = async (req, res) => {
  try {
    const solicitada = fechaValida(req.params.fecha);
    if (!solicitada) {
      return res.status(400).json({
        error: { message: "La fecha debe tener el formato AAAA-MM-DD." },
      });
    }
    const hoy = fechaEnCaracas();
    if (solicitada > hoy) {
      return res.status(400).json({
        error: { message: "Todavía no hay una tasa publicada para una fecha futura." },
      });
    }

    const fila = await knex(TABLA).where("Fecha", "<=", solicitada).orderBy("Fecha", "desc").first();
    if (!fila) {
      return res.status(404).json({
        error: { message: "No hay tasas del BCV anteriores a esa fecha." },
      });
    }

    res.json({ ...responderTasa(fila), solicitada, exacta: fila.Fecha === solicitada });
  } catch (error) {
    console.log("BCV Rate Error: ", error);

    res.status(500).json({
      error: { message: "Error al obtener la tasa del BCV de esa fecha" },
    });
  }
};

const GET_BCV_STATUS = async (_req, res) => {
  try {
    res.json(await bcvRateService.estado());
  } catch (error) {
    console.log("BCV Status Error: ", error);

    res.status(500).json({
      error: { message: "Error al consultar el estado de las tasas del BCV" },
    });
  }
};

// Descarga bajo demanda para que el operador no tenga que esperar el ciclo de
// treinta minutos cuando la tasa del día todavía no está en la tabla.
const POST_BCV_SYNC = async (_req, res) => {
  try {
    res.json(await bcvRateService.sincronizar());
  } catch (error) {
    console.log("BCV Sync Error: ", error);

    res.status(503).json({
      error: { message: `No se pudo consultar el BCV: ${error.message}` },
    });
  }
};

module.exports = {
  GET_CURRENCY_RATES,
  GET_BCV_RATES,
  GET_BCV_LATEST,
  GET_BCV_RATE_BY_DATE,
  GET_BCV_STATUS,
  POST_BCV_SYNC,
};

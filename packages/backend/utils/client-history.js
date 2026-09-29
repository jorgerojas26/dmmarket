const knex = require("../database");

// MAX is not affected by multiple lines per invoice. LEFT JOIN preserves the
// last date of empty invoices, while their sales still contribute zero.
const buildClientHistoryQuery = ({ masterTable, slaveTable, idInvoice, clientIds, to }) =>
  knex(`${masterTable} as mh`)
    .leftJoin(`${slaveTable} as sh`, `sh.${idInvoice}`, `mh.${idInvoice}`)
    .select("mh.IdCliente")
    .select(knex.raw("MAX(mh.Fecha) as last_factura"))
    .select(knex.raw("DATEDIFF(?, MAX(mh.Fecha)) as dias_inactivo", [to]))
    .select(knex.raw("COALESCE(ROUND(SUM(sh.Precio * sh.Cantidad), 2), 0) as revenue_historico"))
    .whereIn("mh.IdCliente", clientIds)
    .andWhere("mh.Anulada", 0)
    .groupBy("mh.IdCliente");

module.exports = { buildClientHistoryQuery };

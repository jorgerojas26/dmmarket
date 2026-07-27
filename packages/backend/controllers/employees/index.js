const knex = require("../../database");
const fs = require("fs");

const GET_EMPLOYEES = async (req, res) => {
  try {
    const response = await knex
      .select(
        "idVend as id",
        "Empresa as name",
        "Rif as rif",
        "Ci as ci",
        "Telfs as phone"
      )
      .from("vendedores");
    res.status(200).json(response);
  } catch (error) {
    console.log(error);
  }
};

const GET_COMMISSION_INFO = async (req, res) => {
  const { employeeId } = req.params;

  try {
    const response = await knex
      .select(
        "grupos.IdGrupo as groupId",
        "grupos.Descripcion as group",
        "vendedor_comisiones.comision as commission"
      )
      .from("grupos")
      .leftJoin("vendedor_comisiones", function () {
        this.on("vendedor_comisiones.grupoId", "grupos.IdGrupo").andOn(
          "vendedor_comisiones.vendedorId",
          Number(employeeId)
        );
      });
    res.status(200).json(response);
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      FALLBACK_CREATE_TABLE(() => {
        GET_COMMISSION_INFO(req, res);
      });
    } else {
      res.status(400).json({ success: false });
    }
    console.log(error.code);
  }
};

const UPDATE_COMMISSION_INFO = async (req, res) => {
  const { employeeId } = req.params;
  const { commissionInfo } = req.body;

  if (!commissionInfo || Object.keys(commissionInfo).length === 0) {
    res
      .status(400)
      .json({ error: { message: "Debe enviar la información comisiones" } });
    return;
  }

  try {
    for (const [key, value] of Object.entries(commissionInfo)) {
      const commission = await knex("vendedor_comisiones")
        .where("grupoId", key)
        .andWhere("vendedorId", employeeId);
      console.log("checking if commissionInfo exists in database", commission);
      if (commission.length) {
        console.log("yes, commission info exists!!!!!", value, key);
        await knex("vendedor_comisiones")
          .where("grupoId", key)
          .andWhere("vendedorId", employeeId)
          .update({ comision: value })
          .debug();
      } else {
        await knex("vendedor_comisiones").insert({
          vendedorId: employeeId,
          grupoId: key,
          comision: value,
        });
      }
    }
    res.status(201).json({ success: true });
  } catch (error) {
    console.log(error);
  }
};

const GET_SALES = async (req, res) => {
  const { from, to } = req.query;
  const { employeeId } = req.params;
  const { masterTable, slaveTable, idInvoice } = req.locals.showNoe;

  try {
    const response = await knex
      .select(
        `${masterTable}.${idInvoice} as invoiceId`,
        `${masterTable}.Nombre as client`,
        `${masterTable}.Rif as rif`,
        `${masterTable}.Fecha as createdAt`,
        knex.raw(
          `ROUND(SUM(${slaveTable}.Precio * ${slaveTable}.Cantidad), 2) as invoiceTotal`
        ),
        knex.raw(
          `ROUND(SUM(CASE WHEN ISNULL(fact_vendedor_comisiones.comision) 
                THEN 0 
                ELSE ${slaveTable}.Precio * ${slaveTable}.Cantidad * (fact_vendedor_comisiones.comision / 100)
                END
              ), 2) as commissionTotal`
        )
      )
      .from(`${masterTable}`)
      .innerJoin(
        `${slaveTable}`,
        `${slaveTable}.${idInvoice}`,
        `${masterTable}.${idInvoice}`
      )
      .innerJoin(
        "productos",
        "productos.IdProducto",
        `${slaveTable}.IdProducto`
      )
      .leftJoin("fact_vendedor_comisiones", function () {
        this.on("fact_vendedor_comisiones.grupoId", "productos.Grupo").andOn(
          "fact_vendedor_comisiones.masterfactId",
          `${masterTable}.${idInvoice}`
        );
      })
      .whereBetween(`${masterTable}.Fecha`, [from, to])
      .andWhere(`${masterTable}.IdVend`, employeeId)
      .andWhere(`${masterTable}.Anulada`, 0)
      .groupBy(`${masterTable}.${idInvoice}`)
      .orderBy(`${masterTable}.Fecha`, "DESC");
    res.status(200).json(response);
  } catch (error) {
    if (error.code === "ER_NO_SUCH_TABLE") {
      FALLBACK_CREATE_TABLE(() => {
        GET_SALES(req, res);
      });
    }
    console.error(error);
  }
};

const FALLBACK_CREATE_TABLE = async (recursive_callback) => {
  const migration = fs
    .readFileSync(
      "./controllers/employees/create-table-vendedor-comisiones.sql",
      "utf8"
    )
    .toString();
  await knex.raw(migration);
  recursive_callback();
};

module.exports = {
  GET_EMPLOYEES,
  GET_COMMISSION_INFO,
  UPDATE_COMMISSION_INFO,
  GET_SALES,
};

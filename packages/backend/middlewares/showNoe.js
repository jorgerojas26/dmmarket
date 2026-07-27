const showNoe = (req, res, next) => {
  const { showNoe } = req.query;

  const masterTable = showNoe === "true" ? "masternoe" : "masterfact";
  const slaveTable = showNoe === "true" ? "slavenoe" : "slavefact";
  const idInvoice = showNoe === "true" ? "IdNoe" : "IdFactura";

  const data = {
    masterTable,
    slaveTable,
    idInvoice,
  };

  console.log(data);

  req.locals = req.locals || {};
  req.locals.showNoe = data;

  next();
};

module.exports = showNoe;

require("dotenv").config();
const express = require("express");
const path = require("node:path");
const app = express();

const clients_routes = require("./routes/clients");
const groups_routes = require("./routes/groups");
const invoices_routes = require("./routes/invoices");
const products_routes = require("./routes/products");
const employees_routes = require("./routes/employees");
const currency_rates_routes = require("./routes/currency_rates");
const providers_routes = require("./routes/providers");
const dashboard_routes = require("./routes/dashboard");
const sales_routes = require("./routes/sales");

//app.use(express.static(path.join(__dirname, "public")));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api/clients", clients_routes);
app.use("/api/groups", groups_routes);
app.use("/api/invoices", invoices_routes);
app.use("/api/products", products_routes);
app.use("/api/employees", employees_routes);
app.use("/api/currency_rates", currency_rates_routes);
app.use("/api/providers", providers_routes);
app.use("/api/dashboard", dashboard_routes);
app.use("/api/sales", sales_routes);

app.use("/api/*", (req, res) => {
  res.status(404).json({
    error: {
      message: `El servidor no encontró ningún recurso en la URL ${req.baseUrl}`,
    },
  });
});

app.use(express.static(path.join(__dirname, "client/build")));

app.get("/*", (_request, response) => {
  response.sendFile(path.resolve(__dirname, "client/build", "index.html"));
});

if (require.main === module) {
  app.listen(8000, () => {
    console.log("server listening in port 8000");
  });
}

module.exports = app;

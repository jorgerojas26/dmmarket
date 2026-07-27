import { useState, useEffect, useMemo } from "react";
import { fetchInvoiceList } from "api/invoice";
import InvoicesTable from "components/InvoicesTable";
import ProductsTable from "components/ProductsTable";

const InvoicesView = ({ dateRange, showNoe, isActive }) => {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedRows, setSelectedRows] = useState([]);

  useEffect(() => {
    if (!isActive) return;
    setLoading(true);
    fetchInvoiceList({ from: dateRange.from, to: dateRange.to, showNoe })
      .then(setInvoices)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [dateRange.from, dateRange.to, showNoe, isActive]);

  const productsSummary = useMemo(() => {
    if (!selectedRows.length) return [];
    const products = {};
    selectedRows.forEach((row) => {
      row.products.forEach((product) => {
        if (!products[product.productId]) {
          products[product.productId] = { ...product, quantity: 0 };
        }
        products[product.productId].quantity += product.quantity;
        products[product.productId].total = Number(
          (
            products[product.productId].quantity * products[product.productId].price
          ).toFixed(2)
        );
      });
    });
    return Object.values(products);
  }, [selectedRows]);

  const invoicesTotalSummary = useMemo(
    () => selectedRows.reduce((total, inv) => total + (inv?.total || 0), 0),
    [selectedRows]
  );

  return (
    <div className="row g-3">
      <div className="col-12 col-xl-6">
        <InvoicesTable
          data={invoices}
          loading={loading}
          onRowSelect={setSelectedRows}
        />
      </div>
      <div className="col-12 col-xl-6">
        <ProductsTable
          data={productsSummary}
          totalSummary={invoicesTotalSummary}
        />
      </div>
    </div>
  );
};

export default InvoicesView;

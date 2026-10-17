import { fetchInvoiceDetail } from 'api/invoice';
import SaleDetailModal from 'components/ProviderDashboardModal/SaleDetailModal';
import { useEffect, useState } from 'react';

const InvoiceDetailModal = ({ invoiceId, onClose, showNoe = false, collapseProfit = true }) => {
    const [attempt, setAttempt] = useState(0);
    const [result, setResult] = useState({});

    useEffect(() => {
        let active = true;
        setResult({ invoiceId });

        const load = async () => {
            try {
                const sale = await fetchInvoiceDetail(invoiceId, showNoe);
                if (!sale || sale.error || !Array.isArray(sale.productos)) {
                    throw new Error('La respuesta del detalle de factura no es válida.');
                }
                if (active) setResult({ invoiceId, sale });
            } catch (error) {
                if (active) setResult({ invoiceId, error: error || new Error('No se pudo cargar la factura.') });
            }
        };
        load();

        return () => {
            active = false;
        };
    }, [invoiceId, showNoe, attempt]);

    const current = result.invoiceId === invoiceId ? result : {};
    return (
        <SaleDetailModal
            show
            onClose={onClose}
            documentLabel={showNoe ? 'Nota de entrega' : 'Factura'}
            collapseProfit={collapseProfit}
            invoiceId={invoiceId}
            sale={current.sale}
            error={current.error}
            onRetry={() => setAttempt((value) => value + 1)}
        />
    );
};

export default InvoiceDetailModal;

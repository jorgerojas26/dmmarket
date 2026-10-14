import { fetchInvoiceDetail } from 'api/invoice';
import SaleDetailModal from 'components/ProviderDashboardModal/SaleDetailModal';
import { useEffect, useState } from 'react';

const InvoiceDetailModal = ({ invoiceId, onClose }) => {
    const [attempt, setAttempt] = useState(0);
    const [result, setResult] = useState({});

    useEffect(() => {
        let active = true;
        setResult({ invoiceId });

        const load = async () => {
            try {
                // CxC siempre consulta FAC, independientemente del selector global de Noe.
                const sale = await fetchInvoiceDetail(invoiceId, false);
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
    }, [invoiceId, attempt]);

    const current = result.invoiceId === invoiceId ? result : {};
    return (
        <SaleDetailModal
            show
            onClose={onClose}
            documentLabel="Factura"
            collapseProfit
            invoiceId={invoiceId}
            sale={current.sale}
            error={current.error}
            onRetry={() => setAttempt((value) => value + 1)}
        />
    );
};

export default InvoiceDetailModal;

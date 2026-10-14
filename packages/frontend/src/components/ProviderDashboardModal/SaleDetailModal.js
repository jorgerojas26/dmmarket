import DocumentDetailModal from 'components/DocumentDetailModal';

const SaleDetailModal = ({
    show,
    onClose,
    sale,
    documentLabel = 'Venta',
    invoiceId,
    error,
    onRetry,
    collapseProfit = false,
}) => (
    <DocumentDetailModal
        show={show}
        onClose={onClose}
        record={sale}
        documentLabel={documentLabel}
        invoiceId={invoiceId}
        subtitle={sale?.vendedor}
        showProfit
        collapseProfit={collapseProfit}
        error={error}
        onRetry={onRetry}
    />
);

export default SaleDetailModal;

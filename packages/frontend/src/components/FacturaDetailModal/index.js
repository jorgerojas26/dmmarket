import DocumentDetailModal from 'components/DocumentDetailModal';

const FacturaDetailModal = ({ show, onClose, invoice }) => (
    <DocumentDetailModal show={show} onClose={onClose} record={invoice} subtitle={invoice?.cliente} showProfit />
);

export default FacturaDetailModal;

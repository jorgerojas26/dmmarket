import DocumentDetailModal from 'components/DocumentDetailModal';

const PurchaseDetailModal = ({ show, onClose, purchase }) => (
    <DocumentDetailModal show={show} onClose={onClose} record={purchase} />
);

export default PurchaseDetailModal;

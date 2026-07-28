import { Modal, Spinner } from 'react-bootstrap';
import { DateTime } from 'luxon';
import Table from 'components/Table';

const formatCurrency = (value) => {
  const num = Number(value);
  if (isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const PurchaseDetailModal = ({ show, onClose, purchase }) => {
  const loading = !purchase;

  return (
    <Modal show={show} size='md' onHide={onClose} backdrop='static' centered className='provider-dashboard-modal purchase-detail-modal'>
      <Modal.Header closeButton>
        <div className='d-flex align-items-center gap-3'>
          <div className='provider-avatar'>F</div>
          <div>
            <Modal.Title>
              {purchase ? `Factura #${purchase.idFactura}` : 'Cargando...'}
            </Modal.Title>
            <div className='provider-modal-subtitle'>
              {purchase
                ? DateTime.fromISO(purchase.fecha).toFormat('dd MMM yyyy', { locale: 'es' })
                : ''}
            </div>
          </div>
        </div>
      </Modal.Header>
      <Modal.Body>
        {loading ? (
          <div className='d-flex justify-content-center align-items-center' style={{ minHeight: 150 }}>
            <Spinner animation='border' variant='light' />
          </div>
        ) : purchase.productos && purchase.productos.length > 0 ? (
          <>
            <div className='provider-table-container'>
              <Table
                data={purchase.productos}
                columns={[
                  { Header: 'Descripción', accessor: 'descripcion' },
                  { Header: 'Cantidad', accessor: 'cantidad', Cell: ({ value }) => Number(value).toLocaleString('en-US') },
                  { Header: 'Precio', accessor: 'precio', Cell: ({ value }) => formatCurrency(value) },
                  { Header: 'Subtotal', accessor: 'subtotal', Cell: ({ value }) => formatCurrency(value) },
                ]}
                className='provider-table'
                maxHeight={null}
                emptyMessage='Sin productos en esta factura'
              />
            </div>
            <div className='purchase-total-row'>
              <span>Total</span>
              <span className='purchase-total-amount'>{formatCurrency(purchase.total)}</span>
            </div>
          </>
        ) : (
          <div className='provider-empty-state'>
            <span>Sin productos en esta factura</span>
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default PurchaseDetailModal;

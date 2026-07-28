import { Modal, Spinner } from 'react-bootstrap';
import { DateTime } from 'luxon';
import Table from 'components/Table';

const formatCurrency = (value) => {
  const num = Number(value);
  if (isNaN(num)) return '$0.00';
  return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const SaleDetailModal = ({ show, onClose, sale }) => {
  const loading = !sale;

  return (
    <Modal show={show} size='md' onHide={onClose} backdrop='static' centered className='provider-dashboard-modal purchase-detail-modal'>
      <Modal.Header closeButton>
        <div className='d-flex align-items-center gap-3'>
          <div className='provider-avatar'>V</div>
          <div>
            <Modal.Title>
              {sale ? `Venta #${sale.idFactura}` : 'Cargando...'}
            </Modal.Title>
            <div className='provider-modal-subtitle'>
              {sale
                ? `${DateTime.fromISO(sale.fecha).toFormat('dd MMM yyyy', { locale: 'es' })} — ${sale.vendedor || ''}`
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
        ) : sale.productos && sale.productos.length > 0 ? (
          <>
            <div className='provider-table-container'>
              <Table
                data={sale.productos}
                columns={[
                  { Header: 'Descripción', accessor: 'descripcion' },
                  { Header: 'Cantidad', accessor: 'cantidad', Cell: ({ value }) => Number(value).toLocaleString('en-US') },
                  { Header: 'Precio', accessor: 'precio', Cell: ({ value }) => formatCurrency(value) },
                  { Header: 'Subtotal', accessor: 'subtotal', Cell: ({ value }) => formatCurrency(value) },
                ]}
                className='provider-table'
                maxHeight={null}
                emptyMessage='Sin productos en esta venta'
              />
            </div>
            <div className='purchase-total-row'>
              <span>Total</span>
              <span className='purchase-total-amount'>{formatCurrency(sale.total)}</span>
            </div>
          </>
        ) : (
          <div className='provider-empty-state'>
            <span>Sin productos en esta venta</span>
          </div>
        )}
      </Modal.Body>
    </Modal>
  );
};

export default SaleDetailModal;

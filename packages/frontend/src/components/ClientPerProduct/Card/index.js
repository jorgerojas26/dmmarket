import ClientPerProductTable from 'components/ClientPerProduct/Table';
import ProductSearch from 'components/ProductSearch';
import { ShowNoeContext } from 'context/show_noe';
import { useBestClientsPerProduct } from 'hooks/useClients';
import { DateTime } from 'luxon';
import { useContext, useState } from 'react';

const ClientPerProductCard = ({ dateRange }) => {
    const [selectedProduct, setSelectedProduct] = useState(null);
    const { showNoe } = useContext(ShowNoeContext);

    const { data: response = [], isLoading } = useBestClientsPerProduct(
        selectedProduct?.IdProducto,
        dateRange,
        showNoe,
        !!selectedProduct && !!dateRange?.from && !!dateRange?.to,
    );

    const data = Array.isArray(response) ? response : [];

    return (
        <div className="card h-100">
            <div className="card-header">
                <h3>Cliente por producto</h3>
                <div style={{ display: 'flex', flexDirection: 'row', gap: '5px' }}>
                    <small>Desde: </small>
                    <small>{DateTime.fromISO(dateRange.from).toLocaleString()} </small>
                    <small>Hasta: </small>
                    <small>{DateTime.fromISO(dateRange.to).toLocaleString()} </small>
                </div>
            </div>
            <div className="card-body">
                <div
                    style={{
                        display: 'flex',
                        flex: '1',
                        justifyContent: 'space-between',
                    }}
                >
                    <div style={{ width: '100%' }}>
                        <ProductSearch onSelect={setSelectedProduct} />
                    </div>
                </div>
                <ClientPerProductTable data={data} loading={isLoading} />
            </div>
        </div>
    );
};

export default ClientPerProductCard;

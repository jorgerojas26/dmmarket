import { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { ShowNoeContext } from 'context/show_noe';
import { fetchClientsList } from 'api/clients';
import Table from 'components/Table';

const LIMIT = 20;

const ClientsTable = ({ onRowSelect }) => {
  const { showNoe } = useContext(ShowNoeContext);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchClientsList({ search, page, limit: LIMIT, showNoe });
      setData(result.data || []);
      setTotal(result.total || 0);
    } catch (err) {
      console.error(err);
      setData([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [search, page, showNoe]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalPages = Math.ceil(total / LIMIT);

  const columns = useMemo(() => [
    { Header: 'IdCliente', accessor: 'IdCliente' },
    { Header: 'Empresa', accessor: 'Empresa' },
    { Header: 'Total Ventas', accessor: 'total_ventas', Cell: ({ value }) => `$${Number(value).toFixed(2)}` },
    { Header: '# Ventas', accessor: 'num_ventas' },
  ], []);

  return (
    <div className='card'>
      <div className='card-header'>
        <h3>Clientes</h3>
        <input
          className='input-filter'
          placeholder='Buscar por empresa...'
          type='search'
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
        />
      </div>
      <div className='card-body' style={{ position: 'relative', minHeight: 200 }}>
        <Table
          data={data}
          columns={columns}
          loading={loading}
          onRowSelect={onRowSelect}
          emptyMessage='Sin datos'
        />
        {totalPages > 1 && (
          <div className='d-flex justify-content-center align-items-center gap-3 p-2 border-top'>
            <button
              className='btn btn-sm btn-outline-secondary'
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </button>
            <span>
              Página {page} de {totalPages}
            </span>
            <button
              className='btn btn-sm btn-outline-secondary'
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientsTable;

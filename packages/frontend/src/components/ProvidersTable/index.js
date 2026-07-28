import { useState, useEffect, useContext, useCallback, useMemo } from 'react';
import { ShowNoeContext } from 'context/show_noe';
import { fetchProvidersList } from 'api/providers';
import Table from 'components/Table';
import './styles.css';

const LIMIT = 20;

const ProvidersTable = ({ onRowSelect }) => {
  const { showNoe } = useContext(ShowNoeContext);
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchProvidersList({ search, page, limit: LIMIT, showNoe });
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

  const handleSearch = useCallback((term) => {
    setSearch(term);
    setPage(1);
  }, []);

  const totalPages = Math.ceil(total / LIMIT);

  const columns = useMemo(() => [
    { Header: 'IdProveedor', accessor: 'IdProveedor' },
    { Header: 'Empresa', accessor: 'Empresa' },
    { Header: 'Total Compras', accessor: 'total_compras', Cell: ({ value }) => `$${Number(value).toFixed(2)}` },
    { Header: '# Compras', accessor: 'num_compras' },
    { Header: 'Total Ventas', accessor: 'total_ventas', Cell: ({ value }) => `$${Number(value).toFixed(2)}` },
    { Header: '# Ventas', accessor: 'num_ventas' },
  ], []);

  return (
    <section className='providers-table-panel'>
      <header className='providers-table__header'>
        <h3>Proveedores</h3>
      </header>
      <div className='providers-table__body'>
        <Table
          data={data}
          columns={columns}
          loading={loading}
          onRowSelect={onRowSelect}
          className='providers-table'
          emptyMessage='Sin datos'
          maxHeight={620}
          search={{
            enabled: true,
            placeholder: 'Buscar por empresa...',
            onSearch: handleSearch,
          }}
          pagination={{
            enabled: true,
            page,
            totalPages,
            totalRows: total,
            pageSize: LIMIT,
            onPageChange: setPage,
          }}
        />
      </div>
    </section>
  );
};

export default ProvidersTable;

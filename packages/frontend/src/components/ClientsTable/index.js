import { fetchClientsList } from "api/clients";
import Table from "components/Table";
import { ShowNoeContext } from "context/show_noe";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

const LIMIT = 20;

const ClientsTable = ({ onRowSelect }) => {
    const { showNoe } = useContext(ShowNoeContext);
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const result = await fetchClientsList({
                search,
                page,
                limit: LIMIT,
                showNoe,
            });
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

    const columns = useMemo(
        () => [
            { Header: "IdCliente", accessor: "IdCliente" },
            { Header: "Empresa", accessor: "Empresa" },
            {
                Header: "Total Ventas",
                accessor: "total_ventas",
                Cell: ({ value }) => `$${Number(value).toFixed(2)}`,
            },
            { Header: "# Ventas", accessor: "num_ventas" },
        ],
        [],
    );

    return (
        <div className="card">
            <div className="card-header">
                <h3>Clientes</h3>
            </div>
            <div
                className="card-body"
                style={{ position: "relative", minHeight: 200 }}
            >
                <Table
                    data={data}
                    columns={columns}
                    loading={loading}
                    onRowSelect={onRowSelect}
                    emptyMessage="Sin datos"
                    search={{
                        enabled: true,
                        placeholder: "Buscar por empresa...",
                        onSearch: handleSearch,
                    }}
                    pagination={{
                        enabled: true,
                        page,
                        totalPages,
                        onPageChange: setPage,
                    }}
                    maxHeight={700}
                />
            </div>
        </div>
    );
};

export default ClientsTable;

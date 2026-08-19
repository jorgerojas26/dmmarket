import GroupSearch from 'components/GroupSearch';
import InventoryTable from 'components/InventoryTable';
import ProveedorSearch from 'components/ProveedorSearch';
import Sidebar from 'components/Sidebar';
import { useMemo, useState } from 'react';
import Container from 'react-bootstrap/Container';

const InventarioPage = () => {
    const [activeView, setActiveView] = useState('inventory');
    const [selectedGroup, setSelectedGroup] = useState(null);
    const [selectedProvider, setSelectedProvider] = useState(null);

    const sidebarItems = useMemo(
        () => [
            {
                eventKey: 'inventory',
                label: 'Desglose',
                icon: (
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <title>Desglose</title>
                        <line x1="8" y1="6" x2="21" y2="6" />
                        <line x1="8" y1="12" x2="21" y2="12" />
                        <line x1="8" y1="18" x2="21" y2="18" />
                        <line x1="3" y1="6" x2="3.01" y2="6" />
                        <line x1="3" y1="12" x2="3.01" y2="12" />
                        <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                ),
            },
        ],
        [],
    );

    return (
        <Container fluid className="clientes-layout p-0">
            <div className="clientes-row">
                <Sidebar activeKey={activeView} onSelect={setActiveView} items={sidebarItems} />
                <div className="clientes-content p-4" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="clients-content-wrapper d-flex flex-column flex-sm-row justify-content-between align-items-start align-items-sm-center gap-3 mb-3">
                        <h4 className="m-0 text-light">Inventario</h4>
                        <div className="d-flex flex-column flex-md-row gap-3" style={{ minWidth: 320 }}>
                            <div className="d-flex align-items-center gap-2">
                                <span className="text-light">Categoría</span>
                                <GroupSearch onSelect={setSelectedGroup} />
                            </div>
                            <div className="d-flex align-items-center gap-2">
                                <span className="text-light">Proveedor</span>
                                <ProveedorSearch onSelect={setSelectedProvider} />
                            </div>
                        </div>
                    </div>
                    {/* La tabla ocupa exactamente el alto restante (como DespachoView):
                        el wrapper flex:1 fija la altura y la Card h-100 + Table fillHeight
                        scrollean internamente, sin scrollbar vertical del padre. */}
                    <div
                        className="clients-content-wrapper"
                        style={{ flex: '1 1 auto', minHeight: 0, display: 'flex' }}
                    >
                        <InventoryTable
                            categoryId={selectedGroup?.groupId}
                            proveedorId={selectedProvider?.IdProveedor}
                        />
                    </div>
                </div>
            </div>
        </Container>
    );
};

export default InventarioPage;

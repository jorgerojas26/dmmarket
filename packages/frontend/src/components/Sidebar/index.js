import { useSidebar } from 'context/sidebar';
import Nav from 'react-bootstrap/Nav';

const ChevronLeft = (
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
        <polyline points="15 18 9 12 15 6" />
    </svg>
);

const Sidebar = ({ activeKey, onSelect, items }) => {
    const { collapsed, toggleCollapsed } = useSidebar();

    return (
        <div className={`clients-sidebar mb-3 mb-md-0${collapsed ? ' collapsed' : ''}`}>
            <button
                type="button"
                className="sidebar-collapse-btn"
                onClick={toggleCollapsed}
                aria-label={collapsed ? 'Expandir sidebar' : 'Colapsar sidebar'}
                aria-expanded={!collapsed}
            >
                {ChevronLeft}
            </button>
            <Nav variant="pills" className="flex-row flex-md-column" activeKey={activeKey} onSelect={onSelect}>
                {items.map(({ eventKey, label, icon }) => (
                    <Nav.Item key={eventKey}>
                        <Nav.Link eventKey={eventKey} title={collapsed ? label : undefined}>
                            <span className="nav-icon">{icon}</span>
                            <span className="nav-label">{label}</span>
                        </Nav.Link>
                    </Nav.Item>
                ))}
            </Nav>
        </div>
    );
};

export default Sidebar;

import Nav from 'react-bootstrap/Nav';

const Sidebar = ({ activeKey, onSelect, items }) => (
    <div className="clients-sidebar mb-3 mb-md-0">
        <Nav variant="pills" className="flex-row flex-md-column" activeKey={activeKey} onSelect={onSelect}>
            {items.map(({ eventKey, label, icon }) => (
                <Nav.Item key={eventKey}>
                    <Nav.Link eventKey={eventKey}>
                        <span className="nav-icon">{icon}</span>
                        {label}
                    </Nav.Link>
                </Nav.Item>
            ))}
        </Nav>
    </div>
);

export default Sidebar;

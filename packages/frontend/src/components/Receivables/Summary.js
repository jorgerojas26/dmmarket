import Spinner from 'react-bootstrap/Spinner';
import { money } from './format';

export default function Summary({ summary, portfolio = false, loading = false }) {
    const cards = [
        { label: 'Saldo pendiente', value: summary ? money(summary.balance) : '—', tone: 'primary' },
        { label: 'Saldo vencido', value: summary ? money(summary.overdue) : '—', tone: 'warning' },
        {
            label: portfolio ? 'Clientes con deuda' : 'Facturas pendientes',
            value: summary ? (portfolio ? summary.debtors : summary.pendingCount) : '—',
        },
    ];
    if (portfolio) {
        cards.push({
            label: 'Dinero recibido este mes',
            value: summary ? money(summary.received) : '—',
            tone: 'success',
        });
    }
    return (
        <dl className={`cxc-stats${portfolio ? ' cxc-stats-four' : ''}`} aria-busy={loading}>
            {cards.map((card) => (
                <div key={card.label} className={`cxc-stat cxc-stat-${card.tone || 'neutral'}`}>
                    <dt>{card.label}</dt>
                    <dd>
                        {card.value}
                        {loading && (
                            <span className="cxc-stat-loading">
                                <Spinner animation="border" size="sm" variant="light" aria-hidden="true" />
                                <span className="visually-hidden">Actualizando {card.label}</span>
                            </span>
                        )}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

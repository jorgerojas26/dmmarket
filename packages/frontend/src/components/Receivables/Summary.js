import { money } from './format';

export default function Summary({ summary, portfolio = false }) {
    const cards = [
        { label: 'Saldo pendiente', value: money(summary.balance), tone: 'primary' },
        { label: 'Saldo vencido', value: money(summary.overdue), tone: 'warning' },
        {
            label: portfolio ? 'Clientes con deuda' : 'Facturas pendientes',
            value: portfolio ? summary.debtors : summary.pendingCount,
        },
    ];
    if (portfolio) cards.push({ label: 'Dinero recibido este mes', value: money(summary.received), tone: 'success' });
    return (
        <dl className={`cxc-stats${portfolio ? ' cxc-stats-four' : ''}`}>
            {cards.map((card) => (
                <div key={card.label} className={`cxc-stat cxc-stat-${card.tone || 'neutral'}`}>
                    <dt>{card.label}</dt>
                    <dd>{card.value}</dd>
                </div>
            ))}
        </dl>
    );
}

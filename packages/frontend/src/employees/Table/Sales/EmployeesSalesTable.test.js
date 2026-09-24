import { render, screen, within } from '@testing-library/react';
import EmployeesSalesTable from './EmployeesSalesTable';

describe('EmployeesSalesTable', () => {
    it('shows per-invoice utility and its total', () => {
        const { container } = render(
            <EmployeesSalesTable
                data={[
                    { invoiceId: 1, client: 'Cliente A', invoiceTotal: 50, utilidad: 10.5, commissionTotal: 2 },
                    { invoiceId: 2, client: 'Cliente B', invoiceTotal: 25, utilidad: 2.25, commissionTotal: 1 },
                ]}
            />,
        );

        expect(screen.getByText('Utilidad')).toBeInTheDocument();
        const footer = container.querySelector('tfoot');
        expect(footer).not.toBeNull();
        expect(within(footer).getByText(`$${(12.75).toLocaleString()}`)).toBeInTheDocument();
    });
});

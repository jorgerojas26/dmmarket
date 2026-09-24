import { render, screen, within } from '@testing-library/react';
import ClientPerProductTable from './index';

describe('ClientPerProductTable', () => {
    it('shows a total for the utility column', () => {
        const { container } = render(
            <ClientPerProductTable
                data={[
                    { client: 'Cliente A', quantity_total: 2, total_USD: 10, utilidad: 3.5 },
                    { client: 'Cliente B', quantity_total: 1, total_USD: 5, utilidad: 4.25 },
                ]}
            />,
        );

        expect(screen.getByText('Utilidad')).toBeInTheDocument();
        const footer = container.querySelector('tfoot');
        expect(footer).not.toBeNull();
        expect(within(footer).getByText('$7,75')).toBeInTheDocument();
    });
});

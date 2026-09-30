import { ResponsivePie } from '@nivo/pie';
import { fireEvent, render, screen, within } from '@testing-library/react';
import GroupPurchases from './index';

jest.mock('@nivo/pie', () => ({ ResponsivePie: jest.fn(() => <div data-testid="pie" />) }));

const chartData = [
    { id: 'A', label: 'Categoría con nombre largo', value: 100 },
    { id: 'B', label: 'Otra categoría', value: 50 },
];

beforeEach(() => ResponsivePie.mockImplementation(() => <div data-testid="pie" />));

it('uses a compact legend and preserves all category values in the chart', () => {
    render(<GroupPurchases chartData={chartData} compact />);
    const props = ResponsivePie.mock.calls[0][0];
    expect(props.enableArcLabels).toBe(false);
    expect(props.enableArcLinkLabels).toBe(false);
    expect(props.animate).toBe(false);
    expect(props.data.map(({ color, ...item }) => item)).toEqual(chartData);
    expect(new Set(props.data.map((item) => item.color)).size).toBe(2);
    expect(props.colors({ data: props.data[0] })).toBe(props.data[0].color);
    expect(screen.getByRole('list', { name: 'Categorías de compras' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText(chartData[0].label).closest('li').title).toContain(chartData[0].label);
});

it('highlights leading categories and exposes the complete breakdown', () => {
    const manyCategories = [2, 3, 5, 10, 20, 60].map((value, index) => ({
        id: `C${index}`,
        label: `Categoría ${index}`,
        value,
    }));
    render(<GroupPurchases chartData={manyCategories} compact />);
    const props = ResponsivePie.mock.calls[0][0];
    expect(props.data).toHaveLength(6);
    expect(props.data[0].value).toBe(60);
    const legend = screen.getByRole('list', { name: 'Categorías de compras' });
    expect(within(legend).getAllByRole('listitem')).toHaveLength(5);
    expect(within(legend).getByText('Otras 2 categorías')).toBeInTheDocument();
    expect(within(legend).getByText('60.0%')).toBeInTheDocument();
    expect(within(legend).getAllByText('5.0%')).toHaveLength(2);

    fireEvent.click(screen.getByRole('button', { name: 'Ver las 6 categorías' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getAllByRole('listitem')).toHaveLength(6);
    expect(within(dialog).getByText('Categoría 0')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
});

it('preserves the original chart when compact mode is not requested', () => {
    render(<GroupPurchases chartData={chartData} />);
    const props = ResponsivePie.mock.calls[0][0];
    expect(props.enableArcLabels).toBe(true);
    expect(props.enableArcLinkLabels).toBe(true);
    expect(props.data).toEqual(chartData);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
});

it('shows the empty state without rendering a pie or legend', () => {
    render(<GroupPurchases chartData={[]} compact />);
    expect(screen.getByText('Sin datos para el periodo seleccionado')).toBeInTheDocument();
    expect(ResponsivePie).not.toHaveBeenCalled();
});

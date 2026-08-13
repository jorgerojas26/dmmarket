import { fireEvent, render, screen } from '@testing-library/react';
import useLocalStorage from './useLocalStorage';

// Harness: expone el valor y un botón que persiste { saved: true }.
const Harness = ({ storageKey, initial = null }) => {
    const [value, setValue] = useLocalStorage(storageKey, initial);
    return (
        <button type="button" onClick={() => setValue({ saved: true })}>
            {JSON.stringify(value)}
        </button>
    );
};

const mount = (props) => render(<Harness {...props} />);

describe('useLocalStorage', () => {
    beforeEach(() => localStorage.clear());

    it('inicializa con el fallback cuando no hay nada guardado', () => {
        mount({ storageKey: 't:1' });
        expect(screen.getByText('null')).toBeTruthy();
    });

    it('persiste en localStorage y recarga el valor en un nuevo mount', () => {
        const { unmount } = mount({ storageKey: 't:1' });
        fireEvent.click(screen.getByRole('button'));
        expect(JSON.parse(localStorage.getItem('t:1'))).toEqual({ saved: true });

        unmount();
        mount({ storageKey: 't:1' });
        expect(screen.getByText('{"saved":true}')).toBeTruthy();
    });

    it('con key null no escribe a localStorage pero mantiene estado en memoria', () => {
        mount({ storageKey: null });
        fireEvent.click(screen.getByRole('button'));
        expect(localStorage.getItem('null')).toBeNull();
        expect(screen.getByText('{"saved":true}')).toBeTruthy();
    });

    it('cambiar la key recarga desde el storage de la nueva key', () => {
        localStorage.setItem('t:2', JSON.stringify({ saved: true }));
        const { rerender } = render(<Harness storageKey="t:1" />);
        expect(screen.getByText('null')).toBeTruthy();

        rerender(<Harness storageKey="t:2" />);
        expect(screen.getByText('{"saved":true}')).toBeTruthy();
    });
});

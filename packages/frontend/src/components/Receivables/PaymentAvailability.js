import { useAuth } from 'auth/context';
import { useReceivablesAccess } from './access';

export default function PaymentAvailability() {
    const { can } = useAuth();
    const { status, error, refreshStatus } = useReceivablesAccess();
    const permitted = can('receivables.payment');
    if (permitted && !error && status?.writesAvailable) return null;
    const checking = permitted && !status && !error;
    return (
        <span className="cxc-payment-availability">
            <span role="status" aria-label="Disponibilidad de abonos" className="cxc-availability-state">
                {checking ? (
                    <>
                        <span className="spinner-border spinner-border-sm" aria-hidden="true" />
                        <span className="visually-hidden">Comprobando disponibilidad</span>
                    </>
                ) : (
                    <>
                        <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            aria-hidden="true"
                        >
                            <rect x="5" y="10" width="14" height="11" rx="2" />
                            <path d="M8 10V6a4 4 0 0 1 8 0v4" />
                        </svg>
                        {!permitted ? 'Sin permiso' : error ? 'No disponible' : 'Solo lectura'}
                    </>
                )}
            </span>
            {permitted && error && (
                <button
                    type="button"
                    className="cxc-availability-retry"
                    aria-label="Reintentar disponibilidad"
                    onClick={refreshStatus}
                >
                    <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        aria-hidden="true"
                    >
                        <path d="M20 4v6h-6M4 20v-6h6M6 7a7 7 0 0 1 12-2l2 3M18 17a7 7 0 0 1-12 2l-2-3" />
                    </svg>
                </button>
            )}
        </span>
    );
}

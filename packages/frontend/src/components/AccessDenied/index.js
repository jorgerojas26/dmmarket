import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './styles.css';

export default function AccessDenied() {
    const heading = useRef(null);

    useEffect(() => {
        heading.current?.focus({ preventScroll: true });
    }, []);

    return (
        <main
            className="access-denied"
            aria-labelledby="access-denied-title"
            aria-describedby="access-denied-description"
        >
            <div className="access-denied__content">
                <div className="access-denied__icon" aria-hidden="true">
                    <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <path d="M12 3 4.5 6v5.3c0 4.3 3.1 7.4 7.5 9.7 4.4-2.3 7.5-5.4 7.5-9.7V6L12 3Z" />
                        <rect x="8.5" y="10.5" width="7" height="5.5" rx="1.3" />
                        <path d="M10 10.5V9a2 2 0 0 1 4 0v1.5" />
                        <path d="M12 13v.5" />
                    </svg>
                </div>
                <p className="access-denied__code">
                    <span>403</span>
                    <span aria-hidden="true">·</span>
                    Sin autorización
                </p>
                <h1 id="access-denied-title" className="access-denied__title" tabIndex={-1} ref={heading}>
                    Acceso restringido
                </h1>
                <p id="access-denied-description" className="access-denied__description">
                    Tu cuenta no tiene permisos para acceder a esta sección.
                </p>
                <Link to="/" className="access-denied__back">
                    <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                    >
                        <path d="m10 5-7 7 7 7M3 12h18" />
                    </svg>
                    Volver al inicio
                </Link>
            </div>
        </main>
    );
}

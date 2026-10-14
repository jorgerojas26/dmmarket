import Button from 'react-bootstrap/Button';

export default function Pager({ page, total, limit = 20, onChange, busy = false, label }) {
    const pages = Math.max(1, Math.ceil(total / limit));
    return (
        <nav className="cxc-pager" aria-label={label}>
            <span>
                {total} registros · Página {page} de {pages}
            </span>
            <div>
                <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={page <= 1 || busy}
                    onClick={() => onChange(page - 1)}
                    aria-label={`${label}: anterior`}
                >
                    Anterior
                </Button>
                <Button
                    size="sm"
                    variant="outline-secondary"
                    disabled={page >= pages || busy}
                    onClick={() => onChange(page + 1)}
                    aria-label={`${label}: siguiente`}
                >
                    Siguiente
                </Button>
            </div>
        </nav>
    );
}

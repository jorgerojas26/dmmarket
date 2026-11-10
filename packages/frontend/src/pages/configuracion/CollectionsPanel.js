import { fetchCollectionCatalog, saveCollectionCatalog } from 'api/receivables';
import { useEffect, useRef, useState } from 'react';
import { Button, Form, Modal, Spinner } from 'react-bootstrap';
import { mutate } from 'swr';

function CatalogSection({ type }) {
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const [editor, setEditor] = useState(null);
    const [retiring, setRetiring] = useState(null);
    const [busy, setBusy] = useState(false);
    const [formError, setFormError] = useState('');
    const [notice, setNotice] = useState('');
    const firstInput = useRef(null);
    const cancelConfirmation = useRef(null);
    const banks = type === 'banks';

    useEffect(() => {
        let cancelled = false;
        setError('');
        fetchCollectionCatalog(type)
            .then((result) => {
                if (!cancelled) setRows(result);
            })
            .catch((failure) => {
                if (!cancelled) setError(failure.message);
            });
        return () => {
            cancelled = true;
        };
    }, [type, reload]);

    const save = async (id, values) => {
        if (busy) return;
        setBusy(true);
        setFormError('');
        setError('');
        setNotice('');
        try {
            await saveCollectionCatalog(type, id, values);
            setEditor(null);
            setRetiring(null);
            setNotice(id === null ? 'Registro creado.' : 'Cambios guardados.');
            setReload((value) => value + 1);
            void mutate(banks ? 'receivable-banks' : 'receivable-methods');
        } catch (failure) {
            if (editor || retiring) setFormError(failure.message);
            else setError(failure.message);
        } finally {
            setBusy(false);
        }
    };

    const openEditor = (row = null) => {
        setNotice('');
        setFormError('');
        setEditor({
            originalId: row?.id ?? null,
            id: row?.id ?? '',
            name: row?.name ?? '',
            active: row?.active ?? true,
        });
    };

    const editorForm = editor && (
        <Form
            className="collection-settings__editor collection-settings__editor--modal"
            aria-label={editor.originalId === null ? (banks ? 'Nuevo banco' : 'Nuevo método') : 'Editar registro'}
            onSubmit={(event) => {
                event.preventDefault();
                void save(editor.originalId, { id: editor.id, name: editor.name, active: editor.active });
            }}
        >
            <div className="collection-settings__fields">
                <Form.Group controlId={`collection-${type}-code`}>
                    <Form.Label>Código</Form.Label>
                    <Form.Control
                        ref={editor.originalId === null ? firstInput : undefined}
                        required
                        maxLength={banks ? 10 : 50}
                        disabled={busy || editor.originalId !== null}
                        value={editor.id}
                        onChange={(event) => setEditor({ ...editor, id: event.target.value.toUpperCase() })}
                    />
                </Form.Group>
                <Form.Group controlId={`collection-${type}-name`}>
                    <Form.Label>Nombre</Form.Label>
                    <Form.Control
                        ref={editor.originalId !== null ? firstInput : undefined}
                        required
                        maxLength={50}
                        disabled={busy}
                        value={editor.name}
                        onChange={(event) => setEditor({ ...editor, name: event.target.value })}
                    />
                </Form.Group>
            </div>
            <p className="report-settings__note">
                El código identifica el registro y no se puede cambiar después de crearlo.
            </p>
            {formError && (
                <p className="report-settings__error" role="alert">
                    {formError}
                </p>
            )}
            <footer className="report-settings__footer">
                <Button type="submit" size="sm" disabled={busy || !editor.id.trim() || !editor.name.trim()}>
                    {busy ? 'Guardando…' : 'Guardar'}
                </Button>
                <Button variant="outline-secondary" size="sm" disabled={busy} onClick={() => setEditor(null)}>
                    Cancelar
                </Button>
            </footer>
        </Form>
    );

    return (
        <section className="collection-settings__section" aria-labelledby={`collection-${type}-title`}>
            <div className="collection-settings__toolbar">
                <h2 id={`collection-${type}-title`}>{banks ? 'Bancos' : 'Métodos de pago'}</h2>
                <p
                    className="collection-settings__status"
                    role="status"
                    aria-live="polite"
                    aria-atomic="true"
                    title={notice || undefined}
                >
                    {notice}
                </p>
                {!editor && !retiring && (
                    <Button size="sm" variant="outline-primary" disabled={busy || !rows} onClick={() => openEditor()}>
                        {banks ? 'Nuevo banco' : 'Nuevo método'}
                    </Button>
                )}
            </div>
            {error && (
                <div className="collection-settings__error">
                    <p className="report-settings__error" role="alert">
                        {error}
                    </p>
                    <Button variant="outline-secondary" size="sm" onClick={() => setReload((value) => value + 1)}>
                        Reintentar
                    </Button>
                </div>
            )}
            {!rows && !error && (
                <p className="collection-settings__loading" role="status">
                    <Spinner size="sm" animation="border" /> Cargando catálogo…
                </p>
            )}
            <Modal
                show={!!editor}
                aria-labelledby={`collection-${type}-modal-title`}
                onHide={() => !busy && setEditor(null)}
                onEntered={() => firstInput.current?.focus()}
                backdrop={busy ? 'static' : true}
                keyboard={!busy}
                centered
                contentClassName="collection-settings__modal"
            >
                <Modal.Header closeButton={!busy}>
                    <Modal.Title id={`collection-${type}-modal-title`}>
                        {editor?.originalId != null
                            ? banks
                                ? 'Editar banco'
                                : 'Editar método'
                            : banks
                              ? 'Nuevo banco'
                              : 'Nuevo método'}
                    </Modal.Title>
                </Modal.Header>
                <Modal.Body className="report-settings collection-settings">{editorForm}</Modal.Body>
            </Modal>
            <Modal
                show={!!retiring}
                aria-labelledby={`collection-${type}-confirmation-title`}
                onHide={() => !busy && setRetiring(null)}
                onEntered={() => cancelConfirmation.current?.focus()}
                backdrop={busy ? 'static' : true}
                keyboard={!busy}
                centered
                contentClassName="collection-settings__modal"
            >
                <Modal.Header closeButton={!busy}>
                    <Modal.Title id={`collection-${type}-confirmation-title`}>Desactivar {retiring?.name}</Modal.Title>
                </Modal.Header>
                <Modal.Body className="report-settings collection-settings">
                    {retiring && (
                        <>
                            <p>
                                No estará disponible para nuevos abonos. Los abonos anteriores se conservan y puedes
                                reactivarlo cuando lo necesites.
                            </p>
                            {formError && (
                                <p className="report-settings__error" role="alert">
                                    {formError}
                                </p>
                            )}
                            <footer className="report-settings__footer">
                                <Button
                                    ref={cancelConfirmation}
                                    size="sm"
                                    variant="outline-secondary"
                                    disabled={busy}
                                    onClick={() => setRetiring(null)}
                                >
                                    Cancelar
                                </Button>
                                <Button
                                    size="sm"
                                    variant="outline-danger"
                                    disabled={busy}
                                    onClick={() => void save(retiring.id, { name: retiring.name, active: false })}
                                >
                                    {busy ? 'Guardando…' : 'Confirmar desactivación'}
                                </Button>
                            </footer>
                        </>
                    )}
                </Modal.Body>
            </Modal>
            {rows && (
                <div className="collection-settings__table-scroll">
                    <table
                        className="collection-settings__table"
                        aria-label={banks ? 'Bancos configurados' : 'Métodos configurados'}
                    >
                        <thead>
                            <tr>
                                <th scope="col">Código</th>
                                <th scope="col">Nombre</th>
                                <th scope="col">Estado</th>
                                <th scope="col">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr key={row.id}>
                                    <td>{row.id}</td>
                                    <td>{row.name || '—'}</td>
                                    <td>
                                        <span
                                            className={
                                                row.active
                                                    ? 'collection-settings__state--active'
                                                    : 'collection-settings__state--inactive'
                                            }
                                        >
                                            {row.active ? 'Activo' : 'Inactivo'}
                                        </span>
                                    </td>
                                    <td>
                                        <div className="collection-settings__actions">
                                            <Button
                                                variant="link"
                                                size="sm"
                                                disabled={busy}
                                                aria-label={`Editar ${row.name}`}
                                                title={`Editar ${row.name}`}
                                                onClick={() => openEditor(row)}
                                            >
                                                <svg
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="1.7"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                    focusable="false"
                                                >
                                                    <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                                                </svg>
                                            </Button>
                                            <Button
                                                variant="link"
                                                size="sm"
                                                disabled={busy}
                                                className={
                                                    row.active
                                                        ? 'collection-settings__deactivate'
                                                        : 'collection-settings__reactivate'
                                                }
                                                aria-label={`${row.active ? 'Desactivar' : 'Reactivar'} ${row.name}`}
                                                title={`${row.active ? 'Desactivar' : 'Reactivar'} ${row.name}`}
                                                onClick={() => {
                                                    if (row.active) {
                                                        setNotice('');
                                                        setFormError('');
                                                        setRetiring(row);
                                                    } else void save(row.id, { name: row.name, active: true });
                                                }}
                                            >
                                                <svg
                                                    width="16"
                                                    height="16"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="1.7"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    aria-hidden="true"
                                                    focusable="false"
                                                >
                                                    {row.active ? (
                                                        <>
                                                            <circle cx="12" cy="12" r="9" />
                                                            <path d="m6 6 12 12" />
                                                        </>
                                                    ) : (
                                                        <path d="M3 11a9 9 0 1 1 2.6 7.4M3 4v7h7" />
                                                    )}
                                                </svg>
                                            </Button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
            {rows?.length === 0 && !editor && (
                <p className="collection-settings__empty">
                    {banks ? 'No hay bancos configurados.' : 'No hay métodos de pago configurados.'}
                </p>
            )}
        </section>
    );
}

export default function CollectionsPanel() {
    return (
        <section className="report-settings collection-settings" aria-labelledby="collection-title">
            <header className="report-settings__header">
                <h1 id="collection-title">Cobranza</h1>
                <p>Configura las opciones para registrar abonos.</p>
            </header>
            <CatalogSection type="banks" />
            <CatalogSection type="methods" />
        </section>
    );
}

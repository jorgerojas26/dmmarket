import { useEffect, useRef, useState } from 'react';
import { fetcher } from 'swr-config';

export default function ExportButton({ resource, parameters }) {
    const mounted = useRef(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(
        () => () => {
            mounted.current = false;
        },
        [],
    );
    const download = async () => {
        setBusy(true);
        setError('');
        try {
            const report = await fetcher(`/api/exports/${resource}?${new URLSearchParams(parameters)}`);
            if (!mounted.current) return;
            const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
                import('pdfmake/build/pdfmake'),
                import('pdfmake/build/vfs_fonts'),
            ]);
            if (!mounted.current) return;
            pdfMake.vfs = fonts.pdfMake.vfs;
            const content = [
                { text: report.title, style: 'header' },
                { text: `Registros autorizados: ${report.total}`, margin: [0, 0, 0, 12] },
            ];
            if (report.data.length)
                content.push({
                    table: {
                        headerRows: 1,
                        widths: report.columns.map(() => '*'),
                        body: [
                            report.columns.map(({ label }) => ({ text: label, bold: true })),
                            ...report.data.map((row) =>
                                report.columns.map(({ key }) =>
                                    row[key] == null ? 'No disponible' : String(row[key]),
                                ),
                            ),
                        ],
                    },
                    layout: 'lightHorizontalLines',
                });
            else content.push({ text: 'Sin registros para el alcance solicitado.' });
            const blob = await new Promise((resolve) =>
                pdfMake
                    .createPdf({
                        pageOrientation: 'landscape',
                        defaultStyle: { fontSize: 8 },
                        styles: { header: { fontSize: 16, bold: true, margin: [0, 0, 0, 12] } },
                        content,
                    })
                    .getBlob(resolve),
            );
            if (!mounted.current) return;
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url;
            anchor.download = report.filename;
            document.body.appendChild(anchor);
            anchor.click();
            anchor.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (failure) {
            if (mounted.current && failure.name !== 'AbortError')
                setError('No se pudo exportar el alcance solicitado.');
        } finally {
            if (mounted.current) setBusy(false);
        }
    };
    return (
        <div className="my-3">
            <button type="button" className="btn btn-outline-light" disabled={busy} onClick={download}>
                {busy ? 'Preparando PDF…' : 'Exportar PDF autorizado'}
            </button>
            {error && <p role="alert">{error}</p>}
        </div>
    );
}

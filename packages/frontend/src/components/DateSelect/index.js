import { es } from 'date-fns/locale';
import { DateTime } from 'luxon';
import { useEffect, useRef, useState } from 'react';
import { Calendar } from 'react-date-range';
// Mismo lenguaje visual que el selector de rangos del resto de la app.
import 'components/DateRangePicker/styles.css';
import './styles.css';

const IconCalendar = () => (
    <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
    >
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
);

const IconChevron = ({ open }) => (
    <svg
        aria-hidden="true"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s ease' }}
    >
        <polyline points="6 9 12 15 18 9" />
    </svg>
);

const aFecha = (iso) => (iso ? DateTime.fromISO(iso).toJSDate() : new Date());

const DateSelect = ({ value, min, max, today, onChange, ariaLabel = 'Elegir fecha' }) => {
    const wrapperRef = useRef(null);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setOpen(false);
        };
        if (open) document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [open]);

    const elegir = (fecha) => {
        onChange(DateTime.fromJSDate(fecha).toISODate());
        setOpen(false);
    };

    return (
        <div className="date-range-picker-wrapper date-select" ref={wrapperRef}>
            <button
                type="button"
                className="date-range-trigger"
                onClick={() => setOpen((previo) => !previo)}
                aria-expanded={open}
                aria-label={ariaLabel}
            >
                <IconCalendar />
                <span className="date-range-label">
                    {value ? DateTime.fromISO(value).toFormat('dd MMM yyyy', { locale: 'es' }) : 'Elegir fecha'}
                </span>
                <IconChevron open={open} />
            </button>

            {open && (
                <div className="date-range-dropdown">
                    <Calendar
                        date={aFecha(value)}
                        onChange={elegir}
                        minDate={min ? aFecha(min) : undefined}
                        maxDate={max ? aFecha(max) : undefined}
                        locale={es}
                        color="#0d6efd"
                        direction="horizontal"
                        showMonthAndYearPickers
                    />
                    {today && value !== today && (
                        <div className="date-range-footer">
                            <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                onClick={() => elegir(aFecha(today))}
                            >
                                Tasa de hoy
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default DateSelect;

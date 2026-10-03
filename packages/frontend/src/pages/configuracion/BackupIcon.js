const BackupIcon = ({ name, className = '' }) => (
    <svg
        className={className}
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
    >
        {name === 'database' && (
            <>
                <ellipse cx="12" cy="5" rx="8" ry="3" />
                <path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" />
            </>
        )}
        {name === 'clock' && (
            <>
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7v5l3 2" />
            </>
        )}
        {name === 'refresh' && <path d="M20 7v5h-5M4 17v-5h5M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6" />}
        {name === 'cloud' && <path d="M7 18h11a4 4 0 0 0 0-8h-1a6 6 0 0 0-11-2 5 5 0 0 0 1 10Z" />}
        {name === 'file' && <path d="M14 3H6v18h12V7Zm0 0v5h4M9 13h6M9 17h6" />}
        {name === 'shield' && <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6" />}
    </svg>
);

export default BackupIcon;

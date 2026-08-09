/**
 * Shared tooltip for all nivo charts — dark, consistent styling.
 *
 * Usage (inside a chart `tooltip` prop):
 *   <ChartTooltip title={datum.label} color={datum.color} description="Qué significa esto">
 *       <span>Label</span>
 *       <strong>Value</strong>
 *   </ChartTooltip>
 *
 * Children are rendered as label/value pairs in a 2-column grid.
 * An optional `description` renders full-width (muted, italic) above the pairs.
 */
const ChartTooltip = ({ title, color, description, children }) => (
    <div
        style={{
            background: '#1a1d21',
            color: '#e9ecef',
            border: '1px solid #2f3338',
            borderRadius: 8,
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
            padding: '8px 12px',
            fontSize: 12,
            lineHeight: 1.5,
        }}
    >
        {title && (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontWeight: 600,
                    marginBottom: 2,
                }}
            >
                {color && (
                    <span
                        style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: color,
                            flexShrink: 0,
                        }}
                    />
                )}
                {title}
            </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'auto auto', gap: '0 12px', justifyItems: 'start' }}>
            {description && (
                <div
                    style={{
                        gridColumn: '1 / -1',
                        color: '#94a3b8',
                        fontStyle: 'italic',
                        marginBottom: 4,
                        maxWidth: 260,
                    }}
                >
                    {description}
                </div>
            )}
            {children}
        </div>
    </div>
);

export default ChartTooltip;

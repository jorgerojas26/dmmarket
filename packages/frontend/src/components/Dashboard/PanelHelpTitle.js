import OverlayTrigger from 'react-bootstrap/OverlayTrigger';
import Popover from 'react-bootstrap/Popover';

/**
 * Panel title with an optional "?" help button that opens a dark popover
 * explaining what the chart shows. `help` = { que, leer, servir, accion }.
 */
const PanelHelpTitle = ({ title, help, subtitle }) => {
    const helpLines = help
        ? [
              { label: 'Qué muestra', text: help.que },
              { label: 'Cómo leerlo', text: help.leer },
              { label: 'Para qué sirve', text: help.servir },
              { label: 'Acción sugerida', text: help.accion },
          ].filter((line) => line.text)
        : [];

    return (
        <div className="dashboard-inline-title panel-help-title">
            {title}
            {subtitle}
            {help && (
                <OverlayTrigger
                    trigger="click"
                    rootClose
                    placement="bottom"
                    overlay={
                        <Popover id={`panel-help-${title.replace(/\W+/g, '-')}`} className="kpi-help-popover">
                            <Popover.Body>
                                {helpLines.map((line) => (
                                    <div key={line.label} className="kpi-help-line">
                                        <span className="kpi-help-k">{line.label}: </span>
                                        {line.text}
                                    </div>
                                ))}
                            </Popover.Body>
                        </Popover>
                    }
                >
                    <button
                        type="button"
                        className="panel-help-btn"
                        aria-label={`Ayuda sobre ${title}`}
                        title={`Ayuda sobre ${title}`}
                    >
                        ?
                    </button>
                </OverlayTrigger>
            )}
        </div>
    );
};

export default PanelHelpTitle;

import { forwardRef } from 'react';
import BootstrapModal from 'react-bootstrap/Modal';
import BootstrapModalManager from 'react-bootstrap/BootstrapModalManager';

class StackedModalManager extends BootstrapModalManager {
    setModalAttributes(modal) {
        if (!modal.dialog) return;
        const zIndex = Math.max(
            1055,
            Number.parseInt(getComputedStyle(modal.dialog).zIndex, 10) || 0,
            ...this.modals
                .filter((entry) => entry !== modal && entry.dialog)
                .map((entry) => (Number.parseInt(getComputedStyle(entry.dialog).zIndex, 10) || 1055) + 20),
        );
        modal.dialog.style.zIndex = String(zIndex);
        if (modal.backdrop) modal.backdrop.style.zIndex = String(zIndex - 5);
    }

    removeModalAttributes(modal) {
        if (modal.dialog) modal.dialog.style.zIndex = '';
        if (modal.backdrop) modal.backdrop.style.zIndex = '';
    }
}

export const modalManager = new StackedModalManager();

const Modal = forwardRef((props, ref) => <BootstrapModal manager={modalManager} {...props} ref={ref} />);
Modal.displayName = 'Modal';

export default Object.assign(Modal, {
    Body: BootstrapModal.Body,
    Header: BootstrapModal.Header,
    Title: BootstrapModal.Title,
    Footer: BootstrapModal.Footer,
    Dialog: BootstrapModal.Dialog,
});

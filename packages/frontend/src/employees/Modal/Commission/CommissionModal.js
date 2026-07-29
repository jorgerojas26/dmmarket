import { updateComisionInfo } from 'api/employees';
import { useComisionInfo } from 'hooks/useEmployees';
import { useState } from 'react';
import { Alert, Button, Modal, Spinner } from 'react-bootstrap';

const CommissionModal = ({ employee, show, onClose }) => {
    const [formData, setFormData] = useState({});
    const [submissionState, setSubmissionState] = useState({
        loading: false,
        error: false,
        message: '',
    });

    const { data: commissionData, isLoading } = useComisionInfo(employee?.id, show && !!employee?.id);

    const sanitizedFormData = () => {
        const data = {};
        Object.keys(formData).forEach((key) => {
            if (formData[key]) {
                data[key] = Number(formData[key]);
            }
        });
        return data;
    };

    const submitForm = async (event) => {
        event.preventDefault();
        if (!submissionState.loading) {
            setSubmissionState({ ...submissionState, loading: true, text: '' });
            const response = await updateComisionInfo(employee.id, sanitizedFormData());
            if (response.error) {
                setSubmissionState({ error: true, text: response.error.message, loading: false });
            } else if (response.success) {
                setSubmissionState({ error: false, text: 'El recurso fue actualizado con éxito', loading: false });
            }
        }
    };

    const modalBody = () => {
        if (commissionData?.error) {
            return <Alert variant="danger">{commissionData.error.message}</Alert>;
        } else if (isLoading) {
            return <Spinner animation="border" />;
        } else if (commissionData) {
            return commissionData.map((info) => {
                return (
                    <div key={info.groupId} className="d-flex flex-column col-sm-4">
                        <label className="form-label">{info.group}</label>
                        <div className="input-group mb-3">
                            <span className="input-group-text" id="basic-addon1">
                                %
                            </span>
                            <input
                                type="number"
                                min={0}
                                step={0.01}
                                className="form-control"
                                placeholder={info.commission || 0}
                                value={formData[info.groupId] || ''}
                                onChange={(e) => setFormData({ ...formData, [info.groupId]: e.target.value })}
                                onFocus={(e) => e.target.select()}
                            />
                        </div>
                    </div>
                );
            });
        }
        return null;
    };

    return (
        <Modal show={show} size="lg" onHide={onClose}>
            <Modal.Header closeButton>
                <Modal.Title>{employee.name}</Modal.Title>
            </Modal.Header>
            <form onSubmit={submitForm}>
                <Modal.Body>
                    <div className="row justify-content-center">{modalBody()}</div>
                </Modal.Body>
                <Modal.Footer className="px-0 pb-2">
                    <div className="container-fluid d-flex justify-content-between align-items-center gap-5">
                        <div className="col-9">
                            {submissionState.text && (
                                <Alert variant={submissionState.error ? 'danger' : 'success'} className="mb-0 mt-0 p-1">
                                    {submissionState.text}
                                </Alert>
                            )}
                        </div>
                        <div className="col-3 d-flex flex-wrap gap-2">
                            <Button
                                type="submit"
                                variant="success"
                                disabled={Object.keys(formData).length === 0 || submissionState.loading}
                            >
                                Enviar
                            </Button>
                            <Button variant="danger" onClick={onClose}>
                                Cerrar
                            </Button>
                        </div>
                    </div>
                </Modal.Footer>
            </form>
        </Modal>
    );
};

export default CommissionModal;

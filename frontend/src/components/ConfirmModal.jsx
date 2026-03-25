import React from 'react';

const ConfirmModal = ({ isOpen, message, onConfirm, onCancel }) => {
    if (!isOpen) return null;
    return (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
            <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', maxWidth: '400px', width: '90%', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '15px' }}>⚠️</div>
                <h3 style={{ marginBottom: '15px', color: '#1a202c' }}>정말 삭제하시겠습니까?</h3>
                <p style={{ marginBottom: '25px', color: '#4a5568', lineHeight: '1.5', whiteSpace: 'pre-wrap', fontSize: '0.95rem' }}>{message}</p>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '12px' }}>
                    <button className="btn btn-danger" onClick={onConfirm} style={{ padding: '10px 20px' }}>삭제하기</button>
                    <button className="btn btn-secondary" onClick={onCancel} style={{ padding: '10px 20px' }}>취소</button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmModal;

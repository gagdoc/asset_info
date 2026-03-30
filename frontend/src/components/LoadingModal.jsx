import React from 'react';

const LoadingModal = ({ isOpen, message = "처리 중입니다..." }) => {
    if (!isOpen) return null;
    return (
        <div style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            width: '100%', 
            height: '100%', 
            background: 'rgba(255, 255, 255, 0.8)', 
            backdropFilter: 'blur(4px)',
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            zIndex: 10000 
        }}>
            <div style={{ 
                background: '#fff', 
                padding: '32px', 
                borderRadius: '20px', 
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.15)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '20px',
                minWidth: '280px'
            }}>
                <div className="spinner-container" style={{ position: 'relative', width: '60px', height: '60px' }}>
                    <div className="spinner-outer" style={{
                        width: '100%',
                        height: '100%',
                        border: '4px solid #f3f4f6',
                        borderTop: '4px solid #4f46e5',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <div className="spinner-inner" style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        width: '40px',
                        height: '40px',
                        border: '4px solid #f3f4f6',
                        borderBottom: '4px solid #818cf8',
                        borderRadius: '50%',
                        animation: 'spin-reverse 1.5s linear infinite'
                    }} />
                </div>
                <div style={{ textAlign: 'center' }}>
                    <h3 style={{ margin: '0 0 8px 0', color: '#1a202c', fontSize: '1.2rem' }}>{message}</h3>
                    <p style={{ margin: 0, color: '#718096', fontSize: '0.9rem' }}>구글 시트에 데이터를 기록하고 있습니다.<br/>잠시만 기다려 주세요.</p>
                </div>
                
                <style>{`
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    @keyframes spin-reverse {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(-360deg); }
                    }
                `}</style>
            </div>
        </div>
    );
};

export default LoadingModal;

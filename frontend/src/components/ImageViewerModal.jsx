import { FaTimes } from 'react-icons/fa'

export default function ImageViewerModal({ isOpen, onClose, itemName, imageUrl }) {
  if (!isOpen || !imageUrl) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.75)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2600,
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '12px',
          maxWidth: '520px',
          width: '90%',
          overflow: 'hidden',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
          }}
        >
          <h4 style={{ margin: 0, color: '#0f172a', fontSize: '1rem' }}>{itemName}</h4>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#64748b',
              fontSize: '1.1rem',
            }}
          >
            <FaTimes />
          </button>
        </div>

        <div style={{ padding: '1.5rem', textAlign: 'center', backgroundColor: '#f1f5f9' }}>
          <img
            src={imageUrl}
            alt={itemName}
            style={{
              maxWidth: '100%',
              maxHeight: '420px',
              borderRadius: '8px',
              objectFit: 'contain',
              boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
              backgroundColor: '#ffffff',
            }}
          />
        </div>

        <div
          style={{
            padding: '0.75rem 1.25rem',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'flex-end',
            background: '#f8fafc',
          }}
        >
          <button className="btn btn-secondary" onClick={onClose} style={{ fontSize: '0.85rem' }}>
            닫기
          </button>
        </div>
      </div>
    </div>
  )
}

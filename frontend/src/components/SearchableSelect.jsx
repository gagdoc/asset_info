import { useState, useEffect, useRef, useMemo } from 'react'

const SearchableSelect = ({ options, value, onChange, placeholder, displayField = "label", valueField = "value", searchFields = ["label"], width = "200px" }) => {
    const [isOpen, setIsOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const containerRef = useRef(null)

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const filteredOptions = useMemo(() => {
        if (!searchTerm) return options || []
        const term = searchTerm.toLowerCase()
        return (options || []).filter(opt => 
            searchFields.some(field => String(opt[field] || '').toLowerCase().includes(term))
        )
    }, [options, searchTerm, searchFields])

    const selectedOption = useMemo(() => 
        (options || []).find(opt => opt[valueField] === value), 
    [options, value, valueField])

    return (
        <div ref={containerRef} style={{ position: 'relative', width }}>
            <div 
                onClick={() => setIsOpen(!isOpen)}
                style={{ 
                    padding: '8px 12px', 
                    border: '1px solid #ddd', 
                    borderRadius: '4px', 
                    backgroundColor: '#fff',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    minHeight: '38px'
                }}
            >
                <span style={{ color: selectedOption ? '#000' : '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {selectedOption ? selectedOption[displayField] : placeholder}
                </span>
                <span style={{ fontSize: '0.8em', color: '#666' }}>{isOpen ? '▲' : '▼'}</span>
            </div>

            {isOpen && (
                <div style={{ 
                    position: 'absolute', 
                    top: '100%', 
                    left: 0, 
                    right: 0, 
                    zIndex: 100, 
                    backgroundColor: '#fff', 
                    border: '1px solid #ddd', 
                    borderRadius: '4px', 
                    marginTop: '4px',
                    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                    maxHeight: '250px',
                    overflowY: 'auto'
                }}>
                    <div style={{ padding: '8px', borderBottom: '1px solid #eee', position: 'sticky', top: 0, backgroundColor: '#fff' }}>
                        <input 
                            autoFocus
                            type="text" 
                            placeholder="검색..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: '100%', padding: '6px', border: '1px solid #ddd', borderRadius: '4px', boxSizing: 'border-box' }}
                        />
                    </div>
                    {filteredOptions.length > 0 ? filteredOptions.map((opt, idx) => (
                        <div 
                            key={idx}
                            onClick={() => {
                                onChange(opt[valueField])
                                setIsOpen(false)
                                setSearchTerm('')
                            }}
                            style={{ 
                                padding: '8px 12px', 
                                cursor: 'pointer',
                                backgroundColor: value === opt[valueField] ? '#f0f9ff' : 'transparent',
                                borderBottom: '1px solid #f9f9f9'
                            }}
                            onMouseOver={(e) => e.target.style.backgroundColor = '#f8fafc'}
                            onMouseOut={(e) => e.target.style.backgroundColor = value === opt[valueField] ? '#f0f9ff' : 'transparent'}
                        >
                            <div style={{ fontWeight: value === opt[valueField] ? 'bold' : 'normal' }}>{opt[displayField]}</div>
                            {opt.subLabel && <div style={{ fontSize: '0.8em', color: '#666' }}>{opt.subLabel}</div>}
                        </div>
                    )) : (
                        <div style={{ padding: '12px', textAlign: 'center', color: '#999' }}>검색 결과가 없습니다.</div>
                    )}
                </div>
            )}
        </div>
    )
}

export default SearchableSelect

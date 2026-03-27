import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useToast } from '../components/Toast'

const AssetList = () => {
    const { type } = useParams()
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const [selectedRows, setSelectedRows] = useState(new Set())
    const [activeTab, setActiveTab] = useState('list')
    const [showDuplicateSummary, setShowDuplicateSummary] = useState(false)
    const fileInputRef = useRef(null)
    
    // 년, 월 필터 상태 추가
    const [filterYear, setFilterYear] = useState('')
    const [filterMonth, setFilterMonth] = useState('')

    // 상세 수정 모달 상태
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingRowIdx, setEditingRowIdx] = useState(null)
    const [modalData, setModalData] = useState({})

    const { data: assets, isLoading } = useQuery({
        queryKey: ['assets', type],
        queryFn: async () => {
            const { data } = await axios.get(`/api/assets/${type}`)
            return data
        },
        enabled: !!type
    })

    const columns = assets?.length > 0 ? Object.keys(assets[0]) : []

    // ── 연도/월 추출 및 데이터 필터링 ──
    const getYear = (row) => {
        if (type !== 'Lease' && (row['년'] || row['년도'])) return String(row['년'] || row['년도'])
        const ld = row['Lease Date']
        if (!ld) return ''
        const dateStr = String(ld)
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/')
            if (parts.length === 3) {
                const yy = parts[2].trim()
                return yy.length === 2 ? '20' + yy : yy
            }
        }
        if (dateStr.includes('-')) {
            const parts = dateStr.split('-')
            if (parts[0].length === 4) return parts[0]
        }
        return ''
    }

    const getMonth = (row) => {
        if (type !== 'Lease' && row['월']) return String(row['월'])
        const ld = row['Lease Date']
        if (!ld) return ''
        const dateStr = String(ld)
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/')
            if (parts.length >= 1) return String(parseInt(parts[0]))
        }
        if (dateStr.includes('-')) {
            const parts = dateStr.split('-')
            if (parts.length >= 2) return String(parseInt(parts[1]))
        }
        return ''
    }

    const uniqueYears = Array.from(new Set(assets?.map(getYear).filter(v => v !== '' && v !== 'null' && v !== 'undefined'))).sort((a,b) => b.localeCompare(a))
    const uniqueMonths = Array.from(new Set(assets?.map(getMonth).filter(v => v !== '' && v !== 'null' && v !== 'undefined'))).sort((a,b) => parseInt(a) - parseInt(b))

    let displayedAssets = assets
    if (type === 'NewHire' || type === 'Resign' || type === 'Lease') {
        if (filterYear) displayedAssets = displayedAssets?.filter(row => getYear(row) === filterYear)
        if (filterMonth) displayedAssets = displayedAssets?.filter(row => getMonth(row) === filterMonth)
    }

    // ── 중복 이메일 체크 및 그룹화 ──
    const emailToRows = {}
    if (displayedAssets) {
        displayedAssets.forEach((row, idx) => {
            const email = row['email'] || row['EMAIL']
            if (email && email.trim() !== '' && email.toLowerCase() !== 'missing') {
                const normEmail = email.trim().toLowerCase()
                if (!emailToRows[normEmail]) emailToRows[normEmail] = []
                emailToRows[normEmail].push({ ...row, originalIdx: idx })
            }
        })
    }
    const duplicateGroups = Object.keys(emailToRows)
        .filter(email => emailToRows[email].length > 1)
        .reduce((acc, email) => {
            acc[email] = emailToRows[email]
            return acc
        }, {})
    
    const duplicateEmails = Object.keys(duplicateGroups)

    // ── 상세 수정 모달 로직 ──
    const openEditModal = (row, idx) => {
        setEditingRowIdx(idx)
        setModalData({ ...row })
        setIsModalOpen(true)
    }

    const handleModalSave = async () => {
        try {
            await axios.put('/api/assets/row/update', {
                asset_type: type,
                row_index: editingRowIdx,
                updates: modalData
            })
            queryClient.invalidateQueries(['assets', type])
            addToast('상세 수정 완료', 'success')
            setIsModalOpen(false)
        } catch (err) {
            addToast('수정 실패: ' + err.message, 'error')
        }
    }

    // ── Row delete ──
    const handleDeleteSelected = async () => {
        if (selectedRows.size === 0) return
        if (!confirm(`${selectedRows.size}개 행을 삭제하시겠습니까?`)) return
        try {
            await axios.delete('/api/assets/row/delete', {
                data: { asset_type: type, row_indices: Array.from(selectedRows) }
            })
            setSelectedRows(new Set())
            queryClient.invalidateQueries(['assets', type])
            addToast(`${selectedRows.size}개 행 삭제 완료`, 'success')
        } catch (err) {
            addToast('삭제 실패', 'error')
        }
    }

    const handleDownload = () => {
        window.open(`/api/assets/${type}/download`, '_blank')
    }

    const handleFileUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        const formData = new FormData()
        formData.append('file', file)
        try {
            await axios.post(`/api/assets/${type}/replace`, formData)
            queryClient.invalidateQueries(['assets', type])
            addToast('파일 업로드 완료', 'success')
        } catch (err) {
            addToast('업로드 실패', 'error')
        }
    }

    const toggleSelectAll = () => {
        if (selectedRows.size === assets?.length) {
            setSelectedRows(new Set())
        } else {
            setSelectedRows(new Set(assets?.map((_, i) => i)))
        }
    }

    if (isLoading) return <div className="loading"><div className="spinner" /> 데이터 로딩중...</div>

    const titleMap = {
        'Lease': '💻 PC/노트북 (Lease) 관리',
        'iPad': '📱 아이패드 (iPad) 관리',
        'Monitor': '🖥 모니터 (Monitor) 관리',
        'Printer': '🖨 프린터 (Printer) 관리',
        'Teams': '📞 Teams 번호 관리',
        'All_User': '👥 전체 사용자 관리',
        'Resign': '퇴사자 관리',
        'NewHire': '신규 입사자 관리',
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <h1>{titleMap[type] || `${type} Management`}</h1>
                <div className="flex gap-1">
                    {(type === 'NewHire' || type === 'Resign' || type === 'Lease') && (
                        <div style={{ display: 'flex', gap: '5px', marginRight: '10px' }}>
                            <select className="form-input" style={{ padding: '4px 8px', minWidth: '100px' }} value={filterYear} onChange={e => setFilterYear(e.target.value)}>
                                <option value="">전체 연도</option>
                                {uniqueYears.map(y => <option key={y} value={y}>{y}년</option>)}
                            </select>
                            <select className="form-input" style={{ padding: '4px 8px', minWidth: '90px' }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                                <option value="">전체 월</option>
                                {uniqueMonths.map(m => <option key={m} value={m}>{m}월</option>)}
                            </select>
                        </div>
                    )}
                    {selectedRows.size > 0 && (
                        <button className="btn btn-danger btn-sm" onClick={handleDeleteSelected}>
                            🗑 {selectedRows.size}개 삭제
                        </button>
                    )}
                    <button className="btn btn-sm" onClick={handleDownload}>📥 CSV 다운로드</button>
                    <button className="btn btn-sm" onClick={() => queryClient.invalidateQueries(['assets', type])}>🔄 새로고침</button>
                </div>
            </div>

            <div className="tabs">
                <button className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>📋 {type === 'Lease' ? '자산 리스트' : '리스트 편집'}</button>
                {type !== 'Lease' && <button className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>📂 파일 등록</button>}
            </div>

            {activeTab === 'list' && (
                <div className="card" style={{ padding: 0 }}>
                    {duplicateEmails.length > 0 && (
                        <div className="alert alert-danger" style={{ margin: '1rem', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>🚨 <strong>중복 이메일 감지</strong>: 현재 리스트에 {duplicateEmails.length}개의 중복된 이메일 주소가 있습니다.</div>
                            <button className="btn btn-danger btn-sm" onClick={() => setShowDuplicateSummary(!showDuplicateSummary)}>
                                {showDuplicateSummary ? '요약 닫기' : '중복 내역 보기'}
                            </button>
                        </div>
                    )}

                    {showDuplicateSummary && duplicateEmails.length > 0 && (
                        <div style={{ margin: '0 1rem 1rem', padding: '1rem', backgroundColor: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '0.5rem' }}>
                            <h4 style={{ margin: '0 0 0.5rem', color: '#c53030' }}>📍 중복 할당 상세 내역</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
                                {duplicateEmails.map(email => (
                                    <div key={email} style={{ padding: '8px', backgroundColor: 'white', border: '1px solid #fed7d7', borderRadius: '4px' }}>
                                        <div style={{ fontWeight: 'bold', borderBottom: '1px solid #eee', marginBottom: '4px', paddingBottom: '2px', color: '#e53e3e' }}>{email}</div>
                                        {duplicateGroups[email].map((r, i) => (
                                            <div key={i} style={{ fontSize: '0.85rem', color: '#4a5568', display: 'flex', justifyContent: 'space-between' }}>
                                                <span>• {r['S/N'] || r['Model'] || 'ID 미상'}</span>
                                                <span style={{ color: '#718096' }}>({r['USER'] || r['이름'] || '사용자 미상'})</span>
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {displayedAssets?.length > 0 ? (
                        <div className="table-wrapper" style={{ maxHeight: '65vh', overflow: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px' }}>
                                            <input type="checkbox" onChange={toggleSelectAll} checked={selectedRows.size === displayedAssets?.length && displayedAssets?.length > 0} />
                                        </th>
                                        <th style={{ width: '80px' }}>관리</th>
                                        {columns.map(col => <th key={col}>{col}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayedAssets.map((row, idx) => (
                                        <tr key={idx}>
                                            <td className="checkbox-cell">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRows.has(idx)}
                                                    onChange={(e) => {
                                                        const newSet = new Set(selectedRows)
                                                        e.target.checked ? newSet.add(idx) : newSet.delete(idx)
                                                        setSelectedRows(newSet)
                                                    }}
                                                />
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.8em' }} onClick={() => openEditModal(row, idx)}>상세 수정</button>
                                            </td>
                                            {columns.map(col => {
                                                const val = row[col] !== null ? String(row[col]) : '-'
                                                const isEmailCol = col.toLowerCase() === 'email'
                                                const isDuplicate = isEmailCol && val !== '-' && duplicateEmails.includes(val.trim().toLowerCase())
                                                
                                                return (
                                                    <td
                                                        key={col}
                                                        style={{ 
                                                            padding: '8px',
                                                            backgroundColor: isDuplicate ? '#fee2e2' : '',
                                                            color: isDuplicate ? '#dc2626' : '',
                                                            fontWeight: isDuplicate ? 'bold' : 'normal'
                                                        }}
                                                    >
                                                        <span>{val}</span>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>데이터가 없습니다.</div>
                    )}
                </div>
            )}

            {activeTab === 'upload' && type !== 'Lease' && (
                <div className="card">
                    <h3>📂 파일 업로드로 테이블 교체</h3>
                    <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
                        CSV 또는 Excel 파일을 업로드하면 현재 {type} 테이블의 데이터가 교체됩니다.
                    </p>
                    <div
                        className="upload-area"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>📁</p>
                        <p style={{ fontWeight: 500 }}>클릭하여 파일 선택</p>
                        <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>CSV, XLSX 파일 지원</p>
                        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} />
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div className="card" style={{ width: '80%', maxWidth: '800px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '1rem', borderBottom: '1px solid #eee' }}>
                            <h3 style={{ margin: 0 }}>📍 상세 정보 수정</h3>
                            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>✖</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                {columns.map(col => (
                                    <div key={col} className="form-group">
                                        <label className="form-label">{col}</label>
                                        <input 
                                            className="form-input"
                                            value={modalData[col] !== null ? String(modalData[col]) : ''} 
                                            onChange={e => setModalData({ ...modalData, [col]: e.target.value })}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{ padding: '1rem', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>취소</button>
                            <button className="btn btn-primary" onClick={handleModalSave}>💾 모든 변경사항 저장</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default AssetList

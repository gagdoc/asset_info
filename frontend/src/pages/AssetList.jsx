import { useState, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useToast } from '../components/Toast'

const AssetList = () => {
    const { type } = useParams()
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const [editingCell, setEditingCell] = useState(null)
    const [editValue, setEditValue] = useState('')
    const [selectedRows, setSelectedRows] = useState(new Set())
    const [activeTab, setActiveTab] = useState('list')
    const fileInputRef = useRef(null)

    const { data: assets, isLoading } = useQuery({
        queryKey: ['assets', type],
        queryFn: async () => {
            const { data } = await axios.get(`/api/assets/${type}`)
            return data
        },
        enabled: !!type
    })

    const columns = assets?.length > 0 ? Object.keys(assets[0]) : []

    // ── Inline editing ──
    const handleCellClick = (rowIdx, col) => {
        setEditingCell({ row: rowIdx, col })
        setEditValue(assets[rowIdx][col] !== null ? String(assets[rowIdx][col]) : '')
    }

    const handleCellSave = async () => {
        if (!editingCell) return
        try {
            await axios.put('/api/assets/row/update', {
                asset_type: type,
                row_index: editingCell.row,
                updates: { [editingCell.col]: editValue }
            })
            queryClient.invalidateQueries(['assets', type])
            addToast('수정 완료', 'success')
        } catch (err) {
            addToast('수정 실패: ' + err.message, 'error')
        }
        setEditingCell(null)
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') handleCellSave()
        if (e.key === 'Escape') setEditingCell(null)
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

    // ── Download CSV ──
    const handleDownload = () => {
        window.open(`/api/assets/${type}/download`, '_blank')
    }

    // ── Upload replacement file ──
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

    // ── Select all ──
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
                <button className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>📝 리스트 편집</button>
                <button className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>📂 파일 등록</button>
            </div>

            {activeTab === 'list' && (
                <div className="card" style={{ padding: 0 }}>
                    <div className="alert alert-info" style={{ margin: '1rem 1rem 0', borderRadius: '0.5rem' }}>
                        💡 셀을 클릭하면 직접 수정할 수 있습니다. Enter로 저장, Esc로 취소합니다.
                    </div>
                    {assets?.length > 0 ? (
                        <div className="table-wrapper" style={{ maxHeight: '65vh', overflow: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px' }}>
                                            <input type="checkbox" onChange={toggleSelectAll} checked={selectedRows.size === assets.length} />
                                        </th>
                                        {columns.map(col => <th key={col}>{col}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {assets.map((row, idx) => (
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
                                            {columns.map(col => (
                                                <td
                                                    key={col}
                                                    className="editable"
                                                    onClick={() => handleCellClick(idx, col)}
                                                >
                                                    {editingCell?.row === idx && editingCell?.col === col ? (
                                                        <input
                                                            autoFocus
                                                            value={editValue}
                                                            onChange={e => setEditValue(e.target.value)}
                                                            onBlur={handleCellSave}
                                                            onKeyDown={handleKeyDown}
                                                        />
                                                    ) : (
                                                        row[col] !== null ? String(row[col]) : '-'
                                                    )}
                                                </td>
                                            ))}
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

            {activeTab === 'upload' && (
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
                    <div style={{ marginTop: '1rem' }}>
                        <button className="btn" onClick={handleDownload}>📥 현재 데이터 CSV 다운로드</button>
                    </div>
                </div>
            )}
        </div>
    )
}

export default AssetList

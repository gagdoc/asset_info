import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useToast } from '../components/Toast'

const Resign = () => {
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const [activeTab, setActiveTab] = useState('register')

    const { data: resigns, isLoading } = useQuery({
        queryKey: ['assets', 'Resign'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/Resign')
            return data
        }
    })

    return (
        <div>
            <h1>👋 퇴사자 관리</h1>
            <div className="alert alert-info">
                이메일을 입력하면 <strong>보유 중인 모든 자산 정보가 자동으로 채워집니다.</strong><br />
                반납 처리를 하려면 해당 행을 선택하고 버튼을 클릭하세요.
            </div>

            <div className="tabs">
                <button className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`} onClick={() => setActiveTab('register')}>➕ 퇴사 예정자 등록</button>
                <button className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>📋 리스트 & 반납 처리</button>
            </div>

            {activeTab === 'register' && <RegisterTab queryClient={queryClient} addToast={addToast} />}
            {activeTab === 'list' && <ListTab resigns={resigns} isLoading={isLoading} queryClient={queryClient} addToast={addToast} />}
        </div>
    )
}

const RegisterTab = ({ queryClient, addToast }) => {
    const [email, setEmail] = useState('')
    const [resignDate, setResignDate] = useState('')
    const [submitting, setSubmitting] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!email.trim()) {
            addToast('이메일을 입력해주세요.', 'error')
            return
        }
        setSubmitting(true)
        try {
            await axios.post('/api/assets/resign/register', {
                email: email.trim(),
                resign_date: resignDate,
            })
            addToast(`✅ ${email} 등록 및 자산 정보 연동 완료!`, 'success')
            setEmail('')
            setResignDate('')
            queryClient.invalidateQueries(['assets', 'Resign'])
        } catch (err) {
            addToast('등록 실패: ' + (err.response?.data?.detail || err.message), 'error')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="card">
            <h3>➕ 새 퇴사 예정자 등록</h3>
            <form onSubmit={handleSubmit}>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">퇴사 예정일</label>
                        <input className="form-input" type="date" value={resignDate} onChange={e => setResignDate(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">이메일 주소 *</label>
                        <input className="form-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@stryker.com" required />
                    </div>
                </div>
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                    {submitting ? '처리 중...' : '🚀 등록 및 자산 자동 채우기'}
                </button>
            </form>
        </div>
    )
}

const ListTab = ({ resigns, isLoading, queryClient, addToast }) => {
    const [selectedRows, setSelectedRows] = useState(new Set())

    if (isLoading) return <div className="loading"><div className="spinner" /> 로딩중...</div>

    const columns = resigns?.length > 0 ? Object.keys(resigns[0]) : []
    const priorityCols = ['년', 'F', '월', '날짜', 'NAME', 'email', '설명', 'BU', '노트북', '아이패드', '모니터', '복합기', 'Teams', '추가사항']
    const orderedCols = priorityCols.filter(c => columns.includes(c))
    const otherCols = columns.filter(c => !priorityCols.includes(c))
    const displayCols = [...orderedCols, ...otherCols]

    // ── Asset Return ──
    const handleReturn = async () => {
        if (selectedRows.size === 0) return
        let count = 0
        for (const idx of selectedRows) {
            const row = resigns[idx]
            if (!row?.email) continue
            try {
                const { data } = await axios.post('/api/assets/resign/return', {
                    email: row.email,
                    name: row.NAME,
                    bu: row.BU,
                })
                if (data.success) {
                    addToast(`${row.email}: ${data.message}`, 'success')
                    count++
                } else {
                    addToast(`${row.email}: ${data.message}`, 'info')
                }
            } catch (err) {
                addToast(`${row.email}: 처리 실패`, 'error')
            }
        }
        if (count > 0) {
            queryClient.invalidateQueries(['assets', 'Resign'])
            setSelectedRows(new Set())
        }
    }

    // ── Delete from master ──
    const handleDeleteMaster = async () => {
        if (selectedRows.size === 0) return
        if (!confirm('선택된 퇴사자를 마스터 DB에서 영구 삭제하시겠습니까?')) return

        for (const idx of selectedRows) {
            const row = resigns[idx]
            if (!row?.email) continue

            // First return assets
            try {
                await axios.post('/api/assets/resign/return', { email: row.email, name: row.NAME, bu: row.BU })
            } catch (e) { /* ignore */ }

            // Then delete from master
            try {
                const { data } = await axios.post('/api/assets/resign/delete-master', { email: row.email, name: row.NAME })
                if (data.success) {
                    addToast(`✅ ${row.NAME || row.email} 삭제 완료`, 'success')
                } else {
                    addToast(`❌ ${row.NAME || row.email}: ${data.message}`, 'error')
                }
            } catch (err) {
                addToast(`삭제 실패: ${row.email}`, 'error')
            }
        }
        queryClient.invalidateQueries(['assets', 'Resign'])
        queryClient.invalidateQueries(['dashboardSummary'])
        setSelectedRows(new Set())
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div className="flex gap-1">
                    <button className="btn btn-sm" disabled={selectedRows.size === 0} onClick={handleReturn}>
                        🔄 선택된 퇴사자 반납 처리 ({selectedRows.size})
                    </button>
                    <button className="btn btn-danger btn-sm" disabled={selectedRows.size === 0} onClick={handleDeleteMaster}>
                        🏃‍♂️ 퇴사 확정 (마스터 삭제)
                    </button>
                </div>
                <div className="flex gap-1">
                    <button className="btn btn-sm" onClick={() => window.open('/api/assets/Resign/download', '_blank')}>📥 CSV</button>
                    <button className="btn btn-sm" onClick={() => queryClient.invalidateQueries(['assets', 'Resign'])}>🔄 새로고침</button>
                </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
                {resigns?.length > 0 ? (
                    <div className="table-wrapper" style={{ maxHeight: '60vh', overflow: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}><input type="checkbox" onChange={() => {
                                        selectedRows.size === resigns.length ? setSelectedRows(new Set()) : setSelectedRows(new Set(resigns.map((_, i) => i)))
                                    }} checked={selectedRows.size === resigns?.length} /></th>
                                    {displayCols.map(col => <th key={col}>{col}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {resigns.map((row, idx) => (
                                    <tr key={idx}>
                                        <td className="checkbox-cell">
                                            <input type="checkbox" checked={selectedRows.has(idx)}
                                                onChange={(e) => {
                                                    const s = new Set(selectedRows)
                                                    e.target.checked ? s.add(idx) : s.delete(idx)
                                                    setSelectedRows(s)
                                                }} />
                                        </td>
                                        {displayCols.map(col => (
                                            <td key={col}>{row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>퇴사 예정자가 없습니다.</p>
                )}
            </div>
        </div>
    )
}

export default Resign

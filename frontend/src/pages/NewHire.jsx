import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useToast } from '../components/Toast'

// Google Sheets '신규입사자' 탭 컬럼 우선 표시 순서
const PRIORITY_COLS = [
    '년', '월', '날짜', '이름', 'NAME', 'email', 'BU', 'ROLE',
    'FTE/Cont.', '노트북', '아이패드', '모니터', '복합기', 'Teams', '추가사항'
]

const NewHire = () => {
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const [activeTab, setActiveTab] = useState('register')

    const { data: newhires, isLoading, isFetching, dataUpdatedAt } = useQuery({
        queryKey: ['assets', 'NewHire'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/NewHire')
            return data
        },
        staleTime: 0,               // 항상 최신 데이터 확인
        refetchOnWindowFocus: false,
    })

    const { data: deptConfig } = useQuery({
        queryKey: ['deptConfig'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/config/dept')
            return data
        }
    })

    // 컬럼 우선순위 정렬 (Google Sheets 컬럼 기준)
    const rawCols = newhires?.length > 0 ? Object.keys(newhires[0]) : []
    const ordered = PRIORITY_COLS.filter(c => rawCols.includes(c))
    const others  = rawCols.filter(c => !PRIORITY_COLS.includes(c))
    const columns = [...ordered, ...others]

    const lastUpdated = dataUpdatedAt
        ? new Date(dataUpdatedAt).toLocaleTimeString('ko-KR')
        : null

    return (
        <div>
            <h1>👋 신규 입사자 관리</h1>
            <div className="alert alert-info">
                <strong>📊 Google Sheets "신규입사자" 탭</strong>과 실시간 연동됩니다.
                시트를 수정한 후 새로고침 버튼을 누르면 바로 반영됩니다.
            </div>

            <div className="tabs">
                <button
                    className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`}
                    onClick={() => setActiveTab('register')}
                >➕ 입사자 등록</button>
                <button
                    className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
                    onClick={() => setActiveTab('list')}
                >📋 리스트 관리</button>
            </div>

            {activeTab === 'register' && (
                <RegisterForm
                    deptConfig={deptConfig}
                    queryClient={queryClient}
                    addToast={addToast}
                />
            )}
            {activeTab === 'list' && (
                <ListTab
                    newhires={newhires}
                    columns={columns}
                    isLoading={isLoading}
                    isFetching={isFetching}
                    lastUpdated={lastUpdated}
                    queryClient={queryClient}
                    addToast={addToast}
                />
            )}
        </div>
    )
}

// ── 등록 폼 ─────────────────────────────────────────────
const RegisterForm = ({ deptConfig, queryClient, addToast }) => {
    const [form, setForm] = useState({
        join_date: '', NAME: '', korean_name: '', email: '', BU: '', ROLE: ''
    })

    const buList = deptConfig?.bu_list || []
    const roleList = deptConfig?.data
        ?.filter(d => d.BU === form.BU && d.ROLE)
        ?.map(d => d.ROLE) || []

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.email || !form.join_date) {
            addToast('이메일과 입사 일자를 입력해주세요.', 'error')
            return
        }
        try {
            await axios.post('/api/assets/newhire/register', form)
            addToast(`✅ ${form.email} 등록 완료`, 'success')
            setForm({ join_date: '', NAME: '', korean_name: '', email: '', BU: '', ROLE: '' })
            queryClient.invalidateQueries(['assets', 'NewHire'])
        } catch (err) {
            addToast('등록 실패: ' + (err.response?.data?.detail || err.message), 'error')
        }
    }

    return (
        <div className="card">
            <h3>➕ 새 입사자 등록</h3>
            <form onSubmit={handleSubmit}>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">입사 일자 *</label>
                        <input
                            type="date"
                            className="form-input"
                            value={form.join_date}
                            onChange={e => setForm({ ...form, join_date: e.target.value })}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">영문 이름 (NAME)</label>
                        <input
                            className="form-input"
                            value={form.NAME}
                            onChange={e => setForm({ ...form, NAME: e.target.value })}
                            placeholder="John Doe"
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">한글 이름</label>
                        <input
                            className="form-input"
                            value={form.korean_name}
                            onChange={e => setForm({ ...form, korean_name: e.target.value })}
                            placeholder="홍길동"
                        />
                    </div>
                    <div className="form-group">
                        <label className="form-label">이메일 *</label>
                        <input
                            className="form-input"
                            type="email"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                            placeholder="user@stryker.com"
                            required
                        />
                    </div>
                </div>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">BU</label>
                        <select
                            className="form-input"
                            value={form.BU}
                            onChange={e => setForm({ ...form, BU: e.target.value, ROLE: '' })}
                        >
                            <option value="">선택...</option>
                            {buList.map(bu => <option key={bu} value={bu}>{bu}</option>)}
                        </select>
                    </div>
                    <div className="form-group">
                        <label className="form-label">ROLE</label>
                        <select
                            className="form-input"
                            value={form.ROLE}
                            onChange={e => setForm({ ...form, ROLE: e.target.value })}
                        >
                            <option value="">선택...</option>
                            {roleList.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                    </div>
                </div>
                <button className="btn btn-primary" type="submit">🚀 등록</button>
            </form>
        </div>
    )
}

// ── 리스트 탭 ────────────────────────────────────────────
const ListTab = ({ newhires, columns, isLoading, isFetching, lastUpdated, queryClient, addToast }) => {
    const [selectedRows, setSelectedRows] = useState(new Set())

    // Google Sheets 새로고침
    const handleRefresh = () => {
        queryClient.invalidateQueries(['assets', 'NewHire'])
        addToast('📊 Google Sheets에서 최신 데이터를 불러옵니다...', 'info')
    }

    // 신규입사자 → All_User 동기화
    const handleSync = async () => {
        try {
            const { data } = await axios.post('/api/assets/newhire/sync')
            addToast(`✅ ${data.message}`, 'success')
            queryClient.invalidateQueries(['dashboardSummary'])
            queryClient.invalidateQueries(['assets', 'All_User'])
        } catch (err) {
            addToast('동기화 실패', 'error')
        }
    }

    // 선택 행 삭제 (Google Sheets에도 반영)
    const handleDeleteSelected = async () => {
        if (selectedRows.size === 0) return
        if (!confirm(`선택한 ${selectedRows.size}명을 신규입사자 목록에서 삭제하시겠습니까?`)) return

        const remaining = newhires.filter((_, idx) => !selectedRows.has(idx))
        try {
            await axios.post('/api/assets/NewHire/save', remaining)
            addToast(`✅ ${selectedRows.size}명 삭제 완료`, 'success')
            setSelectedRows(new Set())
            queryClient.invalidateQueries(['assets', 'NewHire'])
        } catch (err) {
            addToast('삭제 실패: ' + (err.response?.data?.detail || err.message), 'error')
        }
    }

    if (isLoading) return <div className="loading"><div className="spinner" /> 로딩중...</div>

    return (
        <div>
            {/* 상단 액션바 */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex gap-1" style={{ alignItems: 'center' }}>
                    <h3 style={{ margin: 0 }}>
                        신규 입사자 리스트 ({newhires?.length || 0}명)
                    </h3>
                    {lastUpdated && (
                        <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.5rem' }}>
                            마지막 업데이트: {lastUpdated}
                        </span>
                    )}
                </div>
                <div className="flex gap-1">
                    <button
                        className="btn btn-sm"
                        onClick={handleRefresh}
                        disabled={isFetching}
                        title="Google Sheets에서 최신 데이터 불러오기"
                    >
                        {isFetching ? '⏳ 불러오는 중...' : '🔄 Sheets 새로고침'}
                    </button>
                    <button className="btn btn-success btn-sm" onClick={handleSync}>
                        📤 마스터 DB 동기화
                    </button>
                    <button
                        className="btn btn-danger btn-sm"
                        onClick={handleDeleteSelected}
                        disabled={selectedRows.size === 0}
                    >
                        🗑 선택 삭제 ({selectedRows.size})
                    </button>
                    <button
                        className="btn btn-sm"
                        onClick={() => window.open('/api/assets/NewHire/download', '_blank')}
                    >
                        📥 CSV
                    </button>
                </div>
            </div>

            {/* 데이터 테이블 */}
            <div className="card" style={{ padding: 0 }}>
                {newhires?.length > 0 ? (
                    <div className="table-wrapper" style={{ maxHeight: '60vh', overflow: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '40px' }}>
                                        <input
                                            type="checkbox"
                                            checked={selectedRows.size === newhires.length && newhires.length > 0}
                                            onChange={() => {
                                                selectedRows.size === newhires.length
                                                    ? setSelectedRows(new Set())
                                                    : setSelectedRows(new Set(newhires.map((_, i) => i)))
                                            }}
                                        />
                                    </th>
                                    {columns.map(col => <th key={col}>{col}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {newhires.map((row, idx) => (
                                    <tr
                                        key={idx}
                                        style={selectedRows.has(idx) ? { background: 'rgba(99,102,241,0.08)' } : {}}
                                    >
                                        <td className="checkbox-cell">
                                            <input
                                                type="checkbox"
                                                checked={selectedRows.has(idx)}
                                                onChange={(e) => {
                                                    const s = new Set(selectedRows)
                                                    e.target.checked ? s.add(idx) : s.delete(idx)
                                                    setSelectedRows(s)
                                                }}
                                            />
                                        </td>
                                        {columns.map(col => (
                                            <td key={col}>
                                                {row[col] !== null && row[col] !== undefined
                                                    ? String(row[col])
                                                    : '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                        등록된 입사 예정자가 없습니다.
                    </p>
                )}
            </div>
        </div>
    )
}

export default NewHire

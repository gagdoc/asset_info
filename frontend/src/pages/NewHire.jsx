import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { FaSort, FaSortUp, FaSortDown } from 'react-icons/fa'
import { exportToXLSX, todayStr } from '../utils/exportUtils'
import { useToast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'

// Google Sheets '신규입사자' 탭 컬럼 우선 표시 순서
const PRIORITY_COLS = [
    '입사일자', '이름', 'NAME', 'email', 'BU', 'ROLE',
    'FTE/Cont.', '노트북', '아이패드', '모니터', '복합기', 'Teams', '추가사항'
]

// 수정 가능한 필드 목록
const EDITABLE_FIELDS = ['이름', 'NAME', 'email', 'BU', 'ROLE', 'FTE/Cont.', '추가사항']

const NewHire = () => {
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const [activeTab, setActiveTab] = useState('list')

    const { data: newhires, isLoading, isFetching, dataUpdatedAt } = useQuery({
        queryKey: ['assets', 'NewHire'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/NewHire')
            return data
        },
        staleTime: 0,
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
    const hiddenCols = ['년', '월', '날짜']
    const displayCols = rawCols.filter(c => !hiddenCols.includes(c) && !c.startsWith('_IS_'))

    const ordered = PRIORITY_COLS.filter(c => c === '입사일자' || displayCols.includes(c))
    const others  = displayCols.filter(c => !PRIORITY_COLS.includes(c))
    const columns = [...ordered, ...others]
    if (!columns.includes('입사일자') && newhires?.length > 0) {
        columns.unshift('입사일자')
    }

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
                    className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`}
                    onClick={() => setActiveTab('list')}
                >📋 리스트 관리</button>
                <button
                    className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`}
                    onClick={() => setActiveTab('register')}
                >➕ 입사자 등록</button>
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
                    deptConfig={deptConfig}
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

    const handleEmailBlur = async () => {
        if (!form.email || !form.email.includes('@')) return;
        try {
            const { data } = await axios.get(`/api/assets/user/lookup/${encodeURIComponent(form.email.trim())}`);
            setForm(prev => ({
                ...prev,
                NAME: prev.NAME || data.NAME || '',
                korean_name: prev.korean_name || data.korean_name || '',
                BU: prev.BU || data.BU || '',
                ROLE: prev.ROLE || data.ROLE || ''
            }));
            const name = data.korean_name ? `${data.korean_name}(${data.NAME})` : data.NAME;
            if (name) addToast(`✅ ${name} 님의 기본 정보를 불러왔습니다.`, 'success');
        } catch (e) {
            // New hires are often not in All_User, ignore error silently
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!form.join_date) {
            addToast('입사 일자를 입력해주세요.', 'error')
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
                        <label className="form-label">이메일</label>
                        <input
                            className="form-input"
                            type="email"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                            onBlur={handleEmailBlur}
                            placeholder="user@stryker.com"
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

// ── 수정 모달 ────────────────────────────────────────────
const EditModal = ({ row, actualIndex, deptConfig, onSave, onClose }) => {
    const [form, setForm] = useState({
        이름:    row?.['이름']    || '',
        NAME:    row?.['NAME']    || '',
        email:   row?.['email']   || '',
        BU:      row?.['BU']      || '',
        ROLE:    row?.['ROLE']    || '',
        'FTE/Cont.': row?.['FTE/Cont.'] || '',
        추가사항: row?.['추가사항'] || '',
    })
    const [saving, setSaving] = useState(false)
    // 수정 시작 시점의 원본 이메일 (All_User 탐색용)
    const originalEmail = row?.['email'] || ''

    const buList = deptConfig?.bu_list || []
    const roleList = deptConfig?.data
        ?.filter(d => d.BU === form.BU && d.ROLE)
        ?.map(d => d.ROLE) || []

    const handleSubmit = async (e) => {
        e.preventDefault()
        setSaving(true)
        try {
            // 변경된 필드만 추출
            const updates = {}
            EDITABLE_FIELDS.forEach(field => {
                const original = row?.[field] != null ? String(row[field]) : ''
                const current  = form[field] != null ? String(form[field]) : ''
                if (current !== original) updates[field] = current
            })
            if (Object.keys(updates).length === 0) {
                onClose()
                return
            }
            await onSave(actualIndex, originalEmail, updates)
        } finally {
            setSaving(false)
        }
    }

    return (
        <div
            style={{
                position: 'fixed', inset: 0,
                background: 'rgba(0,0,0,0.45)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 1000,
                backdropFilter: 'blur(2px)',
            }}
            onClick={e => { if (e.target === e.currentTarget) onClose() }}
        >
            <div style={{
                background: 'var(--card-background, #fff)',
                borderRadius: '14px',
                padding: '2rem',
                width: '100%',
                maxWidth: '520px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                maxHeight: '90vh',
                overflowY: 'auto',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
                    <h3 style={{ margin: 0 }}>✏️ 입사자 정보 수정</h3>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none', border: 'none', fontSize: '1.4rem',
                            cursor: 'pointer', color: '#6b7280', lineHeight: 1,
                        }}
                    >×</button>
                </div>

                {/* 읽기 전용 입사일자 */}
                {row?.['입사일자'] && (
                    <div style={{
                        background: 'rgba(99,102,241,0.07)',
                        borderRadius: '8px',
                        padding: '0.5rem 0.9rem',
                        marginBottom: '1rem',
                        fontSize: '0.875rem',
                        color: '#4b5563',
                    }}>
                        📅 입사일자: <strong>{row['입사일자']}</strong>
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">한글 이름</label>
                            <input
                                className="form-input"
                                value={form['이름']}
                                onChange={e => setForm({ ...form, '이름': e.target.value })}
                                placeholder="홍길동"
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
                    </div>
                    <div className="form-group">
                        <label className="form-label">이메일</label>
                        <input
                            className="form-input"
                            type="email"
                            value={form.email}
                            onChange={e => setForm({ ...form, email: e.target.value })}
                            placeholder="user@example.com"
                        />
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
                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">FTE/Cont.</label>
                            <input
                                className="form-input"
                                value={form['FTE/Cont.']}
                                onChange={e => setForm({ ...form, 'FTE/Cont.': e.target.value })}
                                placeholder="FTE / Contractor"
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">추가사항</label>
                            <input
                                className="form-input"
                                value={form['추가사항']}
                                onChange={e => setForm({ ...form, '추가사항': e.target.value })}
                                placeholder="메모..."
                            />
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1.25rem' }}>
                        <button
                            type="button"
                            className="btn btn-sm"
                            onClick={onClose}
                            disabled={saving}
                        >취소</button>
                        <button
                            type="submit"
                            className="btn btn-primary btn-sm"
                            disabled={saving}
                        >{saving ? '저장 중...' : '💾 저장'}</button>
                    </div>
                </form>
            </div>
        </div>
    )
}

// ── 리스트 탭 ────────────────────────────────────────────
const ListTab = ({ newhires, columns, isLoading, isFetching, lastUpdated, queryClient, addToast, deptConfig }) => {
    const [selectedRows, setSelectedRows] = useState(new Set())
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
    const [editTarget, setEditTarget] = useState(null) // { row, actualIndex }

    // 정렬 상태
    const [sortCol, setSortCol] = useState('입사일자')
    const [sortDir, setSortDir] = useState('desc')

    const handleSort = (col) => {
        if (sortCol === col) {
            setSortDir(d => d === 'asc' ? 'desc' : 'asc')
        } else {
            setSortCol(col)
            setSortDir('asc')
        }
    }

    const SortIcon = ({ col }) => {
        if (sortCol !== col) return <FaSort style={{ opacity: 0.3, marginLeft: '0.3rem', verticalAlign: 'middle', cursor: 'pointer' }} />
        return sortDir === 'asc'
            ? <FaSortUp style={{ marginLeft: '0.3rem', color: 'var(--primary-color)', verticalAlign: 'middle', cursor: 'pointer' }} />
            : <FaSortDown style={{ marginLeft: '0.3rem', color: 'var(--primary-color)', verticalAlign: 'middle', cursor: 'pointer' }} />
    }

    // 정렬된 신규 입사자 목록 계산
    const sortedNewHires = useMemo(() => {
        if (!newhires) return []
        const list = newhires.map(row => {
            let y = String(row['년'] || '').trim()
            let m = String(row['월'] || '').trim().padStart(2, '0')
            let d = String(row['날짜'] || '').trim().padStart(2, '0')
            let joinStr = (y && y !== '0' && y !== '0000') ? `${y}/${m}/${d}` : ''
            return { ...row, '입사일자': joinStr }
        })

        if (!sortCol) return list

        list.sort((a, b) => {
            if (sortCol === '입사일자' || sortCol === '날짜') {
                const valA = a['입사일자'] || ''
                const valB = b['입사일자'] || ''
                return sortDir === 'asc'
                    ? valA.localeCompare(valB)
                    : valB.localeCompare(valA)
            }
            if (sortCol === '년' || sortCol === '월') {
                const valA = Number(a[sortCol]) || 0
                const valB = Number(b[sortCol]) || 0
                return sortDir === 'asc' ? valA - valB : valB - valA
            }
            const valA = String(a[sortCol] || '').toLowerCase()
            const valB = String(b[sortCol] || '').toLowerCase()
            return sortDir === 'asc'
                ? valA.localeCompare(valB)
                : valB.localeCompare(valA)
        })

        return list
    }, [newhires, sortCol, sortDir])

    // 행 수정 저장 — 전용 API 사용 (이메일 변경 시 All_User 자동 동기화)
    const handleSaveEdit = async (actualIndex, originalEmail, updates) => {
        try {
            await axios.put('/api/assets/newhire/update-row', {
                row_index: actualIndex,
                original_email: originalEmail,
                updates,
            })
            addToast('✅ 수정 완료 (대시보드 동기화됨)', 'success')
            queryClient.invalidateQueries(['assets', 'NewHire'])
            queryClient.invalidateQueries(['dashboardSummary'])
            setEditTarget(null)
        } catch (err) {
            addToast('수정 실패: ' + (err.response?.data?.detail || err.message), 'error')
        }
    }

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

    // 선택 행 삭제
    const handleDeleteSelected = async () => {
        if (selectedRows.size === 0) return
        setIsDeleteModalOpen(true)
    }

    const confirmDelete = async () => {
        const selectedIndicesInOriginal = new Set(
            Array.from(selectedRows).map(sortedIdx => {
                const item = sortedNewHires[sortedIdx]
                return newhires.indexOf(item)
            }).filter(idx => idx !== -1)
        )
        const remaining = newhires.filter((_, idx) => !selectedIndicesInOriginal.has(idx))
        try {
            await axios.post('/api/assets/NewHire/save', remaining)
            addToast(`✅ ${selectedRows.size}명 삭제 완료`, 'success')
            setSelectedRows(new Set())
            queryClient.invalidateQueries(['assets', 'NewHire'])
        } catch (err) {
            addToast('삭제 실패: ' + (err.response?.data?.detail || err.message), 'error')
        } finally {
            setIsDeleteModalOpen(false)
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
                        style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #86efac', fontWeight: '600' }}
                        onClick={async () => {
                            const rows = sortedNewHires || []
                            const cols = rows.length ? Object.keys(rows[0]).map(k => ({ key: k, label: k })) : []
                            await exportToXLSX({ filename: `신규입사자_${todayStr()}`, columns: cols, rows })
                        }}
                        disabled={!newhires || newhires.length === 0}
                    >
                        📥 엑셀 내보내기
                    </button>
                </div>
            </div>

            {/* 안내 문구 */}
            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '0.5rem' }}>
                💡 행을 클릭하면 정보를 수정할 수 있습니다.
            </p>

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
                                            checked={selectedRows.size === sortedNewHires.length && sortedNewHires.length > 0}
                                            onChange={() => {
                                                selectedRows.size === sortedNewHires.length
                                                    ? setSelectedRows(new Set())
                                                    : setSelectedRows(new Set(sortedNewHires.map((_, i) => i)))
                                            }}
                                        />
                                    </th>
                                    <th style={{ width: '56px' }}>수정</th>
                                    {columns.map(col => {
                                        const sortable = ['입사일자', '년', '월', '날짜', '이름', 'NAME', 'email', 'BU', 'ROLE'].includes(col)
                                        return (
                                            <th
                                                key={col}
                                                onClick={() => sortable && handleSort(col)}
                                                style={sortable ? { cursor: 'pointer', userSelect: 'none' } : {}}
                                            >
                                                {col}
                                                {sortable && <SortIcon col={col} />}
                                            </th>
                                        )
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {sortedNewHires.map((row, idx) => {
                                    const actualIndex = newhires.indexOf(row)

                                    return (
                                        <tr
                                            key={idx}
                                            style={
                                                selectedRows.has(idx)
                                                    ? { background: 'rgba(99,102,241,0.08)' }
                                                    : row.is_resigned
                                                        ? { background: 'rgba(239, 68, 68, 0.04)', color: '#9ca3af' }
                                                        : {}
                                            }
                                        >
                                            {/* 체크박스 */}
                                            <td className="checkbox-cell" onClick={e => e.stopPropagation()}>
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
                                            {/* 수정 버튼 */}
                                            <td style={{ textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                <button
                                                    title="수정"
                                                    onClick={() => setEditTarget({ row, actualIndex })}
                                                    style={{
                                                        background: 'none',
                                                        border: '1px solid #d1d5db',
                                                        borderRadius: '6px',
                                                        padding: '2px 8px',
                                                        cursor: 'pointer',
                                                        fontSize: '0.8rem',
                                                        color: '#374151',
                                                        transition: 'all 0.15s',
                                                    }}
                                                    onMouseEnter={e => {
                                                        e.currentTarget.style.background = 'rgba(99,102,241,0.08)'
                                                        e.currentTarget.style.borderColor = 'var(--primary-color, #6366f1)'
                                                        e.currentTarget.style.color = 'var(--primary-color, #6366f1)'
                                                    }}
                                                    onMouseLeave={e => {
                                                        e.currentTarget.style.background = 'none'
                                                        e.currentTarget.style.borderColor = '#d1d5db'
                                                        e.currentTarget.style.color = '#374151'
                                                    }}
                                                >
                                                    ✏️
                                                </button>
                                            </td>
                                            {/* 데이터 셀 */}
                                            {columns.map(col => (
                                                <td key={col}>
                                                    {row[col] !== null && row[col] !== undefined && row[col] !== ''
                                                        ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={col === '이름' && row.is_resigned ? { textDecoration: 'line-through' } : {}}>
                                                                    {String(row[col])}
                                                                </span>
                                                                {col === '이름' && row.is_resigned && (
                                                                    <span style={{
                                                                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                                                        color: 'var(--danger-color)',
                                                                        fontSize: '0.72rem',
                                                                        padding: '1px 5px',
                                                                        borderRadius: '4px',
                                                                        fontWeight: 'bold',
                                                                        border: '1px solid rgba(239, 68, 68, 0.2)',
                                                                        whiteSpace: 'nowrap'
                                                                    }}>
                                                                        퇴사자
                                                                    </span>
                                                                )}
                                                            </div>
                                                        )
                                                        : '-'
                                                    }
                                                </td>
                                            ))}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>
                        등록된 입사 예정자가 없습니다.
                    </p>
                )}
            </div>

            {/* 수정 모달 */}
            {editTarget && (
                <EditModal
                    row={editTarget.row}
                    actualIndex={editTarget.actualIndex}
                    deptConfig={deptConfig}
                    onSave={handleSaveEdit}
                    onClose={() => setEditTarget(null)}
                />
            )}

            <ConfirmModal
                isOpen={isDeleteModalOpen}
                message={`선택한 ${selectedRows.size}명을 신규입사자 목록에서 삭제하시겠습니까?`}
                onConfirm={confirmDelete}
                onCancel={() => setIsDeleteModalOpen(false)}
            />
        </div>
    )
}

export default NewHire

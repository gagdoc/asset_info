import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { exportToXLSX, todayStr } from '../utils/exportUtils'
import { useToast } from '../components/Toast'
import ConfirmModal from '../components/ConfirmModal'

// Google Sheets '신규입사자' 탭 컬럼 우선 표시 순서
const PRIORITY_COLS = [
    '년', '월', '날짜', '이름', 'NAME', 'email', 'BU', 'ROLE',
    'FTE/Cont.', '노트북', '아이패드', '모니터', '복합기', 'Teams', '추가사항'
]

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

// ── 리스트 탭 ────────────────────────────────────────────
import { FaSort, FaSortUp, FaSortDown } from 'react-icons/fa'

const ListTab = ({ newhires, columns, isLoading, isFetching, lastUpdated, queryClient, addToast }) => {
    const [selectedRows, setSelectedRows] = useState(new Set())
    const [editingCell, setEditingCell] = useState(null) // { idx, col }
    const [editValue, setEditValue] = useState('')
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)

    // 정렬 상태
    const [sortCol, setSortCol] = useState('날짜') // 기본값 '날짜'
    const [sortDir, setSortDir] = useState('desc') // 기본값 최신 날짜 우선

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
        const list = [...newhires]
        
        if (!sortCol) return list

        list.sort((a, b) => {
            // 날짜 정렬 처리
            if (sortCol === '날짜') {
                const valA = a['날짜'] || ''
                const valB = b['날짜'] || ''
                return sortDir === 'asc' 
                    ? valA.localeCompare(valB) 
                    : valB.localeCompare(valA)
            }
            
            // 년, 월 정렬 처리
            if (sortCol === '년' || sortCol === '월') {
                const valA = Number(a[sortCol]) || 0
                const valB = Number(b[sortCol]) || 0
                return sortDir === 'asc' ? valA - valB : valB - valA
            }

            // 일반 문자열 정렬
            const valA = String(a[sortCol] || '').toLowerCase()
            const valB = String(b[sortCol] || '').toLowerCase()
            return sortDir === 'asc'
                ? valA.localeCompare(valB)
                : valB.localeCompare(valA)
        })

        return list
    }, [newhires, sortCol, sortDir])

    const handleCellEdit = async (actualIndex, col, value) => {
        try {
            await axios.put('/api/assets/row/update', {
                asset_type: 'NewHire',
                row_index: actualIndex,
                updates: { [col]: value }
            })
            addToast('✅ 수정 완료', 'success')
            queryClient.invalidateQueries(['assets', 'NewHire'])
        } catch (err) {
            addToast('수정 실패', 'error')
        }
        setEditingCell(null)
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

    // 선택 행 삭제 (Google Sheets에도 반영)
    const handleDeleteSelected = async () => {
        if (selectedRows.size === 0) return
        setIsDeleteModalOpen(true)
    }

    const confirmDelete = async () => {
        // 실제 newhires 배열 기준 필터링 (선택된 row는 정렬 기준 map index 이므로 mapping 객체 또는 filter 활용 필요)
        // selectedRows는 sortedNewHires의 index를 가지고 있으므로, 실제 원본 newhires의 index로 치환해야 함
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
                            // 현재 보이는 정렬 상태 기준으로 엑셀 내보내기
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
                                    {columns.map(col => {
                                        const sortable = ['년', '월', '날짜', '이름', 'NAME', 'email', 'BU', 'ROLE'].includes(col)
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
                                    // 원본 newhires 배열에서의 실제 인덱스 구하기
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
                                            {columns.map(col => {
                                                const isEditable = ['이름', 'NAME', 'email', 'BU', 'ROLE', '추가사항'].includes(col)
                                                const isEditing = editingCell?.idx === actualIndex && editingCell?.col === col

                                                return (
                                                    <td 
                                                        key={col} 
                                                        onDoubleClick={() => {
                                                            if (isEditable) {
                                                                setEditingCell({ idx: actualIndex, col })
                                                                setEditValue(row[col] || '')
                                                            }
                                                        }}
                                                        style={isEditable ? { cursor: 'pointer' } : {}}
                                                        title={isEditable ? '더블 클릭하여 수정' : ''}
                                                    >
                                                        {isEditing ? (
                                                            <input
                                                                autoFocus
                                                                className="form-input"
                                                                style={{ padding: '2px 4px', fontSize: '0.9em' }}
                                                                value={editValue}
                                                                onChange={e => setEditValue(e.target.value)}
                                                                onBlur={() => handleCellEdit(actualIndex, col, editValue)}
                                                                onKeyDown={e => {
                                                                    if (e.key === 'Enter') handleCellEdit(actualIndex, col, editValue)
                                                                    if (e.key === 'Escape') setEditingCell(null)
                                                                }}
                                                            />
                                                        ) : (
                                                            row[col] !== null && row[col] !== undefined && row[col] !== ''
                                                                ? (
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                        <span style={col === '이름' && row.is_resigned ? { textDecoration: 'line-through' } : {}}>{String(row[col])}</span>
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
                                                        )}
                                                    </td>
                                                )
                                            })}
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

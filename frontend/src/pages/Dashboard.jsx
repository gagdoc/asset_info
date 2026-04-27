import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
// exportUtils 불필요 (우측 상단 엑셀 버튼 제거됨)

// 시리얼 번호 존재 여부 판단 헬퍼
const hasSerial = (val) => {
    const s = String(val || '').trim()
    return s !== '' && s !== '-' && s !== 'null' && s !== 'undefined'
}

// ── 내보내기 가능한 항목 정의 ──────────────────────────
const EXPORT_ITEMS = [
    { key: 'Lease',     label: '노트북 (Lease)' },
    { key: 'iPad',      label: '아이패드 (iPad)' },
    { key: 'Monitor',   label: '모니터 (Monitor)' },
    { key: 'Printer',   label: '프린터 (Printer)' },
    { key: 'Teams',     label: 'Teams 번호' },
    { key: 'NewHire',   label: '신규 입사자' },
    { key: 'Resign',    label: '퇴사자 관리' },
    { key: 'Dashboard', label: '📋 자산 통합 상세 조회' },
]

const Dashboard = () => {
    const queryClient = useQueryClient()
    const [searchTerm, setSearchTerm] = useState('')
    const [serialFilter, setSerialFilter] = useState({ laptop: '', ipad: '' })

    // Excel 내보내기 상태
    const [selectedSheets, setSelectedSheets] = useState([])
    const [isExporting, setIsExporting] = useState(false)

    const allSelected = selectedSheets.length === EXPORT_ITEMS.length
    const toggleSheet = (key) =>
        setSelectedSheets(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        )
    const toggleAll = () =>
        setSelectedSheets(allSelected ? [] : EXPORT_ITEMS.map(i => i.key))

    const handleExport = async () => {
        if (selectedSheets.length === 0) return
        setIsExporting(true)
        try {
            const params = selectedSheets.join(',')
            const res = await axios.get(`/api/assets/export?sheets=${params}`, { responseType: 'blob' })
            const url = URL.createObjectURL(new Blob([res.data]))
            const a = document.createElement('a')
            const today = new Date().toISOString().slice(0,10).replace(/-/g,'')
            a.href = url
            a.download = `asset_export_${today}.xlsx`
            a.click()
            URL.revokeObjectURL(url)
        } catch (e) {
            alert('Excel 내보내기 실패: ' + (e.response?.data?.detail || e.message))
        } finally {
            setIsExporting(false)
        }
    }

    // 모달 제어 상태
    const [showResignModal, setShowResignModal] = useState(false)
    
    // 퇴사자 폼
    const [resignForm, setResignForm] = useState({ email: '', resign_date: '' })

    const { data: summary, isLoading: isSummaryLoading } = useQuery({
        queryKey: ['dashboardSummary'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/dashboard')
            return data
        }
    })

    const { data: integratedData, isLoading: isIntegratedLoading } = useQuery({
        queryKey: ['dashboardIntegrated'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/dashboard/integrated')
            return data
        }
    })

    const { data: deptConfig } = useQuery({
        queryKey: ['deptConfig'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/config/dept')
            return data
        }
    })

    const resignMutation = useMutation({
        mutationFn: async (newData) => await axios.post('/api/assets/resign/register', newData),
        onSuccess: () => {
            queryClient.invalidateQueries(['dashboardIntegrated'])
            queryClient.invalidateQueries(['dashboardSummary'])
            setShowResignModal(false)
            setResignForm({ email: '', resign_date: '' })
            alert('👋 퇴사자 처리 완료 (자산반납 명단 이동 및 대시보드 삭제)')
        },
        onError: (err) => alert('오류: ' + err.message)
    })

    const handleResignSubmit = (e) => {
        e.preventDefault()
        if (!resignForm.email || !resignForm.resign_date) {
            alert('이메일과 퇴사 예정일을 선택해주세요.')
            return
        }
        resignMutation.mutate(resignForm)
    }

    if (isSummaryLoading || isIntegratedLoading) return <div className="loading"><div className="spinner" /> 데이터 로딩중...</div>
    
    if (!summary || !integratedData) return (
        <div className="card alert alert-danger">
            ⚠️ 데이터를 불러올 수 없습니다. 서버가 실행 중인지 확인해 주세요.
            <button className="btn btn-sm mt-2" onClick={() => queryClient.invalidateQueries()}>다시 시도</button>
        </div>
    )

    const stats = [
        { label: '총 운용 인원', value: summary?.total_users || 0, suffix: '명', color: '#4f46e5' },
        { label: '노트북 (Lease)', value: summary?.total_lease || 0, suffix: '대', color: '#0ea5e9' },
        { label: '아이패드 (iPad)', value: summary?.total_ipad || 0, suffix: '대', color: '#8b5cf6' },
        { label: '모니터 (Monitor)', value: summary?.total_monitor || 0, suffix: '대', color: '#06b6d4' },
        { label: '프린터 (Printer)', value: summary?.total_printer || 0, suffix: '대', color: '#10b981' },
        { label: 'Teams 번호', value: summary?.total_teams || 0, suffix: '개', color: '#f59e0b' },
        { label: '신규 입사자', value: summary?.total_newhire || 0, suffix: '명', color: '#22c55e' },
        { label: '퇴사 예정', value: summary?.total_resign || 0, suffix: '명', color: '#ef4444' },
    ]

    const filteredData = integratedData?.filter(row => {
        // 텍스트 검색
        if (searchTerm) {
            const matched = Object.values(row).some(val =>
                String(val).toLowerCase().includes(searchTerm.toLowerCase())
            )
            if (!matched) return false
        }
        // 노트북 시리얼 필터
        if (serialFilter.laptop === 'yes' && !hasSerial(row.Lease_List)) return false
        if (serialFilter.laptop === 'no'  &&  hasSerial(row.Lease_List)) return false
        // 아이패드 시리얼 필터
        if (serialFilter.ipad === 'yes' && !hasSerial(row.Ipad_List)) return false
        if (serialFilter.ipad === 'no'  &&  hasSerial(row.Ipad_List)) return false
        return true
    }) || []

    const columns = [
        { key: 'NO', label: 'No.' },
        { key: 'NAME', label: 'NAME' },
        { key: '이름', label: '이름' },
        { key: 'email', label: 'Email' },
        { key: 'BU', label: 'BU' },
        { key: 'ROLE', label: 'ROLE' },
        { key: 'Lease_List', label: '노트북' },
        { key: 'Ipad_List', label: '아이패드' },
        { key: 'Monitor', label: '모니터' },
        { key: 'TeamsNum', label: 'Teams' },
        { key: 'Printer', label: '복합기' },
        { key: '퇴사정보', label: '비고' },
    ]

    const selectedResignUser = integratedData?.find(u => u.email === resignForm.email)

    return (
        <div>
            <div className="dashboard-header-action flex justify-between items-center" style={{ marginBottom: '1rem' }}>
                <h1>📊 통합 자산 현황 (대시보드)</h1>
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <button
                        className="btn btn-secondary"
                        onClick={() => {
                            queryClient.invalidateQueries(['dashboardSummary'])
                            queryClient.invalidateQueries(['dashboardIntegrated'])
                        }}
                    >
                        🔄 최신 정보 불러오기
                    </button>
                    <button className="btn btn-danger" onClick={() => setShowResignModal(true)}>
                        👋 퇴사자 처리
                    </button>
                </div>
            </div>

            {/* ── Excel 내보내기 패널 ─────────────────────────── */}
            <div className="card" style={{
                marginBottom: '1.5rem',
                padding: '1rem 1.25rem',
                border: '1px solid #e0e7ff',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #f5f3ff 0%, #eff6ff 100%)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '0.75rem' }}>
                    <span style={{ fontSize: '1.1rem' }}>📥</span>
                    <strong style={{ fontSize: '0.95rem', color: '#3730a3' }}>데이터 Excel 내보내기</strong>
                    <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>— 원하는 항목을 선택하세요</span>
                </div>

                {/* 체크박스 목록 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '0.85rem' }}>
                    {EXPORT_ITEMS.map(item => (
                        <label key={item.key} style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '4px 12px',
                            borderRadius: '20px',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            fontWeight: selectedSheets.includes(item.key) ? '600' : '400',
                            background: selectedSheets.includes(item.key) ? '#4f46e5' : '#ffffff',
                            color: selectedSheets.includes(item.key) ? '#ffffff' : '#374151',
                            border: `1px solid ${selectedSheets.includes(item.key) ? '#4f46e5' : '#d1d5db'}`,
                            transition: 'all 0.15s',
                            userSelect: 'none',
                        }}>
                            <input
                                type="checkbox"
                                checked={selectedSheets.includes(item.key)}
                                onChange={() => toggleSheet(item.key)}
                                style={{ display: 'none' }}
                            />
                            {selectedSheets.includes(item.key) ? '✓ ' : ''}{item.label}
                        </label>
                    ))}
                </div>

                {/* 버튼 영역 */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <button
                        className="btn btn-secondary"
                        style={{ fontSize: '0.82rem', padding: '5px 14px' }}
                        onClick={toggleAll}
                    >
                        {allSelected ? '✕ 전체 해제' : '☑ 전체 선택'}
                    </button>
                    <button
                        className="btn"
                        style={{
                            fontSize: '0.82rem', padding: '5px 16px',
                            background: selectedSheets.length === 0 ? '#9ca3af' : '#4f46e5',
                            color: '#fff', cursor: selectedSheets.length === 0 ? 'not-allowed' : 'pointer',
                            border: 'none', borderRadius: '6px',
                        }}
                        disabled={selectedSheets.length === 0 || isExporting}
                        onClick={handleExport}
                    >
                        {isExporting ? '⏳ 생성 중...' : `📥 Excel 내보내기 (${selectedSheets.length}개 선택)`}
                    </button>
                    {selectedSheets.length > 0 && (
                        <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>
                            {EXPORT_ITEMS.filter(i => selectedSheets.includes(i.key)).map(i => i.label).join(', ')}
                        </span>
                    )}
                </div>
            </div>

            {/* 퇴사자 처리 모달 */}
            {showResignModal && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div className="modal-content card modal" style={{ padding: '2rem', maxWidth: '600px', width: '100%', backgroundColor: '#fff' }}>
                        <h2 style={{ marginTop: 0, color: '#ef4444' }}>👋 퇴사자 처리 연동</h2>
                        <form onSubmit={handleResignSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                            <div>
                                <label style={{ fontWeight: 'bold' }}>퇴사 대상 이메일 <span style={{color: 'red'}}>*</span></label>
                                <select className="form-input" value={resignForm.email} onChange={e => setResignForm({...resignForm, email: e.target.value})} required>
                                    <option value="">대시보드에서 대상자 선택</option>
                                    {integratedData && [...integratedData].sort((a,b) => a.NAME.localeCompare(b.NAME)).map(u => (
                                        <option key={u.email} value={u.email}>{u.NAME} ({u.이름}) - {u.email}</option>
                                    ))}
                                </select>
                            </div>
                            
                            {selectedResignUser && (
                                <div style={{ backgroundColor: '#f9fafb', padding: '15px', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '0.9rem' }}>
                                    <h4 style={{ margin: '0 0 10px 0', color: '#4b5563' }}>📋 자동 조회된 자산 내역 (이관 시 첨부됨)</h4>
                                    <div className="form-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                        <div><strong>부서:</strong> {selectedResignUser.BU} / {selectedResignUser.ROLE}</div>
                                        <div><strong>노트북:</strong> {selectedResignUser.Lease_List !== '-' ? selectedResignUser.Lease_List : '없음'}</div>
                                        <div><strong>아이패드:</strong> {selectedResignUser.Ipad_List !== '-' ? selectedResignUser.Ipad_List : '없음'}</div>
                                        <div><strong>모니터:</strong> {selectedResignUser.Monitor !== '-' ? selectedResignUser.Monitor : '없음'}</div>
                                        <div><strong>팀즈:</strong> {selectedResignUser.TeamsNum !== '-' ? selectedResignUser.TeamsNum : '없음'}</div>
                                        <div><strong>복합기:</strong> {selectedResignUser.Printer !== '-' ? selectedResignUser.Printer : '없음'}</div>
                                    </div>
                                </div>
                            )}

                            <div>
                                <label style={{ fontWeight: 'bold' }}>퇴사 일자 <span style={{color: 'red'}}>*</span></label>
                                <input type="date" className="form-input" value={resignForm.resign_date} onChange={e => setResignForm({...resignForm, resign_date: e.target.value})} required />
                            </div>

                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#6b7280' }}>
                                ⚠️ 처리 버튼을 누르면 위 자산 내역과 함께 <strong>'퇴사자 명단'</strong>으로 완전히 이동되며, <strong>대시보드(All_User)</strong> 화면에서는 자동으로 삭제됩니다.
                            </p>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                                <button type="button" className="btn btn-secondary" onClick={() => setShowResignModal(false)}>취소</button>
                                <button type="submit" className="btn btn-danger" disabled={resignMutation.isLoading}>
                                    {resignMutation.isLoading ? '처리 중...' : '자산 이관 및 대시보드에서 삭제'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="dashboard-grid">
                {stats.map(s => (
                    <div className="stat-card" key={s.label}>
                        <span className="stat-label">{s.label}</span>
                        <span className="stat-value" style={{ color: s.color }}>{s.value} {s.suffix}</span>
                    </div>
                ))}
            </div>

            <div className="card">
                <div className="flex items-center justify-between mb-2 table-header-action">
                    <h3>📋 자산 통합 상세 조회</h3>
                    <div style={{ position: 'relative', width: '100%', maxWidth: '340px' }}>
                        <input
                            className="form-input"
                            placeholder="🔍 통합 검색 (이름, 이메일, 자산번호 등)"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>

                {/* 시리얼 번호 필터 */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center', marginBottom: '12px', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <span style={{ fontSize: '0.82em', fontWeight: 'bold', color: '#475569', marginRight: '4px' }}>시리얼 필터:</span>

                    {/* 노트북 */}
                    <span style={{ fontSize: '0.82em', color: '#0369a1', fontWeight: 'bold' }}>💻 노트북</span>
                    {[['전체', ''], ['있음 ✅', 'yes'], ['없음 ❌', 'no']].map(([label, val]) => (
                        <button
                            key={`laptop-${val}`}
                            onClick={() => setSerialFilter(prev => ({ ...prev, laptop: val }))}
                            style={{
                                padding: '3px 10px', borderRadius: '12px', border: '1px solid',
                                cursor: 'pointer', fontSize: '0.8em', transition: 'all 0.15s',
                                background: serialFilter.laptop === val ? '#0ea5e9' : '#fff',
                                color: serialFilter.laptop === val ? '#fff' : '#374151',
                                borderColor: serialFilter.laptop === val ? '#0ea5e9' : '#cbd5e1',
                                fontWeight: serialFilter.laptop === val ? 'bold' : 'normal'
                            }}
                        >{label}</button>
                    ))}

                    <span style={{ borderLeft: '1px solid #cbd5e1', height: '18px', margin: '0 4px' }} />

                    {/* 아이패드 */}
                    <span style={{ fontSize: '0.82em', color: '#7c3aed', fontWeight: 'bold' }}>📱 아이패드</span>
                    {[['전체', ''], ['있음 ✅', 'yes'], ['없음 ❌', 'no']].map(([label, val]) => (
                        <button
                            key={`ipad-${val}`}
                            onClick={() => setSerialFilter(prev => ({ ...prev, ipad: val }))}
                            style={{
                                padding: '3px 10px', borderRadius: '12px', border: '1px solid',
                                cursor: 'pointer', fontSize: '0.8em', transition: 'all 0.15s',
                                background: serialFilter.ipad === val ? '#8b5cf6' : '#fff',
                                color: serialFilter.ipad === val ? '#fff' : '#374151',
                                borderColor: serialFilter.ipad === val ? '#8b5cf6' : '#cbd5e1',
                                fontWeight: serialFilter.ipad === val ? 'bold' : 'normal'
                            }}
                        >{label}</button>
                    ))}

                    {/* 필터 초기화 + 결과 수 */}
                    {(serialFilter.laptop || serialFilter.ipad || searchTerm) && (
                        <>
                            <span style={{ borderLeft: '1px solid #cbd5e1', height: '18px', margin: '0 4px' }} />
                            <button
                                onClick={() => { setSerialFilter({ laptop: '', ipad: '' }); setSearchTerm('') }}
                                style={{ padding: '3px 10px', borderRadius: '12px', border: '1px solid #fca5a5', cursor: 'pointer', fontSize: '0.8em', background: '#fef2f2', color: '#dc2626' }}
                            >✕ 초기화</button>
                            <span style={{ fontSize: '0.8em', color: '#64748b', marginLeft: '4px' }}>
                                {filteredData.length}명 / 전체 {integratedData?.length || 0}명
                            </span>
                        </>
                    )}
                </div>

                {isIntegratedLoading ? (
                    <div className="loading"><div className="spinner" /> 데이터 로딩중...</div>
                ) : (
                    <div className="table-wrapper" style={{ maxHeight: '600px', overflow: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    {columns.map(col => <th key={col.key}>{col.label}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {filteredData.length > 0 ? (
                                    filteredData.map((row, idx) => (
                                        <tr key={idx}>
                                            <td>{idx + 1}</td>
                                            {columns.slice(1).map(col => {
                                                const rawVal = row[col.key]
                                                const value = String(rawVal || '-')
                                                const isDuplicate = value.startsWith('[중복!]')
                                                const isResigned = col.key === '퇴사정보' && rawVal && rawVal !== '-'
                                                const isSerialCol = col.key === 'Lease_List' || col.key === 'Ipad_List'
                                                const missingSerial = isSerialCol && !hasSerial(rawVal)

                                                let style = {}
                                                if (isDuplicate) style = { color: '#ef4444', fontWeight: 'bold' }
                                                if (isResigned) style = { color: '#ef4444', fontWeight: 'bold' }
                                                if (missingSerial) style = { color: '#94a3b8', background: '#fafafa', fontStyle: 'italic' }

                                                return (
                                                    <td key={col.key} style={style} title={missingSerial ? '시리얼 번호 없음' : undefined}>
                                                        {missingSerial ? '- (미등록)' : value}
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={columns.length} style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
                                            {searchTerm ? '검색 결과가 없습니다.' : '데이터가 없습니다.'}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

export default Dashboard

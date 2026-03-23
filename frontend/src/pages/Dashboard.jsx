import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

const Dashboard = () => {
    const queryClient = useQueryClient()
    const [searchTerm, setSearchTerm] = useState('')
    
    // 모달 제어 상태
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

    if (isSummaryLoading) return <div className="loading"><div className="spinner" /> 데이터 로딩중...</div>

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
        if (!searchTerm) return true
        return Object.values(row).some(val =>
            String(val).toLowerCase().includes(searchTerm.toLowerCase())
        )
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>📊 통합 자산 현황 (대시보드)</h1>
                <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-danger" onClick={() => setShowResignModal(true)}>
                        👋 퇴사자 처리
                    </button>
                </div>
            </div>

            {/* 퇴사자 처리 모달 */}
            {showResignModal && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div className="modal-content card" style={{ padding: '2rem', width: '600px', backgroundColor: '#fff' }}>
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
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
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
                <div className="flex items-center justify-between mb-2">
                    <h3>📋 자산 통합 상세 조회</h3>
                    <div style={{ position: 'relative', width: '300px' }}>
                        <input
                            className="form-input"
                            placeholder="🔍 통합 검색 (이름, 이메일, 자산번호 등)"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
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
                                            {columns.slice(1).map(col => (
                                                <td key={col.key} style={col.key === '퇴사정보' && row[col.key] !== '-' ? { color: '#ef4444', fontWeight: 'bold' } : {}}>
                                                    {row[col.key] || '-'}
                                                </td>
                                            ))}
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

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

const Dashboard = () => {
    const [searchTerm, setSearchTerm] = useState('')

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

    return (
        <div>
            <h1>📊 통합 자산 현황</h1>

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

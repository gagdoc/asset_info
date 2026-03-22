import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'

const Consumables = () => {
    const [activeTab, setActiveTab] = useState('estimate') // 견적서 탭을 기본으로 해볼까요
    const [selectedMonth, setSelectedMonth] = useState('')

    // 월 목록 가져오기
    const { data: monthsData } = useQuery({
        queryKey: ['consumables-months'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/months')
            return data.months || []
        }
    })

    // 초기 월 설정 (가장 최신/첫 번째 배열 요소)
    useEffect(() => {
        if (monthsData && monthsData.length > 0 && !selectedMonth) {
            setSelectedMonth(monthsData[0])
        }
    }, [monthsData, selectedMonth])

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ margin: 0 }}>소모품 월별 관리 및 견적서</h1>
                
                {/* 월 선택 드롭다운 */}
                {(activeTab === 'outbound' || activeTab === 'estimate') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <label style={{ fontWeight: 'bold' }}>조회 월 선택:</label>
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }}
                        >
                            {monthsData?.map(m => (
                                <option key={m} value={m}>{m}</option>
                            ))}
                        </select>
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <button
                    className={`btn ${activeTab === 'estimate' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('estimate')}
                >
                    견적서 (월별 합산)
                </button>
                <button
                    className={`btn ${activeTab === 'outbound' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('outbound')}
                >
                    월별 출고 개별 내역
                </button>
                <button
                    className={`btn ${activeTab === 'items' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('items')}
                >
                    전체 품목 리스트
                </button>
            </div>

            {activeTab === 'estimate' && selectedMonth && <EstimateTab month={selectedMonth} />}
            {activeTab === 'outbound' && selectedMonth && <OutboundTab month={selectedMonth} />}
            {activeTab === 'items' && <ItemsTab />}
            
            {/* 데이터 로딩 전 안내 */}
            {(activeTab === 'estimate' || activeTab === 'outbound') && !selectedMonth && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>조회할 월(Month) 데이터를 불러오는 중입니다...</div>
            )}
        </div>
    )
}

const EstimateTab = ({ month }) => {
    const { data: estimateData, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['consumables-estimate', month],
        queryFn: async () => {
            const { data } = await axios.get(`/api/consumables/estimate?month=${month}`)
            return data
        }
    })

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <h3>{month} 견적서 산출 내역</h3>
                <button className="btn btn-secondary" onClick={() => refetch()} disabled={isFetching}>
                    {isFetching ? '새로고침 중...' : '시트 데이터 다시 불러오기'}
                </button>
            </div>
            
            {isLoading ? <div>데이터 구조를 파악하는 중입니다... (약 2~3초 소요)</div> : (
                <table className="data-table">
                    <thead>
                        <tr>
                            <th>NO</th>
                            <th>ITEM (분류)</th>
                            <th>품목명</th>
                            <th>총수</th>
                            <th>사용자 (상세)</th>
                            <th>단가(₩)</th>
                            <th>견적비용(₩)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {estimateData?.length > 0 ? estimateData.map((row, idx) => (
                            <tr key={idx}>
                                <td style={{ textAlign: 'center' }}>{row.no}</td>
                                <td>{row.category}</td>
                                <td><strong>{row.item_name}</strong></td>
                                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{row.total_qty}</td>
                                <td style={{ fontSize: '0.9em', color: '#555' }}>{row.users}</td>
                                <td style={{ textAlign: 'right' }}>{row.unit_price}</td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#e53e3e' }}>{row.total_price}</td>
                            </tr>
                        )) : (
                            <tr><td colSpan="7" style={{ textAlign: 'center' }}>해당 월에 정리된 견적 데이터가 없습니다. Google Sheets를 확인해주세요.</td></tr>
                        )}
                    </tbody>
                </table>
            )}
        </div>
    )
}

const OutboundTab = ({ month }) => {
    const { data: history, isLoading } = useQuery({
        queryKey: ['consumables-outbound', month],
        queryFn: async () => {
            const { data } = await axios.get(`/api/consumables/outbound?month=${month}`)
            return data
        }
    })

    if (isLoading) return <div>Loading...</div>

    return (
        <div className="card">
            <h3>{month} 출고 상세 기록</h3>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>출고 날짜</th>
                        <th>출고 품목명</th>
                        <th>지급 수량</th>
                        <th>지급 대상자(팀)</th>
                    </tr>
                </thead>
                <tbody>
                    {history?.length > 0 ? history.map((row, idx) => (
                        <tr key={idx}>
                            <td>{row.date}</td>
                            <td>{row.item_name}</td>
                            <td style={{ textAlign: 'center' }}>{row.quantity}</td>
                            <td>{row.user_name}</td>
                        </tr>
                    )) : (
                        <tr><td colSpan="4" style={{ textAlign: 'center' }}>출고 내역이 비어 있습니다.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    )
}

const ItemsTab = () => {
    const { data: items, isLoading } = useQuery({
        queryKey: ['consumables-items'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/items')
            return data
        }
    })

    if (isLoading) return <div>Loading...</div>

    return (
        <div className="card">
            <h3>소모품 마스터 리스트 (단가표)</h3>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>대분류 (Category)</th>
                        <th>소모품명 (Item Name)</th>
                        <th>정상 단가(₩)</th>
                    </tr>
                </thead>
                <tbody>
                    {items?.length > 0 ? items.map((item, idx) => (
                        <tr key={idx}>
                            <td>{item.category}</td>
                            <td><strong>{item.item_name}</strong></td>
                            <td style={{ textAlign: 'right' }}>{item.price}</td>
                        </tr>
                    )) : (
                        <tr><td colSpan="3" style={{ textAlign: 'center' }}>등록된 품목이 없습니다.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    )
}

export default Consumables

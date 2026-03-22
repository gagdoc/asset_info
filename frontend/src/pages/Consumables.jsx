import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'

const Consumables = () => {
    const [activeTab, setActiveTab] = useState('estimate')
    const [selectedMonth, setSelectedMonth] = useState('')

    const { data: monthsData } = useQuery({
        queryKey: ['consumables-months'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/months')
            return data.months || []
        }
    })

    useEffect(() => {
        if (monthsData && monthsData.length > 0 && !selectedMonth) {
            setSelectedMonth(monthsData[0])
        }
    }, [monthsData, selectedMonth])

    return (
        <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
                <h1 style={{ margin: 0 }}>소모품 월별 관리 및 견적서</h1>
                
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

    const totalQty = estimateData?.reduce((acc, row) => {
        const qty = parseInt(row.total_qty?.toString().replace(/,/g, ''), 10)
        return acc + (isNaN(qty) ? 0 : qty)
    }, 0) || 0;

    const totalCost = estimateData?.reduce((acc, row) => {
        const cost = parseInt(row.total_price?.toString().replace(/,/g, ''), 10)
        return acc + (isNaN(cost) ? 0 : cost)
    }, 0) || 0;

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
                    {estimateData?.length > 0 && (
                        <tfoot>
                            <tr style={{ backgroundColor: '#f8f9fa', fontWeight: 'bold' }}>
                                <td colSpan="3" style={{ textAlign: 'center' }}>총 합계</td>
                                <td style={{ textAlign: 'center', color: '#2b6cb0', fontSize: '1.1em' }}>{totalQty.toLocaleString()}</td>
                                <td></td>
                                <td></td>
                                <td style={{ textAlign: 'right', color: '#e53e3e', fontSize: '1.2em' }}>{totalCost.toLocaleString()} ₩</td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            )}
        </div>
    )
}

const OutboundTab = ({ month }) => {
    const queryClient = useQueryClient()
    const [showForm, setShowForm] = useState(false)
    const [formData, setFormData] = useState({ date: '', item_name: '', quantity: '1', user_name: '' })

    const { data: history, isLoading } = useQuery({
        queryKey: ['consumables-outbound', month],
        queryFn: async () => {
            const { data } = await axios.get(`/api/consumables/outbound?month=${month}`)
            return data
        }
    })

    const { data: itemsList } = useQuery({
        queryKey: ['consumables-items'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/items')
            return data
        }
    })

    const mutation = useMutation({
        mutationFn: async (newData) => {
            return axios.post('/api/consumables/outbound', newData)
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['consumables-outbound', month])
            setShowForm(false)
            setFormData({ date: '', item_name: '', quantity: '1', user_name: '' })
            alert("출고 내역이 추가되었습니다.")
        },
        onError: () => alert("오류가 발생했습니다. 구글 시트를 확인하세요.")
    })

    const handleSubmit = (e) => {
        e.preventDefault()
        if (!formData.date || !formData.item_name || !formData.quantity || !formData.user_name) {
            alert("모든 필드를 입력해주세요.")
            return
        }
        mutation.mutate({ month, ...formData })
    }

    if (isLoading) return <div>Loading...</div>

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3>{month} 출고 상세 기록</h3>
                <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                    {showForm ? '닫기' : '+ 출고 추가'}
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>날짜 (예: 2025. 03.11)</label>
                        <input type="text" placeholder="2025. 03.11" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} style={{ padding: '8px' }} required />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>품목</label>
                        <select value={formData.item_name} onChange={e => setFormData({...formData, item_name: e.target.value})} style={{ padding: '8px', minWidth: '200px' }} required>
                            <option value="">품목 선택</option>
                            {itemsList?.map((it, idx) => <option key={idx} value={it.item_name}>{it.item_name}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>수량</label>
                        <input type="number" min="1" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} style={{ padding: '8px', width: '80px' }} required />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>사용자 이름(팀)</label>
                        <input type="text" placeholder="홍길동" value={formData.user_name} onChange={e => setFormData({...formData, user_name: e.target.value})} style={{ padding: '8px' }} required />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={mutation.isLoading}>
                        {mutation.isLoading ? '저장 중...' : '확인'}
                    </button>
                </form>
            )}

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
    const queryClient = useQueryClient()
    const [showForm, setShowForm] = useState(false)
    const [formData, setFormData] = useState({ category: '', item_name: '', price: '' })

    const { data: items, isLoading } = useQuery({
        queryKey: ['consumables-items'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/items')
            return data
        }
    })

    const mutation = useMutation({
        mutationFn: async (newData) => {
            return axios.post('/api/consumables/items', newData)
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['consumables-items'])
            setShowForm(false)
            setFormData({ category: '', item_name: '', price: '' })
            alert("품목이 저장되었습니다.")
        },
        onError: () => alert("오류가 발생했습니다. 구글 시트를 확인하세요.")
    })

    const handleSubmit = (e) => {
        e.preventDefault()
        if (!formData.category || !formData.item_name || !formData.price) {
            alert("모든 필드를 입력해주세요.")
            return
        }
        mutation.mutate(formData)
    }

    const startEdit = (item) => {
        setFormData({ category: item.category, item_name: item.item_name, price: item.price })
        setShowForm(true)
    }

    if (isLoading) return <div>Loading...</div>

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3>소모품 마스터 리스트 (단가표)</h3>
                <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setFormData({ category: '', item_name: '', price: '' }); }}>
                    {showForm ? '닫기' : '+ 품목 추가'}
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>대분류 (Category)</label>
                        <input type="text" placeholder="예: USB, Mouse..." value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} style={{ padding: '8px' }} required />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>품목명</label>
                        <input type="text" placeholder="로지텍 마우스 M185" value={formData.item_name} onChange={e => setFormData({...formData, item_name: e.target.value})} style={{ padding: '8px', minWidth: '250px' }} required />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>단가 (원)</label>
                        <input type="text" placeholder="18,000" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} style={{ padding: '8px' }} required />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={mutation.isLoading}>
                        {mutation.isLoading ? '저장 중...' : '저장하기'}
                    </button>
                    <div style={{ fontSize: '0.8em', color: '#666', marginTop: '5px', width: '100%' }}>* 품목명이 기존과 같을 경우 '수정' 처리되고, 다를 경우 '추가' 됩니다.</div>
                </form>
            )}

            <table className="data-table">
                <thead>
                    <tr>
                        <th>대분류 (Category)</th>
                        <th>소모품명 (Item Name)</th>
                        <th>정상 단가(₩)</th>
                        <th style={{ textAlign: 'center' }}>관리</th>
                    </tr>
                </thead>
                <tbody>
                    {items?.length > 0 ? items.map((item, idx) => (
                        <tr key={idx}>
                            <td>{item.category}</td>
                            <td><strong>{item.item_name}</strong></td>
                            <td style={{ textAlign: 'right' }}>{item.price}</td>
                            <td style={{ textAlign: 'center' }}>
                                <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.8em' }} onClick={() => startEdit(item)}>수정</button>
                            </td>
                        </tr>
                    )) : (
                        <tr><td colSpan="4" style={{ textAlign: 'center' }}>등록된 품목이 없습니다.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    )
}

export default Consumables

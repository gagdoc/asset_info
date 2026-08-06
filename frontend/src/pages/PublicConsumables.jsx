import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import SearchableSelect from '../components/SearchableSelect'
import LoadingModal from '../components/LoadingModal'

const STAFF_OPTIONS = ['Kale', 'Daniel', '기타']
const DELIVERY_OPTIONS = ['직접', '택배', '기타']

const PublicConsumables = () => {
    const [activeTab, setActiveTab] = useState('outbound') // 'outbound' | 'inventory' | 'rental'
    
    return (
        <div style={{
            minHeight: '100vh',
            overflowY: 'auto',
            padding: '24px',
            boxSizing: 'border-box',
            fontFamily: "'Inter', sans-serif",
            backgroundColor: '#f8fafc'
        }}>
            <div style={{ maxWidth: '100%', margin: '0 auto' }}>
                <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
                    <h1 style={{ fontSize: '1.5rem', color: '#1e293b', margin: 0 }}>📦 소모품 & 대여 관리</h1>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button 
                            onClick={() => setActiveTab('outbound')}
                            style={{ 
                                padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer',
                                backgroundColor: activeTab === 'outbound' ? '#4f46e5' : '#e0e7ff',
                                color: activeTab === 'outbound' ? '#ffffff' : '#4338ca'
                            }}>
                            출고 등록 및 내역
                        </button>
                        <button 
                            onClick={() => setActiveTab('rental')}
                            style={{ 
                                padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer',
                                backgroundColor: activeTab === 'rental' ? '#8b5cf6' : '#ede9fe',
                                color: activeTab === 'rental' ? '#ffffff' : '#6d28d9'
                            }}>
                            대여 등록 및 현황
                        </button>
                        <button 
                            onClick={() => setActiveTab('inventory')}
                            style={{ 
                                padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', border: 'none', cursor: 'pointer',
                                backgroundColor: activeTab === 'inventory' ? '#0ea5e9' : '#e0f2fe',
                                color: activeTab === 'inventory' ? '#ffffff' : '#0369a1'
                            }}>
                            재고 현황 파악
                        </button>
                    </div>
                </header>

                {activeTab === 'outbound' && <PublicOutboundTab />}
                {activeTab === 'rental' && <PublicRentalTab />}
                {activeTab === 'inventory' && <PublicInventoryTab />}
            </div>
        </div>
    )
}

const PublicOutboundTab = () => {
    const queryClient = useQueryClient()
    const [showForm, setShowForm] = useState(false)
    const [formData, setFormData] = useState({ date: new Date().toISOString().split('T')[0], item_name: '', quantity: '1', outbound_type: '일반', staff: '', staff_custom: '', delivery: '', delivery_custom: '' })
    const [userNames, setUserNames] = useState([''])
    const [filterCategory, setFilterCategory] = useState('')
    
    const { data: monthsData } = useQuery({
        queryKey: ['consumables-months'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/months')
            return data.months || []
        }
    })

    const currentMonth = monthsData?.[0] || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`

    const { data: history, isLoading } = useQuery({
        queryKey: ['consumables-outbound', currentMonth],
        queryFn: async () => {
            const { data } = await axios.get(`/api/consumables/outbound?month=${currentMonth}`)
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

    const { data: usersList } = useQuery({
        queryKey: ['integrated-users'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/dashboard/integrated')
            return data
        }
    })

    const categories = useMemo(() => Array.from(new Set((itemsList || []).map(it => it.category).filter(Boolean))).sort(), [itemsList])
    
    const itemOptions = useMemo(() => {
        const filtered = filterCategory ? (itemsList || []).filter(it => it.category === filterCategory) : (itemsList || [])
        return filtered.map(it => ({ label: it.item_name, value: it.item_name, category: it.category }))
    }, [itemsList, filterCategory])

    const userOptions = useMemo(() =>
        (usersList || []).map(u => {
            const englishName = (u.NAME || '').trim().replace(/\./g, ' ')
            const nameOnly = englishName || (u.email || '').split('@')[0].replace(/\./g, ' ') || (u.이름 || '').replace(/\./g, ' ')
            return { label: nameOnly, value: `${nameOnly}${u.BU ? ` (${u.BU})` : ''}`, searchStr: `${nameOnly} ${u.email} ${u.BU}` }
        }).sort((a, b) => a.label.localeCompare(b.label)),
    [usersList])

    const mutation = useMutation({
        mutationFn: async (newData) => axios.post('/api/consumables/outbound', newData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['consumables-outbound', currentMonth] })
            queryClient.invalidateQueries({ queryKey: ['inventory-report'] })
            setShowForm(false)
            setFormData({ date: new Date().toISOString().split('T')[0], item_name: '', quantity: '1', outbound_type: '일반', staff: '', staff_custom: '', delivery: '', delivery_custom: '' })
            setUserNames([''])
            alert("출고 내역이 성공적으로 등록되었습니다.")
        },
        onError: (err) => {
            const msg = err?.response?.data?.detail || err.message
            alert("출고 등록 중 오류가 발생했습니다: " + msg)
        }
    })

    const deleteMutation = useMutation({
        mutationFn: async ({ rowIndex, date, item_name, user_name }) => await axios.delete(
            `/api/consumables/outbound?month=${currentMonth}&row_index=${rowIndex}&verify_date=${encodeURIComponent(date)}&verify_item=${encodeURIComponent(item_name)}&verify_user=${encodeURIComponent(user_name || '')}`
        ),
        onSuccess: () => {
            alert("출고 내역이 삭제되었습니다.")
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['consumables-outbound', currentMonth] })
                queryClient.invalidateQueries({ queryKey: ['inventory-report'] })
            }, 1200)
        },
        onError: () => alert("삭제 중 오류가 발생했습니다.")
    })

    const handleSubmit = async (e) => {
        e.preventDefault()
        const effectiveStaff = formData.staff === '기타' ? formData.staff_custom : formData.staff
        const effectiveDelivery = formData.delivery === '기타' ? formData.delivery_custom : formData.delivery
        const filledUsers = userNames.filter(n => n.trim())
        if (!formData.date || !formData.item_name || !formData.quantity || filledUsers.length === 0 || !effectiveStaff || !effectiveDelivery) {
            alert("모든 필드를 입력해주세요.")
            return
        }
        mutation.mutate({
            ...formData,
            user_name: filledUsers.join(', '),
            staff: effectiveStaff,
            delivery: effectiveDelivery,
            month: currentMonth
        })
    }

    const handleDelete = (row) => {
        if (window.confirm('정말 삭제하시겠습니까?')) {
            deleteMutation.mutate({ rowIndex: row.row_index, date: row.date, item_name: row.item_name, user_name: row.user_name })
        }
    }

    return (
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#334155' }}>
                    당월 ({currentMonth || '로딩 중...'}) 출고 리스트
                </h2>
                <button 
                    onClick={() => setShowForm(!showForm)}
                    disabled={!monthsData || monthsData.length === 0}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#10b981', color: '#fff', fontWeight: 'bold', cursor: (!monthsData || monthsData.length === 0) ? 'not-allowed' : 'pointer', opacity: (!monthsData || monthsData.length === 0) ? 0.6 : 1 }}>
                    {showForm ? '닫기' : '+ 신규 출고 등록'}
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.1rem', color: '#475569' }}>출고 등록 폼</h3>
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                        <div style={{ flex: '1 1 150px' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 'bold' }}>출고 날짜</label>
                            <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} required />
                        </div>
                        <div style={{ flex: '1 1 150px' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 'bold' }}>분류</label>
                            <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setFormData(f => ({ ...f, item_name: '' })) }} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                                <option value="">전체 분류</option>
                                {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                            </select>
                        </div>
                        <div style={{ flex: '2 1 250px' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 'bold' }}>품목 선택</label>
                            <SearchableSelect options={itemOptions} value={formData.item_name} onChange={val => setFormData(f => ({ ...f, item_name: val }))} placeholder="품목을 검색하세요" width="100%" />
                        </div>
                        <div style={{ flex: '0 1 100px' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 'bold' }}>수량</label>
                            <input type="number" min="1" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} required />
                        </div>
                    </div>
                    
                    <div style={{ marginBottom: '16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                            <label style={{ fontSize: '0.9rem', fontWeight: 'bold' }}>지급 대상자</label>
                            <button type="button" onClick={() => setUserNames(prev => [...prev, ''])} style={{ padding: '2px 8px', fontSize: '0.8rem', borderRadius: '12px', border: '1px solid #6366f1', background: '#e0e7ff', color: '#4f46e5', cursor: 'pointer' }}>+ 추가</button>
                        </div>
                        {userNames.map((uName, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                <SearchableSelect options={userOptions} value={uName} onChange={val => { const next = [...userNames]; next[idx] = val; setUserNames(next) }} placeholder="대상자 이름 검색" width="300px" allowCustom={true} />
                                {userNames.length > 1 && <button type="button" onClick={() => setUserNames(prev => prev.filter((_, i) => i !== idx))} style={{ padding: '4px 8px', borderRadius: '4px', border: 'none', background: '#fef2f2', color: '#ef4444', cursor: 'pointer' }}>✕</button>}
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '32px', marginBottom: '24px', flexWrap: 'wrap' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '8px' }}>지급 담당자</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {STAFF_OPTIONS.map(opt => (
                                    <label key={opt} style={{ padding: '6px 12px', border: `1px solid ${formData.staff === opt ? '#4f46e5' : '#cbd5e1'}`, borderRadius: '20px', background: formData.staff === opt ? '#e0e7ff' : '#fff', cursor: 'pointer' }}>
                                        <input type="radio" name="staff" value={opt} checked={formData.staff === opt} onChange={() => setFormData({...formData, staff: opt})} style={{ display: 'none' }} /> {opt}
                                    </label>
                                ))}
                            </div>
                            {formData.staff === '기타' && <input type="text" placeholder="직접 입력" value={formData.staff_custom} onChange={e => setFormData({...formData, staff_custom: e.target.value})} style={{ marginTop: '8px', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />}
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: '8px' }}>수령 방법</label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {DELIVERY_OPTIONS.map(opt => (
                                    <label key={opt} style={{ padding: '6px 12px', border: `1px solid ${formData.delivery === opt ? '#0ea5e9' : '#cbd5e1'}`, borderRadius: '20px', background: formData.delivery === opt ? '#e0f2fe' : '#fff', cursor: 'pointer' }}>
                                        <input type="radio" name="delivery" value={opt} checked={formData.delivery === opt} onChange={() => setFormData({...formData, delivery: opt})} style={{ display: 'none' }} /> {opt}
                                    </label>
                                ))}
                            </div>
                            {formData.delivery === '기타' && <input type="text" placeholder="직접 입력" value={formData.delivery_custom} onChange={e => setFormData({...formData, delivery_custom: e.target.value})} style={{ marginTop: '8px', padding: '6px', borderRadius: '4px', border: '1px solid #cbd5e1' }} />}
                        </div>
                    </div>

                    <button type="submit" disabled={mutation.isPending} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#4f46e5', color: '#fff', fontSize: '1rem', fontWeight: 'bold', cursor: mutation.isPending ? 'not-allowed' : 'pointer' }}>
                        {mutation.isPending ? '등록 중...' : '출고 완료하기'}
                    </button>
                </form>
            )}

            <LoadingModal isOpen={isLoading} message="데이터를 불러오는 중입니다..." />
            
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem' }}>날짜</th>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem' }}>품목명</th>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem' }}>수량</th>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem' }}>대상자</th>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem' }}>담당</th>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem' }}>관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history && history.length > 0 ? history.map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.2s' }}>
                                <td style={{ padding: '12px' }}>{row.date}</td>
                                <td style={{ padding: '12px', fontWeight: 'bold' }}>{row.item_name}</td>
                                <td style={{ padding: '12px' }}>{row.quantity}</td>
                                <td style={{ padding: '12px', fontSize: '0.9rem' }}>{row.user_name}</td>
                                <td style={{ padding: '12px', fontSize: '0.9rem' }}>{row.staff}</td>
                                <td style={{ padding: '12px' }}>
                                    <button onClick={() => handleDelete(row)} style={{ padding: '4px 8px', fontSize: '0.8rem', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '4px', background: '#fff', cursor: 'pointer' }}>삭제</button>
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan="6" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>출고 내역이 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

const PublicRentalTab = () => {
    const queryClient = useQueryClient()
    const [showForm, setShowForm] = useState(false)
    const [formData, setFormData] = useState({ 
        name: '', 
        email: '', 
        item_name: '', 
        quantity: '1', 
        rent_date: new Date().toISOString().split('T')[0], 
        expected_return_date: '', 
        notes: '' 
    })

    const { data: rentalsList, isLoading } = useQuery({
        queryKey: ['rentals-list-public'],
        queryFn: async () => {
            const { data } = await axios.get('/api/rentals')
            // 현재 대여중/연체 인 항목들만 모아서 표시
            return (data || []).filter(r => r['상태'] === '대여중' || r['상태'] === '연체')
        }
    })

    const { data: itemsList } = useQuery({
        queryKey: ['consumables-items'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/items')
            return data
        }
    })

    const { data: usersList } = useQuery({
        queryKey: ['integrated-users'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/dashboard/integrated')
            return data
        }
    })

    const itemOptions = useMemo(() => {
        return (itemsList || []).map(it => ({ label: it.item_name, value: it.item_name }))
    }, [itemsList])

    const userOptions = useMemo(() =>
        (usersList || []).map(u => {
            const englishName = (u.NAME || '').trim().replace(/\./g, ' ')
            const nameOnly = englishName || (u.email || '').split('@')[0].replace(/\./g, ' ') || (u.이름 || '').replace(/\./g, ' ')
            return { label: nameOnly, value: nameOnly, email: u.email, searchStr: `${nameOnly} ${u.email} ${u.BU}` }
        }).sort((a, b) => a.label.localeCompare(b.label)),
    [usersList])

    const mutation = useMutation({
        mutationFn: async (newData) => axios.post('/api/rentals', newData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['rentals-list-public'] })
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
            setShowForm(false)
            setFormData({ name: '', email: '', item_name: '', quantity: '1', rent_date: new Date().toISOString().split('T')[0], expected_return_date: '', notes: '' })
            alert("대여 내역이 성공적으로 등록되었습니다.")
        },
        onError: (err) => {
            const msg = err?.response?.data?.detail || err.message
            alert("대여 등록 중 오류가 발생했습니다: " + msg)
        }
    })

    const handleUserSelect = (val) => {
        const u = userOptions.find(o => o.value === val)
        setFormData(prev => ({
            ...prev,
            name: val,
            email: u?.email || prev.email
        }))
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!formData.name || !formData.item_name || !formData.quantity || !formData.rent_date) {
            alert("필수 항목(*)을 모두 입력해주세요.")
            return
        }
        mutation.mutate(formData)
    }

    return (
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#334155' }}>
                    대여 중인 품목 현황
                </h2>
                <button 
                    onClick={() => setShowForm(!showForm)}
                    style={{ padding: '8px 16px', borderRadius: '8px', border: 'none', backgroundColor: '#8b5cf6', color: '#fff', fontWeight: 'bold', cursor: 'pointer' }}>
                    {showForm ? '닫기' : '+ 신규 대여 등록'}
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} style={{ background: '#f8fafc', padding: '20px', borderRadius: '8px', marginBottom: '24px', border: '1px solid #e2e8f0' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '16px', fontSize: '1.1rem', color: '#475569' }}>대여 등록 폼</h3>
                    
                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 'bold' }}>대여자 이름 *</label>
                            <SearchableSelect 
                                options={userOptions} 
                                value={formData.name} 
                                onChange={handleUserSelect} 
                                placeholder="이름 검색" 
                                width="100%" 
                                allowCustom={true} 
                            />
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 'bold' }}>대여자 이메일</label>
                            <input 
                                type="email" 
                                value={formData.email} 
                                onChange={e => setFormData({...formData, email: e.target.value})} 
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} 
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                        <div style={{ flex: '2 1 250px' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 'bold' }}>품목명 *</label>
                            <SearchableSelect 
                                options={itemOptions} 
                                value={formData.item_name} 
                                onChange={val => setFormData(f => ({ ...f, item_name: val }))} 
                                placeholder="품목을 검색하세요" 
                                width="100%" 
                            />
                        </div>
                        <div style={{ flex: '0 1 100px' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 'bold' }}>수량 *</label>
                            <input 
                                type="number" 
                                min="1" 
                                value={formData.quantity} 
                                onChange={e => setFormData({...formData, quantity: e.target.value})} 
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} 
                                required 
                            />
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px' }}>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 'bold' }}>대여 일자 *</label>
                            <input 
                                type="date" 
                                value={formData.rent_date} 
                                onChange={e => setFormData({...formData, rent_date: e.target.value})} 
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} 
                                required 
                            />
                        </div>
                        <div style={{ flex: '1 1 200px' }}>
                            <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 'bold' }}>반납 예정일</label>
                            <input 
                                type="date" 
                                value={formData.expected_return_date} 
                                onChange={e => setFormData({...formData, expected_return_date: e.target.value})} 
                                style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} 
                            />
                        </div>
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{ display: 'block', fontSize: '0.9rem', marginBottom: '6px', fontWeight: 'bold' }}>비고</label>
                        <input 
                            type="text" 
                            placeholder="기타 참고사항" 
                            value={formData.notes} 
                            onChange={e => setFormData({...formData, notes: e.target.value})} 
                            style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} 
                        />
                    </div>

                    <button type="submit" disabled={mutation.isPending} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: 'none', backgroundColor: '#8b5cf6', color: '#fff', fontSize: '1rem', fontWeight: 'bold', cursor: mutation.isPending ? 'not-allowed' : 'pointer' }}>
                        {mutation.isPending ? '등록 중...' : '대여 완료하기'}
                    </button>
                </form>
            )}

            <LoadingModal isOpen={isLoading} message="데이터를 불러오는 중입니다..." />
            
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem' }}>대여자</th>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem' }}>품목명</th>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem' }}>수량</th>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem' }}>대여일</th>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem' }}>상태</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rentalsList && rentalsList.length > 0 ? rentalsList.map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0', transition: 'background 0.2s' }}>
                                <td style={{ padding: '12px', fontWeight: 'bold' }}>{row['대여자 이름']}</td>
                                <td style={{ padding: '12px' }}>{row['품목명']}</td>
                                <td style={{ padding: '12px' }}>{row['수량']}</td>
                                <td style={{ padding: '12px', fontSize: '0.9rem' }}>{row['대여 일자']}</td>
                                <td style={{ padding: '12px' }}>
                                    <span style={{
                                        padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold',
                                        backgroundColor: row['상태'] === '연체' ? '#fee2e2' : '#e0e7ff',
                                        color: row['상태'] === '연체' ? '#ef4444' : '#4f46e5'
                                    }}>
                                        {row['상태']}
                                    </span>
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>대여 중인 품목이 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}


const PublicInventoryTab = () => {
    // 마스터 품목 리스트 가져오기 (실재고 파악)
    const { data: itemsList, isLoading } = useQuery({
        queryKey: ['consumables-items'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/items')
            return data
        }
    })

    const items = useMemo(() => {
        if (!itemsList) return []
        return [...itemsList]
            .filter(item => item.is_tracked !== false) // 추적 관리되는 항목만 보여주거나 전부 보여줌
            .map(item => ({
                item_name: item.item_name,
                category: item.category || '미분류',
                current_stock: item.current_stock ?? 0
            }))
            .sort((a, b) => a.category.localeCompare(b.category))
    }, [itemsList])

    return (
        <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)' }}>
            <h2 style={{ margin: '0 0 20px 0', fontSize: '1.25rem', color: '#334155' }}>📊 품목별 재고 현황</h2>
            
            <LoadingModal isOpen={isLoading} message="재고 데이터를 불러오는 중입니다..." />

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                    <thead>
                        <tr style={{ backgroundColor: '#f1f5f9', borderBottom: '2px solid #cbd5e1' }}>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem' }}>분류</th>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem' }}>품목명</th>
                            <th style={{ padding: '12px', color: '#475569', fontSize: '0.9rem', textAlign: 'right' }}>실제 재고</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length > 0 ? items.map((row, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '12px', fontSize: '0.9rem', color: '#64748b' }}>{row.category}</td>
                                <td style={{ padding: '12px', fontWeight: 'bold', color: '#0f172a' }}>{row.item_name}</td>
                                <td style={{ padding: '12px', textAlign: 'right', fontWeight: 'bold', fontSize: '1.1rem', color: row.current_stock > 0 ? '#3b82f6' : '#ef4444' }}>
                                    {row.current_stock}
                                </td>
                            </tr>
                        )) : (
                            <tr><td colSpan="3" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>재고 데이터가 없습니다.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}

export default PublicConsumables

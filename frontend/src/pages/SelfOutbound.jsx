import { useState, useEffect, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import SearchableSelect from '../components/SearchableSelect'
import LoadingModal from '../components/LoadingModal'

const SelfOutbound = () => {
    const queryClient = useQueryClient()
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        item_name: '',
        quantity: '1',
        user_name: '',
        outbound_type: '일반',
        staff: '',
        staff_custom: '',
        delivery: '',
        delivery_custom: '',
    })
    const [filterCategory, setFilterCategory] = useState('')
    const [isSuccess, setIsSuccess] = useState(false)

    const isTonner = (name, category) => {
        const n = (name || '').toLowerCase()
        const c = (category || '').toLowerCase()
        return n.includes('tonner') || n.includes('toner') || n.includes('토너')
            || c.includes('tonner') || c.includes('toner') || c.includes('토너')
    }

    // 1. 가용한 월 목록 조회 (최신 월 자동 선택용)
    const { data: monthsData, isLoading: isMonthsLoading } = useQuery({
        queryKey: ['consumables-months'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/months')
            return data.months || []
        }
    })

    // 2. 품목 리스트 조회
    const { data: itemsList, isLoading: isItemsLoading } = useQuery({
        queryKey: ['consumables-items'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/items')
            return data
        }
    })

    // 3. 사용자 리스트 조회
    const { data: usersList, isLoading: isUsersLoading } = useQuery({
        queryKey: ['integrated-users'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/dashboard/integrated')
            return data
        }
    })

    const isInitialLoading = isMonthsLoading || isItemsLoading || isUsersLoading;

    const categories = useMemo(() =>
        Array.from(new Set((itemsList || []).map(it => it.category).filter(Boolean))).sort(),
    [itemsList])

    const itemOptions = useMemo(() => {
        const filtered = filterCategory
            ? (itemsList || []).filter(it => it.category === filterCategory)
            : (itemsList || [])
        return filtered.map(it => ({ label: it.item_name, value: it.item_name, category: it.category }))
    }, [itemsList, filterCategory])

    const selectedItemCategory = useMemo(() => {
        if (!formData.item_name || !itemsList) return ''
        return (itemsList.find(it => it.item_name === formData.item_name) || {}).category || ''
    }, [formData.item_name, itemsList])

    const userOptions = useMemo(() => 
        (usersList || []).map(u => {
            const nameOnly = (u.NAME || u.이름 || '').replace(/\./g, ' ');
            const fullNameWithBU = `${nameOnly}${u.BU ? ` (${u.BU})` : ''}`;
            return { 
                label: nameOnly, 
                value: fullNameWithBU, // 상세기록처럼 이름(팀) 형식으로 저장
                subLabel: `${u.email}${u.BU ? ` (${u.BU})` : ''}`,
                name: nameOnly,
                email: u.email,
                bu: u.BU
            };
        }).sort((a, b) => (a.name || '').localeCompare(b.name || '')), 
    [usersList])

    const STAFF_OPTIONS = ['Kale', 'Daniel', '기타']
    const DELIVERY_OPTIONS = ['직접', '택배', '기타']

    const mutation = useMutation({
        mutationFn: async (newData) => {
            const latestMonth = monthsData?.[0]
            if (!latestMonth) throw new Error("등록 가능한 월 데이터가 없습니다.")
            const effectiveStaff = newData.staff === '기타' ? newData.staff_custom : newData.staff
            const effectiveDelivery = newData.delivery === '기타' ? newData.delivery_custom : newData.delivery
            return axios.post('/api/consumables/outbound', { ...newData, staff: effectiveStaff, delivery: effectiveDelivery, month: latestMonth })
        },
        onSuccess: () => {
            setIsSuccess(true)
            setFormData({
                date: new Date().toISOString().split('T')[0],
                item_name: '',
                quantity: '1',
                user_name: '',
                outbound_type: '일반',
                staff: '',
                staff_custom: '',
                delivery: '',
                delivery_custom: '',
            })
            setFilterCategory('')
            setTimeout(() => setIsSuccess(false), 3000)
            alert("출고 등록이 완료되었습니다. 감사합니다!")
        },
        onError: (err) => alert(err.message || "오류가 발생했습니다. 관리자에게 문의하세요.")
    })

    const handleSubmit = (e) => {
        e.preventDefault()
        const effectiveStaff = formData.staff === '기타' ? formData.staff_custom : formData.staff
        const effectiveDelivery = formData.delivery === '기타' ? formData.delivery_custom : formData.delivery
        if (!formData.item_name || !formData.user_name || !formData.quantity || !effectiveStaff || !effectiveDelivery) {
            alert("모든 필드를 입력해주세요. (지급 담당, 수령 방법 포함)")
            return
        }
        mutation.mutate(formData)
    }

    return (
        <div style={{ 
            maxWidth: '500px', 
            margin: '40px auto', 
            padding: '2rem', 
            background: '#fff', 
            borderRadius: '16px', 
            boxShadow: '0 10px 25px rgba(0,0,0,0.05)',
            fontFamily: "'Inter', sans-serif"
        }}>
            <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                <h1 style={{ fontSize: '1.5rem', color: '#1a202c', marginBottom: '0.5rem' }}>자율 소모품 출고 등록</h1>
                <p style={{ color: '#718096', fontSize: '0.9rem' }}>가져가시는 물품을 아래에 기록해주세요.</p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                <div>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#4a5568' }}>출고 날짜</label>
                    <input 
                        type="date" 
                        value={formData.date} 
                        onChange={e => setFormData({...formData, date: e.target.value})} 
                        style={{ 
                            width: '100%', 
                            padding: '12px', 
                            borderRadius: '8px', 
                            border: '1px solid #e2e8f0',
                            fontSize: '1rem'
                        }} 
                        required 
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#4a5568' }}>대분류 (CATEGORY)</label>
                    <select
                        value={filterCategory}
                        onChange={e => {
                            setFilterCategory(e.target.value)
                            setFormData(f => ({ ...f, item_name: '', outbound_type: '일반' }))
                        }}
                        style={{
                            width: '100%',
                            padding: '12px',
                            borderRadius: '8px',
                            border: '1px solid #e2e8f0',
                            fontSize: '1rem',
                            backgroundColor: '#fff'
                        }}
                    >
                        <option value="">전체 분류</option>
                        {categories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#4a5568' }}>
                        어떤 물건인가요?
                        {filterCategory && <span style={{ marginLeft: '6px', fontSize: '0.85em', color: '#6366f1' }}>[{filterCategory}]</span>}
                    </label>
                    <SearchableSelect
                        options={itemOptions}
                        value={formData.item_name}
                        onChange={val => {
                            const cat = (itemsList || []).find(it => it.item_name === val)?.category || ''
                            setFilterCategory(cat)
                            setFormData(f => ({ ...f, item_name: val, outbound_type: '일반' }))
                        }}
                        placeholder={filterCategory ? `${filterCategory} 품목 검색 및 선택` : '품목 검색 및 선택'}
                        width="100%"
                    />
                </div>

                {/* Toner 선택 시 일반/위탁 옵션 */}
                {isTonner(formData.item_name, selectedItemCategory) && (
                    <div style={{
                        padding: '12px 16px',
                        background: '#fff7ed',
                        border: '2px solid #f97316',
                        borderRadius: '8px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                    }}>
                        <span style={{ fontWeight: 'bold', color: '#c2410c', fontSize: '0.95em' }}>
                            🖨️ Tonner 출고 유형 선택
                        </span>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {['일반', '위탁'].map(type => (
                                <label key={type} style={{
                                    flex: 1,
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: '6px',
                                    padding: '10px',
                                    borderRadius: '20px',
                                    cursor: 'pointer',
                                    border: `2px solid ${formData.outbound_type === type ? (type === '위탁' ? '#f97316' : '#3b82f6') : '#d1d5db'}`,
                                    backgroundColor: formData.outbound_type === type ? (type === '위탁' ? '#fed7aa' : '#dbeafe') : '#fff',
                                    fontWeight: formData.outbound_type === type ? 'bold' : 'normal',
                                    color: formData.outbound_type === type ? (type === '위탁' ? '#9a3412' : '#1e40af') : '#6b7280',
                                    transition: 'all 0.15s',
                                    fontSize: '0.95em'
                                }}>
                                    <input
                                        type="radio"
                                        name="outbound_type"
                                        value={type}
                                        checked={formData.outbound_type === type}
                                        onChange={() => setFormData({...formData, outbound_type: type})}
                                        style={{ display: 'none' }}
                                    />
                                    {type === '위탁' ? '🔄 위탁' : '✅ 일반'}
                                </label>
                            ))}
                        </div>
                        <span style={{ fontSize: '0.82em', color: '#92400e' }}>
                            {formData.outbound_type === '위탁'
                                ? '위탁: 견적서 제외 · 위탁 토너 내역에 별도 기록'
                                : '일반: 월별 견적서에 합산'}
                        </span>
                    </div>
                )}

                <div>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#4a5568' }}>몇 개인가요?</label>
                    <input 
                        type="number" 
                        min="1" 
                        value={formData.quantity} 
                        onChange={e => setFormData({...formData, quantity: e.target.value})} 
                        style={{ 
                            width: '100%', 
                            padding: '12px', 
                            borderRadius: '8px', 
                            border: '1px solid #e2e8f0',
                            fontSize: '1rem'
                        }} 
                        required 
                    />
                </div>

                <div>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#4a5568' }}>가져가시는 분 성함</label>
                    <SearchableSelect 
                        options={userOptions} 
                        value={formData.user_name} 
                        onChange={val => setFormData({...formData, user_name: val})} 
                        placeholder="성함 검색 (이름/이메일)" 
                        searchFields={["name", "email", "bu"]}
                        width="100%"
                        allowCustom={true}
                    />
                </div>

                {/* 지급 담당 */}
                <div>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#4a5568' }}>지급 담당 <span style={{ color: '#e53e3e' }}>*</span></label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {STAFF_OPTIONS.map(opt => (
                            <label key={opt} style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                padding: '10px', borderRadius: '10px', cursor: 'pointer',
                                border: `2px solid ${formData.staff === opt ? '#4f46e5' : '#e2e8f0'}`,
                                backgroundColor: formData.staff === opt ? '#e0e7ff' : '#fff',
                                fontWeight: formData.staff === opt ? 'bold' : 'normal',
                                color: formData.staff === opt ? '#4338ca' : '#718096',
                                transition: 'all 0.15s', fontSize: '0.95em'
                            }}>
                                <input type="radio" name="staff" value={opt} checked={formData.staff === opt}
                                    onChange={() => setFormData({...formData, staff: opt, staff_custom: ''})} style={{ display: 'none' }} />
                                {opt}
                            </label>
                        ))}
                    </div>
                    {formData.staff === '기타' && (
                        <input type="text" placeholder="담당자 이름 직접 입력" value={formData.staff_custom}
                            onChange={e => setFormData({...formData, staff_custom: e.target.value})}
                            style={{ marginTop: '8px', width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #a5b4fc', fontSize: '1rem' }} />
                    )}
                </div>

                {/* 수령 방법 */}
                <div>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#4a5568' }}>수령 방법 <span style={{ color: '#e53e3e' }}>*</span></label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {DELIVERY_OPTIONS.map(opt => (
                            <label key={opt} style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                padding: '10px', borderRadius: '10px', cursor: 'pointer',
                                border: `2px solid ${formData.delivery === opt ? '#0891b2' : '#e2e8f0'}`,
                                backgroundColor: formData.delivery === opt ? '#cffafe' : '#fff',
                                fontWeight: formData.delivery === opt ? 'bold' : 'normal',
                                color: formData.delivery === opt ? '#0e7490' : '#718096',
                                transition: 'all 0.15s', fontSize: '0.95em'
                            }}>
                                <input type="radio" name="delivery" value={opt} checked={formData.delivery === opt}
                                    onChange={() => setFormData({...formData, delivery: opt, delivery_custom: ''})} style={{ display: 'none' }} />
                                {opt === '직접' ? '🤝 직접' : opt === '택배' ? '📦 택배' : '✏️ 기타'}
                            </label>
                        ))}
                    </div>
                    {formData.delivery === '기타' && (
                        <input type="text" placeholder="수령 방법 직접 입력" value={formData.delivery_custom}
                            onChange={e => setFormData({...formData, delivery_custom: e.target.value})}
                            style={{ marginTop: '8px', width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #67e8f9', fontSize: '1rem' }} />
                    )}
                </div>

                <button
                    type="submit"
                    disabled={mutation.isPending}
                    style={{ 
                        width: '100%', 
                        padding: '14px', 
                        borderRadius: '12px', 
                        border: 'none', 
                        backgroundColor: mutation.isPending ? '#cbd5e0' : '#4f46e5',
                        color: '#fff',
                        fontSize: '1.1rem',
                        fontWeight: 'bold',
                        cursor: mutation.isPending ? 'not-allowed' : 'pointer',
                        transition: 'background-color 0.2s',
                        marginTop: '1rem'
                    }}
                >
                    출고 등록 완료
                </button>
                <LoadingModal isOpen={mutation.isPending} message="출고 내역을 안전하게 저장 중입니다..." />
                <LoadingModal isOpen={isInitialLoading} message="필요한 정보를 불러오는 중입니다..." />

                {!isInitialLoading && (!itemsList || !usersList) && (
                    <div className="alert alert-danger mt-2" style={{ fontSize: '0.85rem' }}>
                        ⚠️ 정보를 불러오지 못했습니다. 서버 상태를 확인해 주세요.
                    </div>
                )}
            </form>

            {isSuccess && (
                <div style={{ 
                    marginTop: '1.5rem', 
                    padding: '1rem', 
                    backgroundColor: '#f0fdf4', 
                    color: '#166534', 
                    borderRadius: '8px', 
                    textAlign: 'center',
                    fontWeight: '500',
                    border: '1px solid #bbf7d0'
                }}>
                    ✅ 정상적으로 등록되었습니다!
                </div>
            )}

            <div style={{ marginTop: '2rem', textAlign: 'center', borderTop: '1px solid #edf2f7', paddingTop: '1.5rem' }}>
                <a href="/dashboard" style={{ color: '#a0aec0', fontSize: '0.85rem', textDecoration: 'none' }}>관리자 대시보드로 이동</a>
            </div>
        </div>
    )
}

export default SelfOutbound

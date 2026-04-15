import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import SearchableSelect from '../components/SearchableSelect'
import LoadingModal from '../components/LoadingModal'

const STAFF_OPTIONS = ['Kale', 'Daniel', '기타']
const DELIVERY_OPTIONS = ['직접', '택배', '기타']

const SelfOutbound = () => {
    const [formData, setFormData] = useState({
        date: new Date().toISOString().split('T')[0],
        item_name: '',
        quantity: '1',
        outbound_type: '일반',
        staff: '',
        staff_custom: '',
        delivery: '',
        delivery_custom: '',
    })
    const [userNames, setUserNames] = useState([''])
    const [filterCategory, setFilterCategory] = useState('')
    const [isSuccess, setIsSuccess] = useState(false)
    const [isSubmitting, setIsSubmitting] = useState(false)

    const isTonner = (name, category) => {
        const n = (name || '').toLowerCase()
        const c = (category || '').toLowerCase()
        return n.includes('tonner') || n.includes('toner') || n.includes('토너')
            || c.includes('tonner') || c.includes('toner') || c.includes('토너')
    }

    const { data: monthsData, isLoading: isMonthsLoading } = useQuery({
        queryKey: ['consumables-months'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/months')
            return data.months || []
        }
    })

    const { data: itemsList, isLoading: isItemsLoading } = useQuery({
        queryKey: ['consumables-items'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/items')
            return data
        }
    })

    const { data: usersList, isLoading: isUsersLoading } = useQuery({
        queryKey: ['integrated-users'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/dashboard/integrated')
            return data
        }
    })

    const isInitialLoading = isMonthsLoading || isItemsLoading || isUsersLoading

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
            const englishName = (u.NAME || '').trim().replace(/\./g, ' ')
            const nameOnly = englishName
                || (u.email || '').split('@')[0].replace(/\./g, ' ')
                || (u.이름 || '').replace(/\./g, ' ')
            const fullNameWithBU = `${nameOnly}${u.BU ? ` (${u.BU})` : ''}`
            return {
                label: nameOnly,
                value: fullNameWithBU,
                subLabel: `${u.email}${u.BU ? ` (${u.BU})` : ''}`,
                name: nameOnly,
                email: u.email,
                bu: u.BU
            }
        }).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [usersList])

    const resetForm = () => {
        setFormData({
            date: new Date().toISOString().split('T')[0],
            item_name: '',
            quantity: '1',
            outbound_type: '일반',
            staff: '',
            staff_custom: '',
            delivery: '',
            delivery_custom: '',
        })
        setUserNames([''])
        setFilterCategory('')
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        const effectiveStaff = formData.staff === '기타' ? formData.staff_custom : formData.staff
        const effectiveDelivery = formData.delivery === '기타' ? formData.delivery_custom : formData.delivery
        const filledUsers = userNames.filter(n => n.trim())
        if (!formData.item_name || filledUsers.length === 0 || !formData.quantity || !effectiveStaff || !effectiveDelivery) {
            alert("모든 필드를 입력해주세요. (지급 대상자, 지급 담당, 수령 방법 포함)")
            return
        }
        const latestMonth = monthsData?.[0]
        if (!latestMonth) { alert("등록 가능한 월 데이터가 없습니다."); return }

        // 여러 명을 쉼표로 합쳐서 1행으로 등록
        const combinedUserName = filledUsers.join(', ')
        setIsSubmitting(true)
        try {
            await axios.post('/api/consumables/outbound', {
                ...formData,
                user_name: combinedUserName,
                staff: effectiveStaff,
                delivery: effectiveDelivery,
                month: latestMonth
            })
            setIsSuccess(true)
            resetForm()
            setTimeout(() => setIsSuccess(false), 3000)
            alert(`출고 등록이 완료되었습니다. (${filledUsers.length}명) 감사합니다!`)
        } catch (err) {
            alert(err.message || "오류가 발생했습니다. 관리자에게 문의하세요.")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div style={{
            minHeight: '100vh',
            overflowY: 'auto',
            padding: '16px',
            boxSizing: 'border-box',
            fontFamily: "'Inter', sans-serif",
            backgroundColor: '#f8fafc'
        }}>
        <div style={{
            maxWidth: '480px',
            margin: '0 auto',
            padding: '1.4rem',
            background: '#fff',
            borderRadius: '14px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.07)',
        }}>
            <div style={{ textAlign: 'center', marginBottom: '1.2rem' }}>
                <h1 style={{ fontSize: '1.2rem', color: '#1a202c', marginBottom: '0.3rem' }}>자율 소모품 출고 등록</h1>
                <p style={{ color: '#718096', fontSize: '0.8rem', margin: 0 }}>가져가시는 물품을 아래에 기록해주세요.</p>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* 출고 날짜 */}
                <div>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.3rem', color: '#4a5568', fontSize: '0.88rem' }}>출고 날짜</label>
                    <input type="date" value={formData.date}
                        onChange={e => setFormData({...formData, date: e.target.value})}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                        required />
                </div>

                {/* 대분류 */}
                <div>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.3rem', color: '#4a5568', fontSize: '0.88rem' }}>대분류 (CATEGORY)</label>
                    <select value={filterCategory}
                        onChange={e => { setFilterCategory(e.target.value); setFormData(f => ({ ...f, item_name: '', outbound_type: '일반' })) }}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem', backgroundColor: '#fff' }}>
                        <option value="">전체 분류</option>
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                </div>

                {/* 품목 */}
                <div>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.3rem', color: '#4a5568', fontSize: '0.88rem' }}>
                        어떤 물건인가요?
                        {filterCategory && <span style={{ marginLeft: '6px', fontSize: '0.85em', color: '#6366f1' }}>[{filterCategory}]</span>}
                    </label>
                    <SearchableSelect options={itemOptions} value={formData.item_name}
                        onChange={val => {
                            const cat = (itemsList || []).find(it => it.item_name === val)?.category || ''
                            setFilterCategory(cat)
                            setFormData(f => ({ ...f, item_name: val, outbound_type: '일반' }))
                        }}
                        placeholder={filterCategory ? `${filterCategory} 품목 검색 및 선택` : '품목 검색 및 선택'}
                        width="100%" />
                </div>

                {/* 토너 유형 선택 */}
                {isTonner(formData.item_name, selectedItemCategory) && (
                    <div style={{ padding: '12px 16px', background: '#fff7ed', border: '2px solid #f97316', borderRadius: '8px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        <span style={{ fontWeight: 'bold', color: '#c2410c', fontSize: '0.95em' }}>🖨️ Tonner 출고 유형 선택</span>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {['일반', '위탁'].map(type => (
                                <label key={type} style={{
                                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                                    padding: '10px', borderRadius: '20px', cursor: 'pointer',
                                    border: `2px solid ${formData.outbound_type === type ? (type === '위탁' ? '#f97316' : '#3b82f6') : '#d1d5db'}`,
                                    backgroundColor: formData.outbound_type === type ? (type === '위탁' ? '#fed7aa' : '#dbeafe') : '#fff',
                                    fontWeight: formData.outbound_type === type ? 'bold' : 'normal',
                                    color: formData.outbound_type === type ? (type === '위탁' ? '#9a3412' : '#1e40af') : '#6b7280',
                                    transition: 'all 0.15s', fontSize: '0.95em'
                                }}>
                                    <input type="radio" name="outbound_type" value={type}
                                        checked={formData.outbound_type === type}
                                        onChange={() => setFormData({...formData, outbound_type: type})}
                                        style={{ display: 'none' }} />
                                    {type === '위탁' ? '🔄 위탁' : '✅ 일반'}
                                </label>
                            ))}
                        </div>
                        <span style={{ fontSize: '0.82em', color: '#92400e' }}>
                            {formData.outbound_type === '위탁' ? '위탁: 견적서 제외 · 위탁 토너 내역에 별도 기록' : '일반: 월별 견적서에 합산'}
                        </span>
                    </div>
                )}

                {/* 수량 */}
                <div>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.3rem', color: '#4a5568', fontSize: '0.88rem' }}>몇 개인가요?</label>
                    <input type="number" min="1" value={formData.quantity}
                        onChange={e => setFormData({...formData, quantity: e.target.value})}
                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '0.9rem' }}
                        required />
                </div>

                {/* 다중 지급 대상자 */}
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '0.6rem' }}>
                        <label style={{ fontWeight: '600', color: '#4a5568' }}>
                            가져가시는 분 성함
                            <span style={{ marginLeft: '8px', padding: '1px 9px', borderRadius: '10px', fontSize: '0.8em', backgroundColor: '#e0e7ff', color: '#4338ca', fontWeight: 'bold' }}>
                                {userNames.filter(n => n).length}명
                            </span>
                        </label>
                        <button type="button" onClick={() => setUserNames(prev => [...prev, ''])}
                            style={{ padding: '3px 12px', fontSize: '0.82em', borderRadius: '12px', border: '1px dashed #6366f1', background: '#f5f3ff', color: '#4f46e5', cursor: 'pointer', fontWeight: 'bold' }}>
                            + 인원 추가
                        </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {userNames.map((uName, idx) => (
                            <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '0.85em', color: '#6b7280', minWidth: '20px' }}>{idx + 1}.</span>
                                <div style={{ flex: 1 }}>
                                    <SearchableSelect options={userOptions} value={uName}
                                        onChange={val => {
                                            const next = [...userNames]
                                            next[idx] = val
                                            setUserNames(next)
                                        }}
                                        placeholder="성함 검색 (이름/이메일)"
                                        searchFields={["name", "email", "bu"]}
                                        width="100%"
                                        allowCustom={true} />
                                </div>
                                {userNames.length > 1 && (
                                    <button type="button" onClick={() => setUserNames(prev => prev.filter((_, i) => i !== idx))}
                                        style={{ padding: '3px 8px', fontSize: '0.8em', borderRadius: '50%', border: '1px solid #fca5a5', background: '#fff', color: '#ef4444', cursor: 'pointer' }}>
                                        ✕
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                </div>

                {/* 지급 담당 */}
                <div>
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.3rem', color: '#4a5568', fontSize: '0.88rem' }}>지급 담당 <span style={{ color: '#e53e3e' }}>*</span></label>
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
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.3rem', color: '#4a5568', fontSize: '0.88rem' }}>수령 방법 <span style={{ color: '#e53e3e' }}>*</span></label>
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

                <button type="submit" disabled={isSubmitting}
                    style={{
                        width: '100%', padding: '14px', borderRadius: '12px', border: 'none',
                        backgroundColor: isSubmitting ? '#cbd5e0' : '#4f46e5',
                        color: '#fff', fontSize: '1.1rem', fontWeight: 'bold',
                        cursor: isSubmitting ? 'not-allowed' : 'pointer',
                        transition: 'background-color 0.2s', marginTop: '1rem'
                    }}>
                    {isSubmitting ? '등록 중...' : `출고 등록 완료 (${userNames.filter(n=>n).length}명)`}
                </button>

                <LoadingModal isOpen={isSubmitting} message="출고 내역을 안전하게 저장 중입니다..." />
                <LoadingModal isOpen={isInitialLoading} message="필요한 정보를 불러오는 중입니다..." />

                {!isInitialLoading && (!itemsList || !usersList) && (
                    <div className="alert alert-danger mt-2" style={{ fontSize: '0.85rem' }}>
                        ⚠️ 정보를 불러오지 못했습니다. 서버 상태를 확인해 주세요.
                    </div>
                )}
            </form>

            {isSuccess && (
                <div style={{ marginTop: '1.5rem', padding: '1rem', backgroundColor: '#f0fdf4', color: '#166534', borderRadius: '8px', textAlign: 'center', fontWeight: '500', border: '1px solid #bbf7d0' }}>
                    ✅ 정상적으로 등록되었습니다!
                </div>
            )}

            <div style={{ marginTop: '1.5rem', textAlign: 'center', borderTop: '1px solid #edf2f7', paddingTop: '1rem' }}>
                <a href="/dashboard" style={{ color: '#a0aec0', fontSize: '0.82rem', textDecoration: 'none' }}>관리자 대시보드로 이동</a>
            </div>
        </div>
        </div>
    )
}

export default SelfOutbound

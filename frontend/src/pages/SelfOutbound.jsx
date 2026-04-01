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
        user_name: '' 
    })
    const [isSuccess, setIsSuccess] = useState(false)

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

    const itemOptions = useMemo(() => 
        (itemsList || []).map(it => ({ label: it.item_name, value: it.item_name })), 
    [itemsList])

    const userOptions = useMemo(() => 
        (usersList || []).map(u => {
            const nameOnly = (u.이름 || u.NAME || '').replace(/\./g, ' ');
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

    const mutation = useMutation({
        mutationFn: async (newData) => {
            const latestMonth = monthsData?.[0]
            if (!latestMonth) throw new Error("등록 가능한 월 데이터가 없습니다.")
            return axios.post('/api/consumables/outbound', { ...newData, month: latestMonth })
        },
        onSuccess: () => {
            setIsSuccess(true)
            setFormData({ 
                date: new Date().toISOString().split('T')[0], 
                item_name: '', 
                quantity: '1', 
                user_name: '' 
            })
            setTimeout(() => setIsSuccess(false), 3000)
            alert("출고 등록이 완료되었습니다. 감사합니다!")
        },
        onError: (err) => alert(err.message || "오류가 발생했습니다. 관리자에게 문의하세요.")
    })

    const handleSubmit = (e) => {
        e.preventDefault()
        if (!formData.item_name || !formData.user_name || !formData.quantity) {
            alert("모든 필드를 입력해주세요.")
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
                    <label style={{ display: 'block', fontWeight: '600', marginBottom: '0.5rem', color: '#4a5568' }}>어떤 물건인가요?</label>
                    <SearchableSelect 
                        options={itemOptions} 
                        value={formData.item_name} 
                        onChange={val => setFormData({...formData, item_name: val})} 
                        placeholder="품목 검색 및 선택" 
                        width="100%"
                    />
                </div>

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

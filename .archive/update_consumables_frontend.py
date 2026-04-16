with open('frontend/src/pages/Consumables.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

# 1. Update text mappings in ItemsTab
text = text.replace("발주 수량 (현재 입고량)", "현재 재고 (물건 들여올 때 직접 입력)")
# The helper text at the bottom
text = text.replace("* 품목명이 같을 경우 수정되고, 다를 경우 덧붙여집니다. 재고 추적을 켜고 기준 수량을 입력하시면 재고가 부족할 때 사이트에서 알려줍니다.", "* 품목명이 같을 경우 수정되고, 다를 경우 덧붙여집니다. 재고 추적 시 '현재 재고'를 입력해두면 총 출고량을 차감한 진짜 잔여 재고를 자동 계산합니다.")

# 2. Update text mappings in TrackedItemsTab
text = text.replace("💡 <strong>현재 재고</strong> = <strong>발주 수량</strong> - <strong>출고 수량 합계</strong> (등록된 모든 월 기준)<br/>", "💡 <strong>최종 잔여 재고</strong> = <strong>입력한 현재 재고</strong> - <strong>총 출고 수량 합계</strong> (등록된 모든 월 표 기준)<br/>")
text = text.replace("고정 재고(최소기준선)보다 현재 재고가 낮아지면 🚨 <strong>부족</strong> 경고가 표", "고정 재고(최소기준선)보다 최종 잔여 재고가 낮아지면 🚨 <strong>부족</strong> 경고가 표")
text = text.replace(">총 발주 수량<", ">현재 재고 (입고량)<")
text = text.replace(">잔여 현재재고<", ">최종 잔여 재고<")

# 3. Inject New Tab Button in Consumables Component
old_tabs = """<button
                    className={`btn ${activeTab === 'outbound' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('outbound')}
                >
                    월별 출고 개별 내역
                </button>"""
new_tabs = """<button
                    className={`btn ${activeTab === 'outbound' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('outbound')}
                >
                    월별 출고 개별 내역
                </button>
                <button
                    className={`btn ${activeTab === 'create-month' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('create-month')}
                    style={{ backgroundColor: activeTab === 'create-month' ? '' : '#fffbe6', border: '1px solid #d4b106' }}
                >
                    📝 신규 출고월 시작
                </button>"""
text = text.replace(old_tabs, new_tabs)

# 4. Inject Tab Render logic
old_render = "{activeTab === 'outbound' && selectedMonth && <OutboundTab month={selectedMonth} />}"
new_render = "{activeTab === 'outbound' && selectedMonth && <OutboundTab month={selectedMonth} />}\n            {activeTab === 'create-month' && <CreateMonthTab />}"
text = text.replace(old_render, new_render)

# 5. Inject CreateMonthTab Component at the end
create_month_component = """
const CreateMonthTab = () => {
    const queryClient = useQueryClient()
    const [monthName, setMonthName] = useState('')
    const [startDate, setStartDate] = useState('')

    const mutation = useMutation({
        mutationFn: async (newData) => {
            return axios.post('/api/consumables/months', newData)
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['consumables-months'])
            alert(`${monthName} 출고 내역 시트가 생성되었습니다! 이제 '월별 출고 개별 내역' 탭에서 선택할 수 있습니다.`)
            setMonthName('')
            setStartDate('')
        },
        onError: () => alert("오류가 발생했습니다. 이미 존재하는 월 이름일 수 있습니다.")
    })

    const handleSubmit = (e) => {
        e.preventDefault()
        if (!monthName.trim()) {
            alert("지정할 월을 입력해주세요.")
            return
        }
        mutation.mutate({ month: monthName.trim(), start_date: startDate.trim() })
    }

    return (
        <div className="card" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h3 style={{ marginBottom: '1rem' }}>📝 신규 월 출고 내역 시작하기</h3>
            <div className="alert alert-info" style={{ marginBottom: '1.5rem', lineHeight: '1.5' }}>
                💡 이번 달 혹은 새로운 분기의 출고 내역을 적기 시작할 때 사용합니다.<br/>
                지정하신 '월' 이름으로 구글 시트 탭이 생성되며, 앞으로 해당 시트에 출고 내역이 저장됩니다.
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>새로운 출고 내역 지정 월 (필수)</label>
                    <input 
                        type="text" 
                        placeholder="예: 4월 (혹은 2026년 4월)" 
                        value={monthName}
                        onChange={e => setMonthName(e.target.value)}
                        style={{ padding: '10px', width: '100%', border: '1px solid #ccc', borderRadius: '4px' }}
                        required
                    />
                    <small style={{ color: '#666', display: 'block', marginTop: '4px' }}>반드시 뒤에 '월' 글자를 포함해서 적어주세요.</small>
                </div>
                <div>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '8px' }}>출고 시작 날짜 (선택)</label>
                    <input 
                        type="text" 
                        placeholder="예: 2026.04.01" 
                        value={startDate}
                        onChange={e => setStartDate(e.target.value)}
                        style={{ padding: '10px', width: '100%', border: '1px solid #ccc', borderRadius: '4px' }}
                    />
                    <small style={{ color: '#666', display: 'block', marginTop: '4px' }}>출고의 시작을 알리는 안내 첫 행에 기록됩니다.</small>
                </div>
                <button type="submit" className="btn btn-primary" style={{ padding: '12px', fontSize: '1.1em', marginTop: '10px' }} disabled={mutation.isLoading}>
                    {mutation.isLoading ? '시트 개설 중...' : '새로운 월 출고 시트 개설하기'}
                </button>
            </form>
        </div>
    )
}
"""

text = text.replace("export default Consumables", create_month_component + "\nexport default Consumables")

with open('frontend/src/pages/Consumables.jsx', 'w', encoding='utf-8') as f:
    f.write(text)


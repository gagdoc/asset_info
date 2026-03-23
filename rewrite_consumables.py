import re

with open('frontend/src/pages/Consumables.jsx', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Update Tabs in Consumables
code = code.replace(
    "전체 품목 리스트\n                </button>\n            </div>",
    "소모품 마스터 리스트\n                </button>\n                <button\n                    className={`btn ${activeTab === 'tracked' ? 'btn-primary' : ''}`}\n                    onClick={() => setActiveTab('tracked')}\n                >\n                    📍 재고 추적 관리\n                </button>\n            </div>"
)

code = code.replace(
    "{activeTab === 'items' && <ItemsTab />}",
    "{activeTab === 'items' && <ItemsTab />}\n            {activeTab === 'tracked' && <TrackedItemsTab />}"
)

# 2. Update ItemsTab formData and State
code = code.replace(
    "const [formData, setFormData] = useState({ category: '', item_name: '', price: '', is_tracked: false, base_qty: '' })",
    "const [formData, setFormData] = useState({ category: '', item_name: '', price: '', is_tracked: false, base_qty: '', order_qty: '' })"
)

code = code.replace(
    "setFormData({ category: '', item_name: '', price: '', is_tracked: false, base_qty: '' })",
    "setFormData({ category: '', item_name: '', price: '', is_tracked: false, base_qty: '', order_qty: '' })"
)

code = code.replace(
    "setFormData({ category: item.category, item_name: item.item_name, price: item.price, is_tracked: item.is_tracked || false, base_qty: item.base_qty || '' })",
    "setFormData({ category: item.category, item_name: item.item_name, price: item.price, is_tracked: item.is_tracked || false, base_qty: item.base_qty || '', order_qty: item.order_qty || '' })"
)

# 3. Update Form Inputs in ItemsTab
old_inputs = """                    {formData.is_tracked && (
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', color: '#1976d2', fontWeight: 'bold' }}>초기 재고 (개)</label>
                            <input type="number" min="1" placeholder="100" value={formData.base_qty} onChange={e => setFormData({...formData, base_qty: e.target.value})} style={{ padding: '8px', width: '80px', border: '1px solid #1976d2' }} required />
                        </div>
                    )}"""

new_inputs = """                    {formData.is_tracked && (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', color: '#10b981', fontWeight: 'bold' }}>발주 수량 (현재 입고량)</label>
                                <input type="number" min="0" placeholder="100" value={formData.order_qty} onChange={e => setFormData({...formData, order_qty: e.target.value})} style={{ padding: '8px', width: '80px', border: '1px solid #10b981' }} required />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', color: '#ef4444', fontWeight: 'bold' }}>고정 재고 (부족 알림 기준)</label>
                                <input type="number" min="0" placeholder="10" value={formData.base_qty} onChange={e => setFormData({...formData, base_qty: e.target.value})} style={{ padding: '8px', width: '80px', border: '1px solid #ef4444' }} required />
                            </div>
                        </>
                    )}"""
code = code.replace(old_inputs, new_inputs)

# 4. Update the logic for statusBadge in ItemsTab
badge_logic_old = """                        if (item.is_tracked) {
                            const current = item.current_stock || 0
                            const base = item.base_qty || 1
                            const ratio = (current / base) * 100
                            const isLow = ratio < 10"""
badge_logic_new = """                        if (item.is_tracked) {
                            const current = item.current_stock || 0
                            const base = item.base_qty || 1
                            const isLow = current < base"""
code = code.replace(badge_logic_old, badge_logic_new)


# 5. Add Modal State to TrackedItemsTab
# But first, we need to append the TrackedItemsTab and Modal components at the end of the file.

components_to_add = """

const ItemHistoryModal = ({ itemName, onClose }) => {
    const { data: history, isLoading } = useQuery({
        queryKey: ['item-history', itemName],
        queryFn: async () => {
            const { data } = await axios.get(`/api/consumables/items/${itemName}/outbound`)
            return data
        }
    })

    return (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
            <div className="card" style={{ width: '600px', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                    <h3 style={{ margin: 0 }}>📍 [{itemName}] 출고 이력 (년-월별)</h3>
                    <button className="btn btn-secondary" onClick={onClose}>닫기</button>
                </div>
                {isLoading ? <div>데이터를 불러오는 중...</div> : (
                    <div className="table-wrapper" style={{ flex: 1, overflow: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>출고 월 (Sheet)</th>
                                    <th>출고 일자</th>
                                    <th>출고 수량</th>
                                    <th>사용자/팀</th>
                                </tr>
                            </thead>
                            <tbody>
                                {history?.length > 0 ? history.map((row, idx) => (
                                    <tr key={idx}>
                                        <td style={{ fontWeight: 'bold', color: '#0ea5e9' }}>{row.month}</td>
                                        <td>{row.date}</td>
                                        <td style={{ textAlign: 'center', color: '#ef4444', fontWeight: 'bold' }}>{row.quantity}</td>
                                        <td>{row.user_name}</td>
                                    </tr>
                                )) : (
                                    <tr><td colSpan="4" style={{ textAlign: 'center' }}>출고 내역이 없습니다.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    )
}

const TrackedItemsTab = () => {
    const [selectedHistoryItem, setSelectedHistoryItem] = useState(null)
    const { data: items, isLoading } = useQuery({
        queryKey: ['consumables-items'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/items')
            return data
        }
    })

    if (isLoading) return <div>Loading...</div>

    const trackedItems = items?.filter(item => item.is_tracked) || []

    return (
        <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>📍 재고 추적 관리 현황</h3>
            <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                💡 <strong>현재 재고</strong> = <strong>발주 수량</strong> - <strong>출고 수량 합계</strong> (등록된 모든 월 기준)<br/>
                고정 재고(최소기준선)보다 현재 재고가 낮아지면 🚨 <strong>부족</strong> 경고가 표시됩니다.
            </div>
            
            <table className="data-table">
                <thead>
                    <tr>
                        <th>품목명</th>
                        <th style={{ textAlign: 'center' }}>고정 재고(기준선)</th>
                        <th style={{ textAlign: 'center', color: '#10b981' }}>총 발주 수량</th>
                        <th style={{ textAlign: 'center', color: '#f59e0b' }}>총 출고 수량</th>
                        <th style={{ textAlign: 'center', color: '#3b82f6', fontSize: '1.1em' }}>잔여 현재재고</th>
                        <th style={{ textAlign: 'center' }}>상태</th>
                        <th style={{ textAlign: 'center' }}>상세 내역</th>
                    </tr>
                </thead>
                <tbody>
                    {trackedItems.length > 0 ? trackedItems.map((item, idx) => {
                        const current = item.current_stock || 0
                        const base = item.base_qty || 1
                        const order = item.order_qty || 0
                        const dispatched = item.dispatched_qty || 0
                        const isLow = current < base
                        
                        return (
                            <tr key={idx} style={{ backgroundColor: isLow ? '#fff5f5' : 'transparent' }}>
                                <td style={{ fontWeight: 'bold' }}>{item.item_name}</td>
                                <td style={{ textAlign: 'center', color: '#6b7280' }}>{base}</td>
                                <td style={{ textAlign: 'center', color: '#10b981', fontWeight: 'bold' }}>{order}</td>
                                <td style={{ textAlign: 'center', color: '#f59e0b', fontWeight: 'bold' }}>{dispatched} (월별전체)</td>
                                <td style={{ textAlign: 'center', color: '#3b82f6', fontWeight: 'bold', fontSize: '1.2em' }}>{current}</td>
                                <td style={{ textAlign: 'center' }}>
                                    <span style={{ 
                                        padding: '4px 10px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 'bold', display: 'inline-block',
                                        backgroundColor: isLow ? '#fee2e2' : '#dcfce7', color: isLow ? '#ef4444' : '#22c55e'
                                    }}>
                                        {isLow ? `🚨 부족` : `✅ 양호`}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <button className="btn btn-secondary btn-sm" onClick={() => setSelectedHistoryItem(item.item_name)}>년-월별 출고조회</button>
                                </td>
                            </tr>
                        )
                    }) : (
                        <tr><td colSpan="7" style={{ textAlign: 'center' }}>재고 추적 중인 품목이 없습니다.</td></tr>
                    )}
                </tbody>
            </table>

            {selectedHistoryItem && <ItemHistoryModal itemName={selectedHistoryItem} onClose={() => setSelectedHistoryItem(null)} />}
        </div>
    )
}
"""

if "TrackedItemsTab" not in code:
    code = code.replace("export default Consumables", components_to_add + "\nexport default Consumables")

with open('frontend/src/pages/Consumables.jsx', 'w', encoding='utf-8') as f:
    f.write(code)


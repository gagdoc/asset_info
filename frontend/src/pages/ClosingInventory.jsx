import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { SnapshotInventoryView } from './Consumables'
import { exportToXLSX, todayStr, ExportButton } from '../utils/exportUtils'

function NamedInventorySaves() {
    const [selected, setSelected] = useState('')
    const { data: saves = [], isPending, isError, refetch } = useQuery({
        queryKey: ['inventory-saves'],
        queryFn: async () => (await axios.get('/api/consumables/inventory-saves')).data,
    })
    const id = saves.some(s => s.save_id === selected) ? selected : (saves[0]?.save_id || '')
    const { data: detail, isPending: loadingDetail, isError: detailError } = useQuery({
        queryKey: ['inventory-save', id],
        queryFn: async () => (await axios.get(`/api/consumables/inventory-saves/${encodeURIComponent(id)}`)).data,
        enabled: !!id,
    })
    return <section className="card" style={{ marginBottom: '1.5rem' }}>
        <h2>이름으로 저장한 재고</h2>
        <p>재고 추적 관리에서 ‘현재 재고 저장’으로 보관한 기록입니다. 저장 후 입출고가 발생해도 이 수량은 바뀌지 않습니다.</p>
        {isPending ? <p role="status">저장 목록을 불러오는 중입니다...</p>
            : isError ? <p role="alert">저장 목록을 불러오지 못했습니다. <button onClick={() => refetch()}>다시 시도</button></p>
                : !saves.length ? <p>아직 이름으로 저장한 재고가 없습니다.</p>
                    : <>
                        <label htmlFor="named-inventory">저장 기록 </label>
                        <select id="named-inventory" value={id} onChange={e => setSelected(e.target.value)}>
                            {saves.map(s => <option key={s.save_id} value={s.save_id}>{s.label} · {new Date(s.saved_at).toLocaleString('ko-KR')} · {s.item_count}개 품목</option>)}
                        </select>
                        {loadingDetail ? <p role="status">저장한 재고를 불러오는 중입니다...</p>
                            : detailError ? <p role="alert">저장한 재고를 불러오지 못했습니다.</p>
                                : detail && <>
                                    <h3>{detail.label}</h3>
                                    <p>저장 시각: {new Date(detail.saved_at).toLocaleString('ko-KR')}</p>
                                    <ExportButton onClick={() => exportToXLSX({ filename: `저장재고_${todayStr()}`, rows: detail.items, columns: [{key:'item_name',label:'품목명'},{key:'category',label:'분류'},{key:'price',label:'단가'},{key:'current_stock',label:'저장 재고'}] })} />
                                    <div className="table-wrapper"><table className="data-table">
                                        <thead><tr><th>품목명</th><th>분류</th><th>단가</th><th>저장 재고</th></tr></thead>
                                        <tbody>{detail.items.map((item, index) => <tr key={index}><td>{item.item_name}</td><td>{item.category}</td><td>{item.price}</td><td>{Number(item.current_stock).toLocaleString()}</td></tr>)}</tbody>
                                    </table></div>
                                </>}
                    </>}
    </section>
}

export default function ClosingInventory() {
    const [selectedMonth, setSelectedMonth] = useState('')
    const { data: months = [], isPending, isError, refetch } = useQuery({
        queryKey: ['closed-months'],
        queryFn: async () => (await axios.get('/api/consumables/closed-months')).data,
    })
    const month = months.includes(selectedMonth) ? selectedMonth : (months[0] || '')

    return <div>
        <NamedInventorySaves />
        <h1>월별 마감 재고</h1>
        <p>월별 출고 내역에서 마감할 때 저장한 재고입니다. 마감 당시 재고 추적 대상이었던 품목만 표시합니다.</p>
        <p><Link to="/consumables">소모품 관리로 이동 →</Link></p>
        {isPending ? <div role="status">마감월 목록을 불러오는 중입니다...</div>
            : isError ? <div role="alert">마감월 목록을 불러오지 못했습니다. <button className="btn btn-secondary" onClick={() => refetch()}>다시 시도</button></div>
                : months.length === 0 ? <div className="card">
                    <h3>저장된 마감 재고가 없습니다.</h3>
                    <p>소모품 관리의 ‘월별 출고 개별 내역’에서 월을 마감하면 여기에 저장됩니다. 기존의 과거 재고를 현재 수량으로 소급 생성하지 않습니다.</p>
                </div> : <>
                    <div className="card" style={{ marginBottom: '1rem' }}>
                        <label htmlFor="closing-month">마감월 </label>
                        <select id="closing-month" value={month} onChange={e => setSelectedMonth(e.target.value)}>
                            {months.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>
                    <SnapshotInventoryView month={month} />
                </>}
    </div>
}

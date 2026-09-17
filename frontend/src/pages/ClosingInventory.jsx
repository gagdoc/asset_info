import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import axios from 'axios'
import { SnapshotInventoryView } from './Consumables'

export default function ClosingInventory() {
    const [selectedMonth, setSelectedMonth] = useState('')
    const { data: months = [], isPending, isError, refetch } = useQuery({
        queryKey: ['closed-months'],
        queryFn: async () => (await axios.get('/api/consumables/closed-months')).data,
    })
    const month = months.includes(selectedMonth) ? selectedMonth : (months[0] || '')

    return <div>
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

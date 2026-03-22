import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import axios from 'axios'
import { format } from 'date-fns'

const Consumables = () => {
    const [activeTab, setActiveTab] = useState('outbound')

    return (
        <div>
            <h1>소모품 관리</h1>

            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <button
                    className={`btn ${activeTab === 'outbound' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('outbound')}
                >
                    출고 내역
                </button>
                <button
                    className={`btn ${activeTab === 'items' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('items')}
                >
                    품목 리스트
                </button>
            </div>

            {activeTab === 'outbound' && <OutboundTab />}
            {activeTab === 'items' && <ItemsTab />}
        </div>
    )
}

const OutboundTab = () => {
    const { data: history, isLoading } = useQuery({
        queryKey: ['consumables-outbound'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/outbound')
            return data
        }
    })

    if (isLoading) return <div>Loading...</div>

    return (
        <div className="card">
            <h3>출고 이력</h3>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Item</th>
                        <th>Qty</th>
                        <th>User</th>
                        <th>Dept</th>
                    </tr>
                </thead>
                <tbody>
                    {history?.map((row, idx) => (
                        <tr key={idx}>
                            <td>{row.date}</td>
                            <td>{row.item_name}</td>
                            <td>{row.quantity}</td>
                            <td>{row.user_name}</td>
                            <td>{row.department}</td>
                        </tr>
                    ))}
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
            <h3>품목 재고 현황</h3>
            <table className="data-table">
                <thead>
                    <tr>
                        <th>Item</th>
                        <th>Category</th>
                        <th>Current Qty</th>
                        <th>Fixed Qty</th>
                    </tr>
                </thead>
                <tbody>
                    {items?.map((item, idx) => (
                        <tr key={idx}>
                            <td>{item.item_name}</td>
                            <td>{item.category}</td>
                            <td>{item.current_qty}</td>
                            <td>{item.fixed_qty}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

export default Consumables

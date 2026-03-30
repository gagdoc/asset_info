import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import ConfirmModal from '../components/ConfirmModal'
import SearchableSelect from '../components/SearchableSelect'
import LoadingModal from '../components/LoadingModal'

const Consumables = () => {
    const [activeTab, setActiveTab] = useState('estimate')
    const [selectedMonth, setSelectedMonth] = useState('')
    const queryClient = useQueryClient()
    const [isSyncing, setIsSyncing] = useState(false)

    const handleSync = async () => {
        setIsSyncing(true)
        try {
            await axios.get('/api/consumables/clear-cache')
            queryClient.invalidateQueries(['consumables-items'])
            queryClient.invalidateQueries(['consumables-months'])
            queryClient.invalidateQueries(['consumables-estimate'])
            alert("구글 시트와 동기화되었습니다.")
        } catch (error) {
            console.error("Sync error:", error)
            alert("동기화 중 오류가 발생했습니다.")
        } finally {
            setIsSyncing(false)
        }
    }

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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h1 style={{ margin: 0 }}>📦 소모품 월별 관리 및 견적서</h1>
                    <button 
                        onClick={handleSync} 
                        disabled={isSyncing}
                        className="btn btn-secondary"
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '5px',
                            backgroundColor: '#f8fafc',
                            color: '#475569',
                            border: '1px solid #e2e8f0',
                            padding: '6px 12px',
                            fontSize: '0.9em'
                        }}
                    >
                        {isSyncing ? '동기화 중...' : '🔄 시트 데이터 동기화'}
                    </button>
                </div>
                
                {activeTab !== 'create-month' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#fff', padding: '8px 12px', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
                        <label style={{ fontWeight: 'bold' }}>📅 조회 월 선택:</label>
                        <select 
                            value={selectedMonth} 
                            onChange={(e) => setSelectedMonth(e.target.value)}
                            style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ddd', minWidth: '150px' }}
                        >
                            <option value="">전체 기록</option>
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
                    className={`btn ${activeTab === 'create-month' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('create-month')}
                    style={{ backgroundColor: activeTab === 'create-month' ? '' : '#fffbe6', border: '1px solid #d4b106' }}
                >
                    📝 신규 출고월 시작
                </button>
                <button
                    className={`btn ${activeTab === 'items' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('items')}
                >
                    소모품 마스터 리스트
                </button>
                <button
                    className={`btn ${activeTab === 'tracked' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('tracked')}
                >
                    📍 재고 추적 관리
                </button>
            </div>

            {activeTab === 'estimate' && selectedMonth && <EstimateTab month={selectedMonth} />}
            {activeTab === 'outbound' && selectedMonth && <OutboundTab month={selectedMonth} />}
            {activeTab === 'create-month' && <CreateMonthTab />}
            {activeTab === 'items' && <ItemsTab month={selectedMonth} />}
            {activeTab === 'tracked' && <TrackedItemsTab month={selectedMonth} />}
            
            {(activeTab === 'estimate' || activeTab === 'outbound') && !selectedMonth && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#666' }}>조회할 월(Month) 데이터를 불러오는 중입니다...</div>
            )}

            <LoadingModal isOpen={isSyncing} message="구글 시트와 동기화 중입니다..." />
        </div>
    )
}

// 인라인 수정을 위한 공통 셀 컴포넌트
const EditableCell = ({ value, onSave, type = "text", bold = false, align = "left" }) => {
    const [isEditing, setIsEditing] = useState(false)
    const [tempValue, setTempValue] = useState(value)

    const handleStartEdit = () => {
        // 숫자형인 경우 쉼표를 제거하고 시작해야 input type="number"에서 정상 인식됨
        const cleanValue = value?.toString().replace(/,/g, '')
        setTempValue(cleanValue)
        setIsEditing(true)
    }

    const handleBlur = () => {
        setIsEditing(false)
        if (tempValue !== value?.toString().replace(/,/g, '')) onSave(tempValue)
    }

    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            setIsEditing(false)
            if (tempValue !== value?.toString().replace(/,/g, '')) onSave(tempValue)
        }
        if (e.key === 'Escape') {
            setIsEditing(false)
            setTempValue(value)
        }
    }

    if (isEditing) {
        return (
            <td style={{ padding: '0' }}>
                <input 
                    autoFocus
                    type={type}
                    value={tempValue}
                    onChange={e => setTempValue(e.target.value)}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    onFocus={e => e.target.select()}
                    style={{ 
                        width: '100%', 
                        padding: '10px 8px', 
                        border: '2px solid #0ea5e9', 
                        borderRadius: '4px',
                        boxSizing: 'border-box',
                        fontSize: '1em',
                        textAlign: align
                    }}
                />
            </td>
        )
    }

    return (
        <td 
            onDoubleClick={handleStartEdit}
            className="editable-cell"
            style={{ 
                cursor: 'pointer', 
                textAlign: align,
                fontWeight: bold ? 'bold' : 'normal',
                backgroundColor: isEditing ? '#f0f9ff' : 'transparent',
                transition: 'all 0.2s',
                border: isEditing ? 'none' : '1px dashed transparent',
                borderRadius: '4px'
            }}
            onMouseOver={e => e.currentTarget.style.backgroundColor = '#f0f9ff'}
            onMouseOut={e => e.currentTarget.style.backgroundColor = isEditing ? '#f0f9ff' : 'transparent'}
            title="더블 클릭하여 수정"
        >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: align === 'center' ? 'center' : align === 'right' ? 'flex-end' : 'flex-start', gap: '4px' }}>
                {type === 'number' || !isNaN(Number(value?.toString().replace(/,/g, ''))) ? Number(value?.toString().replace(/,/g, '')).toLocaleString() : value}
                <span style={{ fontSize: '0.8em', opacity: 0.3 }}>✎</span>
            </div>
        </td>
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
                                <td style={{ fontSize: '0.9em', color: '#555' }}>{row.users?.replace(/\s*\(.*?\)/g, '').replace(/\./g, ' ')}</td>
                                <td style={{ textAlign: 'right' }}>{row.unit_price?.toLocaleString()}</td>
                                <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#e53e3e' }}>{row.total_price?.toLocaleString()}</td>
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


// SearchableSelect deleted (moved to components)

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

    const [editingRow, setEditingRow] = useState(null)
    const [editForm, setEditForm] = useState({})

    const updateMutation = useMutation({
        mutationFn: async (newData) => await axios.put('/api/consumables/outbound', newData),
        onSuccess: () => {
            queryClient.invalidateQueries(['consumables-outbound', month])
            queryClient.invalidateQueries(['consumables-items'])
            setEditingRow(null)
            alert("출고 내역이 수정되었습니다.")
        },
        onError: () => alert("수정 중 오류가 발생했습니다.")
    })

    const deleteMutation = useMutation({
        mutationFn: async (rowIndex) => await axios.delete(`/api/consumables/outbound?month=${month}&row_index=${rowIndex}`),
        onSuccess: () => {
            queryClient.invalidateQueries(['consumables-outbound', month])
            queryClient.invalidateQueries(['consumables-items'])
            alert("출고 내역이 삭제되었습니다.")
        },
        onError: () => alert("삭제 중 오류가 발생했습니다.")
    })

    const handleEditStart = (row) => {
        setEditingRow(row.row_index)
        setEditForm({ ...row })
    }

    const handleEditSave = () => {
        if (!editForm.date || !editForm.item_name || !editForm.quantity || !editForm.user_name) {
            alert("모든 필드를 입력해야 합니다.")
            return
        }
        updateMutation.mutate({ month, row_index: editForm.row_index, ...editForm })
    }

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, rowIndex: null })

    const handleDelete = (rowIndex) => {
        setConfirmModal({ isOpen: true, rowIndex })
    }

    const executeDelete = () => {
        deleteMutation.mutate(confirmModal.rowIndex)
        setConfirmModal({ isOpen: false, rowIndex: null })
    }

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

    const itemOptions = useMemo(() => 
        (itemsList || []).map(it => ({ label: it.item_name, value: it.item_name })), 
    [itemsList])

    const userOptions = useMemo(() => 
        (usersList || []).map(u => {
            const nameOnly = (u.이름 || u.NAME || '').replace(/\./g, ' ');
            return { 
                label: nameOnly, 
                value: nameOnly,
                subLabel: `${u.email}${u.BU ? ` (${u.BU})` : ''}`,
                name: nameOnly,
                email: u.email,
                bu: u.BU
            };
        }).sort((a, b) => (a.name || '').localeCompare(b.name || '')), 
    [usersList])

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
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>출고 날짜</label>
                        <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }} required />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>품목</label>
                        <SearchableSelect 
                            options={itemOptions} 
                            value={formData.item_name} 
                            onChange={val => setFormData({...formData, item_name: val})} 
                            placeholder="품목 선택" 
                            width="250px"
                        />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>수량</label>
                        <input type="number" min="1" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} style={{ padding: '8px', width: '80px', borderRadius: '4px', border: '1px solid #ddd' }} required />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>사용자 이름</label>
                        <SearchableSelect 
                            options={userOptions} 
                            value={formData.user_name} 
                            onChange={val => setFormData({...formData, user_name: val})} 
                            placeholder="사용자 검색 (이름/이메일)" 
                            searchFields={["name", "email", "bu"]}
                            width="300px"
                        />
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={mutation.isLoading}>
                        확인
                    </button>
                    <LoadingModal isOpen={mutation.isLoading} message="출고 내역을 구글 시트에 기록 중입니다..." />
                    <LoadingModal isOpen={updateMutation.isLoading} message="출고 내역을 수정하고 있습니다..." />
                    <LoadingModal isOpen={deleteMutation.isLoading} message="출고 내역을 삭제하고 있습니다..." />
                </form>
            )}

            <table className="data-table">
                <thead>
                    <tr>
                        <th>출고 날짜</th>
                        <th>출고 품목명</th>
                        <th>지급 수량</th>
                        <th>지급 대상자</th>
                        <th style={{ textAlign: 'center', width: '120px' }}>관리</th>
                    </tr>
                </thead>
                <tbody>
                    {history?.length > 0 ? history.map((row, idx) => {
                        const isEditing = editingRow === row.row_index;
                        return (
                            <tr key={idx} style={{ backgroundColor: isEditing ? '#f8f9fa' : 'transparent' }}>
                                {isEditing ? (
                                    <>
                                        <td>
                                            <input type="date" value={editForm.date} onChange={e => setEditForm({...editForm, date: e.target.value})} style={{ width: '130px', padding: '4px', borderRadius: '4px', border: '1px solid #ddd' }} />
                                        </td>
                                        <td>
                                            <SearchableSelect 
                                                options={itemOptions} 
                                                value={editForm.item_name} 
                                                onChange={val => setEditForm({...editForm, item_name: val})} 
                                                placeholder="품목 선택" 
                                                width="180px"
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <input type="number" min="1" value={editForm.quantity} onChange={e => setEditForm({...editForm, quantity: e.target.value})} style={{ width: '60px', padding: '4px', textAlign: 'center', borderRadius: '4px', border: '1px solid #ddd' }} />
                                        </td>
                                        <td>
                                            <SearchableSelect 
                                                options={userOptions} 
                                                value={editForm.user_name} 
                                                onChange={val => setEditForm({...editForm, user_name: val})} 
                                                placeholder="사용자 검색" 
                                                searchFields={["name", "email", "bu"]}
                                                width="200px"
                                            />
                                        </td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button className="btn btn-primary" style={{ padding: '2px 6px', fontSize: '0.8rem', marginRight: '4px' }} onClick={handleEditSave} disabled={updateMutation.isLoading}>💾</button>
                                            <button className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.8rem' }} onClick={() => setEditingRow(null)}>✖</button>
                                        </td>
                                    </>
                                ) : (
                                    <>
                                        <td>{row.date}</td>
                                        <td>{row.item_name}</td>
                                        <td style={{ textAlign: 'center' }}>{row.quantity}</td>
                                        <td>{row.user_name?.replace(/\s*\(.*\)$/, '').replace(/\./g, ' ')}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.8em', marginRight: '4px' }} onClick={() => handleEditStart(row)}>✏️</button>
                                            <button className="btn btn-danger" style={{ padding: '2px 6px', fontSize: '0.8em' }} onClick={() => handleDelete(row.row_index)} disabled={deleteMutation.isLoading}>🗑️</button>
                                        </td>
                                    </>
                                )}
                            </tr>
                        )
                    }) : (
                        <tr><td colSpan="5" style={{ textAlign: 'center' }}>출고 내역이 비어 있습니다.</td></tr>
                    )}
                </tbody>
            </table>

            <ConfirmModal 
                isOpen={confirmModal.isOpen}
                message={`해당 출고 기록을 완전히 삭제하시겠습니까?\n(재고 관리를 사용하는 품목인 경우, 삭제된 수량만큼 재고가 다시 증가합니다)`}
                onConfirm={executeDelete}
                onCancel={() => setConfirmModal({ isOpen: false, rowIndex: null })}
            />
        </div>
    )
}

const ItemsTab = ({ month }) => {
    const queryClient = useQueryClient()
    const [showForm, setShowForm] = useState(false)
    const [formData, setFormData] = useState({ category: '', item_name: '', price: '', is_tracked: false, base_qty: '', order_qty: '' })
    const [searchTerm, setSearchTerm] = useState('')
    const [filterCategory, setFilterCategory] = useState('')

    const { data: items, isLoading } = useQuery({
        queryKey: ['consumables-items', month],
        queryFn: async () => {
            const { data } = await axios.get(`/api/consumables/items?month=${month || ''}`)
            return data
        }
    })

    const mutation = useMutation({
        mutationFn: async (newData) => {
            return axios.post('/api/consumables/items', newData)
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['consumables-items', month])
            setShowForm(false)
            setFormData({ category: '', item_name: '', price: '', is_tracked: false, base_qty: '', order_qty: '' })
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
        setFormData({ category: item.category, item_name: item.item_name, price: item.price, is_tracked: item.is_tracked || false, base_qty: item.base_qty || '', order_qty: item.order_qty || '' })
        setShowForm(true)
    }

    if (isLoading) return <div>Loading...</div>

    const categories = Array.from(new Set(items?.map(it => it.category).filter(Boolean)))
    
    const filteredItems = items?.filter(item => {
        const matchSearch = item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) || item.category.toLowerCase().includes(searchTerm.toLowerCase())
        const matchCat = filterCategory ? item.category === filterCategory : true
        return matchSearch && matchCat
    })

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ margin: 0 }}>
                    소모품 마스터 리스트 (단가표) 
                    {month && <span style={{ fontSize: '0.85em', color: '#0ea5e9', marginLeft: '10px' }}>- {month} 기준 재고</span>}
                </h3>
                <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setFormData({ category: '', item_name: '', price: '', is_tracked: false, base_qty: '', order_qty: '' }); }}>
                    {showForm ? '닫기' : '+ 품목 추가'}
                </button>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '8px', marginBottom: '1rem', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>대분류 (Category)</label>
                        <input type="text" placeholder="예: USB, Mouse..." value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} style={{ padding: '8px', width: '120px' }} required />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>품목명</label>
                        <input type="text" placeholder="로지텍 마우스 M185" value={formData.item_name} onChange={e => setFormData({...formData, item_name: e.target.value})} style={{ padding: '8px', minWidth: '200px' }} required />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>단가 (원)</label>
                        <input type="text" placeholder="18,000" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} style={{ padding: '8px', width: '100px' }} required />
                    </div>

                    <div style={{ marginLeft: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', color: '#1976d2', fontWeight: 'bold' }}>재고 추적 🎯</label>
                        <input type="checkbox" checked={formData.is_tracked} onChange={e => setFormData({...formData, is_tracked: e.target.checked})} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                    </div>

                    {formData.is_tracked && (
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', color: '#10b981', fontWeight: 'bold' }}>현재 재고 (물건 들여올 때 직접 입력)</label>
                                <input type="number" min="0" placeholder="100" value={formData.order_qty} onChange={e => setFormData({...formData, order_qty: e.target.value})} style={{ padding: '8px', width: '80px', border: '1px solid #10b981' }} required />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', color: '#ef4444', fontWeight: 'bold' }}>고정 재고 (부족 알림 기준)</label>
                                <input type="number" min="0" placeholder="10" value={formData.base_qty} onChange={e => setFormData({...formData, base_qty: e.target.value})} style={{ padding: '8px', width: '80px', border: '1px solid #ef4444' }} required />
                            </div>
                        </>
                    )}

                    <button type="submit" className="btn btn-primary" disabled={mutation.isLoading} style={{ marginLeft: 'auto' }}>
                        저장하기
                    </button>
                    <LoadingModal isOpen={mutation.isLoading} message="소모품 정보를 저장 중입니다..." />
                    <div style={{ fontSize: '0.8em', color: '#666', marginTop: '5px', width: '100%' }}>* 품목명이 같을 경우 수정되고, 다를 경우 덧붙여집니다. 재고 추적 시 '현재 재고'를 입력해두면 총 출고량을 차감한 진짜 잔여 재고를 자동 계산합니다.</div>
                </form>
            )}

            <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', background: '#f8f9fa', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <input 
                    type="text" 
                    placeholder="🔍 소모품명 또는 대분류 검색..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    style={{ padding: '8px', flex: 1, borderRadius: '4px', border: '1px solid #ccc' }} 
                />
                <select 
                    value={filterCategory} 
                    onChange={e => setFilterCategory(e.target.value)} 
                    style={{ padding: '8px', width: '200px', borderRadius: '4px', border: '1px solid #ccc' }}
                >
                    <option value="">📂 전체 분류 (All)</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
            </div>

            <table className="data-table">
                <thead>
                    <tr>
                        <th>대분류 (Category)</th>
                        <th>소모품명 (Item Name)</th>
                        <th style={{ textAlign: 'right' }}>정상 단가(₩)</th>
                        <th style={{ textAlign: 'center' }}>고정 재고(기준)</th>
                        <th style={{ textAlign: 'center' }}>현재 재고(입고량)</th>
                        <th style={{ textAlign: 'center' }}>상태(재고현황)</th>
                        <th style={{ textAlign: 'center' }}>관리</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredItems?.length > 0 ? filteredItems.map((item, idx) => {
                        const handleInlineUpdate = (field, newVal) => {
                            const updatedData = { ...item, [field]: newVal }
                            mutation.mutate(updatedData)
                        }

                        let statusBadge = <span style={{ color: '#aaa', fontSize: '0.85em' }}>추적안함 (-)</span>
                        if (item.is_tracked) {
                            const current = item.current_stock || 0
                            const base = item.base_qty || 1
                            const isLow = current < base
                            
                            statusBadge = (
                                <span style={{ 
                                    padding: '3px 8px', 
                                    borderRadius: '12px', 
                                    fontSize: '0.85em', 
                                    fontWeight: 'bold',
                                    display: 'inline-block',
                                    backgroundColor: isLow ? '#ffebee' : '#e8f5e9',
                                    color: isLow ? '#d32f2f' : '#2e7d32',
                                    border: `1px solid ${isLow ? '#ffcdd2' : '#c8e6c9'}`
                                }}>
                                    {isLow ? `🚨 부족 (잔여: ${current}개)` : `✅ 양호 (잔여: ${current}개)`}
                                </span>
                            )
                        }

                        return (
                            <tr key={idx}>
                                <EditableCell value={item.category} onSave={(val) => handleInlineUpdate('category', val)} />
                                <EditableCell value={item.item_name} onSave={(val) => handleInlineUpdate('item_name', val)} bold={true} />
                                <EditableCell value={item.price} onSave={(val) => handleInlineUpdate('price', val)} align="right" />
                                <EditableCell value={item.base_qty} onSave={(val) => handleInlineUpdate('base_qty', val)} align="center" type="number" />
                                <EditableCell value={item.order_qty} onSave={(val) => handleInlineUpdate('order_qty', val)} align="center" type="number" />
                                <td style={{ textAlign: 'center' }}>{statusBadge}</td>
                                <td style={{ textAlign: 'center' }}>
                                    <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.8em' }} onClick={() => startEdit(item)}>상세 수정</button>
                                </td>
                            </tr>
                        )
                    }) : (
                        <tr><td colSpan="5" style={{ textAlign: 'center' }}>조건에 맞는 품목이 없습니다.</td></tr>
                    )}
                </tbody>
            </table>
        </div>
    )
}

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

const TrackedItemsTab = ({ month }) => {
    const queryClient = useQueryClient()
    const [selectedHistoryItem, setSelectedHistoryItem] = useState(null)
    const { data: items, isLoading } = useQuery({
        queryKey: ['consumables-items', month],
        queryFn: async () => {
            const { data } = await axios.get(`/api/consumables/items?month=${month || ''}`)
            return data
        }
    })

    const mutation = useMutation({
        mutationFn: async (newData) => {
            return axios.post('/api/consumables/items', newData)
        },
        onSuccess: () => {
            queryClient.invalidateQueries(['consumables-items', month])
            // alert("수정되었습니다.") // 조용한 반영을 위해 주석 처리하거나 토스트 사용 권장
        },
        onError: () => alert("수정 중 오류가 발생했습니다.")
    })

    if (isLoading) return <div>Loading...</div>

    const trackedItems = items?.filter(item => item.is_tracked) || []

    return (
        <div className="card">
            <h3 style={{ marginBottom: '1rem' }}>📍 재고 추적 관리 현황 ({month || '전체'})</h3>
            <div className="alert alert-info" style={{ marginBottom: '1rem' }}>
                💡 <strong>최종 잔여 재고</strong> = <strong>입력한 현재 재고</strong> - <strong>'{month || '선택된 월'}'의 출고 수량</strong><br/>
                고정 재고(최소기준선)보다 최종 잔여 재고가 낮아지면 🚨 <strong>부족</strong> 경고가 표시됩니다.
            </div>
            
            <table className="data-table">
                <thead>
                    <tr>
                        <th>품목명</th>
                        <th style={{ textAlign: 'right' }}>정상 단가(₩)</th>
                        <th style={{ textAlign: 'center' }}>고정 재고(기준선)</th>
                        <th style={{ textAlign: 'center', color: '#10b981' }}>현재 재고 (입고량)</th>
                        <th style={{ textAlign: 'center', color: '#f59e0b' }}>선택월({month || '전체'}) 출고량</th>
                        <th style={{ textAlign: 'center', color: '#3b82f6', fontSize: '1.1em' }}>최종 잔여 재고</th>
                        <th style={{ textAlign: 'center' }}>상태</th>
                        <th style={{ textAlign: 'center' }}>상세 내역</th>
                    </tr>
                </thead>
                <tbody>
                    {trackedItems.length > 0 ? trackedItems.map((item, idx) => {
                        const handleInlineUpdate = (field, newVal) => {
                            const updatedData = { ...item, [field]: newVal }
                            mutation.mutate(updatedData)
                        }

                        const current = item.current_stock || 0
                        const base = item.base_qty || 1
                        const order = item.order_qty || 0
                        const dispatched = item.dispatched_qty || 0
                        const isLow = current < base
                        
                        return (
                            <tr key={idx} style={{ backgroundColor: isLow ? '#fff5f5' : 'transparent' }}>
                                <td style={{ fontWeight: 'bold' }}>{item.item_name}</td>
                                <EditableCell value={item.price} onSave={(val) => handleInlineUpdate('price', val)} align="right" />
                                <EditableCell value={item.base_qty} onSave={(val) => handleInlineUpdate('base_qty', val)} align="center" type="number" />
                                <EditableCell value={item.order_qty} onSave={(val) => handleInlineUpdate('order_qty', val)} align="center" type="number" />
                                <td style={{ textAlign: 'center', color: '#f59e0b', fontWeight: 'bold' }}>{dispatched.toLocaleString()}</td>
                                <td style={{ textAlign: 'center', color: '#3b82f6', fontWeight: 'bold', fontSize: '1.2em' }}>{current.toLocaleString()}</td>
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
                        <tr><td colSpan="8" style={{ textAlign: 'center' }}>재고 추적 중인 품목이 없습니다.</td></tr>
                    )}
                </tbody>
            </table>

            {selectedHistoryItem && <ItemHistoryModal itemName={selectedHistoryItem} onClose={() => setSelectedHistoryItem(null)} />}
        </div>
    )
}


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
                        type="date" 
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


export default Consumables

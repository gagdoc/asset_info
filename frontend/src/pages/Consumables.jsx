import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import ConfirmModal from '../components/ConfirmModal'
import SearchableSelect from '../components/SearchableSelect'
import LoadingModal from '../components/LoadingModal'
import { exportToCSV, todayStr, ExportButton } from '../utils/exportUtils'

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
            queryClient.invalidateQueries(['toner-inventory'])
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
                <button
                    className={`btn ${activeTab === 'tonner-consignment' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('tonner-consignment')}
                    style={{ backgroundColor: activeTab === 'tonner-consignment' ? '' : '#fff7ed', border: '1px solid #f97316', color: activeTab === 'tonner-consignment' ? '' : '#c2410c' }}
                >
                    🖨️ 위탁 토너 내역
                </button>
            </div>

            {activeTab === 'estimate' && selectedMonth && <EstimateTab month={selectedMonth} />}
            {activeTab === 'outbound' && selectedMonth && <OutboundTab month={selectedMonth} />}
            {activeTab === 'create-month' && <CreateMonthTab />}
            {activeTab === 'items' && <ItemsTab month={selectedMonth} />}
            {activeTab === 'tracked' && <TrackedItemsTab month={selectedMonth} />}
            {activeTab === 'tonner-consignment' && <TonnerConsignmentTab month={selectedMonth} months={monthsData} />}
            
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
    const [isDownloading, setIsDownloading] = useState(false)

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

    const handleDownload = async () => {
        setIsDownloading(true)
        try {
            const response = await axios.get(`/api/consumables/estimate/download?month=${month}`, {
                responseType: 'blob'
            })
            const url = window.URL.createObjectURL(new Blob([response.data]))
            const link = document.createElement('a')
            link.href = url
            const today = new Date().toISOString().slice(0, 10).replace(/-/g, '')
            link.setAttribute('download', `견적서_${month}_${today}.xlsx`)
            document.body.appendChild(link)
            link.click()
            link.remove()
            window.URL.revokeObjectURL(url)
        } catch (error) {
            console.error('견적서 다운로드 오류:', error)
            // 서버에서 blob으로 온 오류 메시지 파싱
            let msg = '견적서 다운로드 중 오류가 발생했습니다.'
            try {
                if (error.response?.data instanceof Blob) {
                    const text = await error.response.data.text()
                    const json = JSON.parse(text)
                    msg += `\n\n서버 오류: ${json.detail || text}`
                } else if (error.response?.data?.detail) {
                    msg += `\n\n서버 오류: ${error.response.data.detail}`
                }
            } catch (_) {}
            alert(msg)
        } finally {
            setIsDownloading(false)
        }
    }

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                <h3>{month} 견적서 산출 내역</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <ExportButton
                        onClick={() => exportToCSV(estimateData || [], `견적서_${month}_${todayStr()}`)}
                        disabled={!estimateData || estimateData.length === 0}
                    />
                    <button className="btn btn-secondary" onClick={() => refetch()} disabled={isFetching}>
                        {isFetching ? '새로고침 중...' : '시트 데이터 다시 불러오기'}
                    </button>
                    <button
                        className="btn btn-primary"
                        onClick={handleDownload}
                        disabled={isDownloading || !estimateData?.length}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
                    >
                        {isDownloading ? '생성 중...' : '📥 견적서 Excel 다운로드'}
                    </button>
                </div>
            </div>
            
            {isLoading && <LoadingModal isOpen={isLoading} message="견적 데이터를 불러오는 중입니다..." />}
            {!isLoading && (
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
                                <td style={{ fontSize: '0.9em', color: '#555' }}>{formatUserNames(row.users)}</td>
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

const STAFF_OPTIONS = ['Kale', 'Daniel', '기타']
const DELIVERY_OPTIONS = ['직접', '택배', '기타']

/**
 * 사용자명 문자열을 깔끔하게 표시하는 헬퍼
 * "Jiwon Yoo (RAQA), Alice Han (RAQA), Arin Ko (Implants)" → "Jiwon Yoo, Alice Han, Arin Ko"
 * 백엔드 estimate의 '. ' 구분자도 처리
 */
const formatUserNames = (str) => {
    if (!str) return ''
    // 백엔드 estimate는 여러 user 그룹을 '. '로 연결함
    return str.split('. ')
        .map(group =>
            group.split(',')
                .map(n => n.trim().replace(/\s*\([^)]*\)$/, ''))
                .filter(Boolean)
                .join(', ')
        )
        .filter(Boolean)
        .join(' / ')
}

const OutboundTab = ({ month }) => {
    const queryClient = useQueryClient()
    const [showForm, setShowForm] = useState(false)
    const [formData, setFormData] = useState({ date: '', item_name: '', quantity: '1', outbound_type: '일반', staff: '', staff_custom: '', delivery: '', delivery_custom: '' })
    // 다중 지급 대상자
    const [userNames, setUserNames] = useState([''])

    const [filterCategory, setFilterCategory] = useState('')

    // 출고 내역 검색 상태
    const [searchOutbound, setSearchOutbound] = useState('')
    const [searchCategoryOutbound, setSearchCategoryOutbound] = useState('')

    const isTonner = (name, category) => {
        const n = (name || '').toLowerCase()
        const c = (category || '').toLowerCase()
        return n.includes('tonner') || n.includes('toner') || n.includes('토너')
            || c.includes('tonner') || c.includes('toner') || c.includes('토너')
    }

    const { data: history, isLoading } = useQuery({
        queryKey: ['consumables-outbound', month],
        queryFn: async () => {
            const { data } = await axios.get(`/api/consumables/outbound?month=${month}`)
            return data
        }
    })

    const [editingRow, setEditingRow] = useState(null)
    const [editForm, setEditForm] = useState({})
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)

    const updateMutation = useMutation({
        mutationFn: async (newData) => await axios.put('/api/consumables/outbound', newData),
        onSuccess: () => {
            queryClient.invalidateQueries(['consumables-outbound', month])
            queryClient.invalidateQueries(['consumables-items'])
            setEditingRow(null)
            setIsEditModalOpen(false)
            alert("출고 내역이 수정되었습니다.")
        },
        onError: () => alert("수정 중 오류가 발생했습니다.")
    })

    const deleteMutation = useMutation({
        mutationFn: async ({ rowIndex, date, item_name, user_name }) => await axios.delete(
            `/api/consumables/outbound?month=${month}&row_index=${rowIndex}` +
            `&verify_date=${encodeURIComponent(date)}&verify_item=${encodeURIComponent(item_name)}` +
            `&verify_user=${encodeURIComponent(user_name || '')}`
        ),
        onSuccess: () => {
            alert("출고 내역이 삭제되었습니다.")
            // Google Sheets API 안정화 대기 후 refetch (연속 삭제 시 과호출 방지)
            setTimeout(() => {
                queryClient.invalidateQueries(['consumables-outbound', month])
                queryClient.invalidateQueries(['consumables-estimate', month])
            }, 1200)
        },
        onError: () => alert("삭제 중 오류가 발생했습니다.")
    })

    const handleEditStart = (row) => {
        setEditingRow(row.row_index)
        setEditForm({ ...row })
        setIsEditModalOpen(true)
    }

    const handleEditSave = () => {
        if (!editForm.date || !editForm.item_name || !editForm.quantity || !editForm.user_name) {
            alert("모든 필드를 입력해야 합니다.")
            return
        }
        // verify_date/verify_item으로 수정 전 행 내용 검증 (인덱스 이동 방지)
        updateMutation.mutate({
            month,
            row_index: editForm.row_index,
            verify_date: editForm.date,
            verify_item: editForm.item_name,
            ...editForm
        })
    }

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, row: null })

    const handleDelete = (row) => {
        setConfirmModal({ isOpen: true, row })
    }

    const executeDelete = () => {
        const { row } = confirmModal
        deleteMutation.mutate({ rowIndex: row.row_index, date: row.date, item_name: row.item_name, user_name: row.user_name })
        setConfirmModal({ isOpen: false, row: null })
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

    // 품목명 → 구분(category) 빠른 조회 맵
    const itemCategoryMap = useMemo(() => {
        const map = {}
        ;(itemsList || []).forEach(it => { map[it.item_name] = it.category || '' })
        return map
    }, [itemsList])

    // 출고 내역에 구분 추가 + 검색 필터 적용
    const filteredHistory = useMemo(() => {
        const list = (history || []).map(row => ({
            ...row,
            category: itemCategoryMap[row.item_name] || ''
        }))
        return list.filter(row => {
            const matchItem = searchOutbound
                ? row.item_name.toLowerCase().includes(searchOutbound.toLowerCase())
                : true
            const matchCategory = searchCategoryOutbound
                ? row.category.toLowerCase().includes(searchCategoryOutbound.toLowerCase())
                : true
            return matchItem && matchCategory
        })
    }, [history, itemCategoryMap, searchOutbound, searchCategoryOutbound])

    // 구분 목록 (검색 드롭다운용)
    const outboundCategories = useMemo(() =>
        Array.from(new Set((history || []).map(row => itemCategoryMap[row.item_name]).filter(Boolean))).sort(),
    [history, itemCategoryMap])

    // 필터링된 결과의 총 지급수량 합계
    const totalFilteredQty = useMemo(() =>
        filteredHistory.reduce((sum, row) => {
            const q = parseInt(String(row.quantity || '0').replace(/,/g, ''), 10)
            return sum + (isNaN(q) ? 0 : q)
        }, 0),
    [filteredHistory])

    // 분류 목록
    const categories = useMemo(() =>
        Array.from(new Set((itemsList || []).map(it => it.category).filter(Boolean))).sort(),
    [itemsList])

    // 분류 필터 적용된 품목 옵션 (분류+품목명 같이 표시)
    const itemOptions = useMemo(() => {
        const filtered = filterCategory
            ? (itemsList || []).filter(it => it.category === filterCategory)
            : (itemsList || [])
        return filtered.map(it => ({
            label: it.item_name,
            value: it.item_name,
            subLabel: it.category,
            category: it.category
        }))
    }, [itemsList, filterCategory])

    // 현재 선택된 품목의 분류 (isTonner 판단용)
    const selectedItemCategory = useMemo(() => {
        if (!formData.item_name || !itemsList) return ''
        return (itemsList.find(it => it.item_name === formData.item_name) || {}).category || ''
    }, [formData.item_name, itemsList])

    const userOptions = useMemo(() =>
        (usersList || []).map(u => {
            // 영문 NAME 우선 → 없으면 이메일 앞부분에서 파생 (점→공백)
            const englishName = (u.NAME || '').trim().replace(/\./g, ' ')
            const nameOnly = englishName
                || (u.email || '').split('@')[0].replace(/\./g, ' ')
                || (u.이름 || '').replace(/\./g, ' ')
            const fullNameWithBU = `${nameOnly}${u.BU ? ` (${u.BU})` : ''}`;
            return {
                label: nameOnly,
                value: fullNameWithBU,
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
            queryClient.invalidateQueries(['tonner-consignment'])
            queryClient.invalidateQueries(['toner-inventory'])
            setShowForm(false)
            setFormData({ date: '', item_name: '', quantity: '1', outbound_type: '일반', staff: '', staff_custom: '', delivery: '', delivery_custom: '' })
            setUserNames([''])
            alert("출고 내역이 추가되었습니다.")
        },
        onError: () => alert("오류가 발생했습니다. 구글 시트를 확인하세요.")
    })

    const [isSubmittingMulti, setIsSubmittingMulti] = useState(false)

    const handleSubmit = async (e) => {
        e.preventDefault()
        const effectiveStaff = formData.staff === '기타' ? formData.staff_custom : formData.staff
        const effectiveDelivery = formData.delivery === '기타' ? formData.delivery_custom : formData.delivery
        const filledUsers = userNames.filter(n => n.trim())
        if (!formData.date || !formData.item_name || !formData.quantity || filledUsers.length === 0 || !effectiveStaff || !effectiveDelivery) {
            alert("모든 필드를 입력해주세요. (지급 대상자, 지급 담당, 수령 방법 포함)")
            return
        }
        // 여러 명을 쉼표로 합쳐서 1행으로 등록
        const combinedUserName = filledUsers.join(', ')
        setIsSubmittingMulti(true)
        try {
            await axios.post('/api/consumables/outbound', {
                ...formData,
                user_name: combinedUserName,
                staff: effectiveStaff,
                delivery: effectiveDelivery,
                month
            })
            queryClient.invalidateQueries(['consumables-outbound', month])
            queryClient.invalidateQueries(['tonner-consignment'])
            queryClient.invalidateQueries(['toner-inventory'])
            setShowForm(false)
            setFormData({ date: '', item_name: '', quantity: '1', outbound_type: '일반', staff: '', staff_custom: '', delivery: '', delivery_custom: '' })
            setUserNames([''])
            alert(`출고 내역이 추가되었습니다. (${filledUsers.length}명 → 1행)`)
        } catch {
            alert("오류가 발생했습니다. 구글 시트를 확인하세요.")
        } finally {
            setIsSubmittingMulti(false)
        }
    }

    if (isLoading) return <LoadingModal isOpen={isLoading} message="출고 상세 내역을 불러오는 중입니다..." />

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0 }}>{month} 출고 상세 기록</h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <ExportButton
                        onClick={() => exportToCSV(history || [], `출고내역_${month}_${todayStr()}`)}
                        disabled={!history || history.length === 0}
                    />
                    <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
                        {showForm ? '닫기' : '+ 출고 추가'}
                    </button>
                </div>
            </div>

            {showForm && (
                <form onSubmit={handleSubmit} style={{ background: '#f8f9fa', padding: '1rem', borderRadius: '8px', marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                        {/* 출고 날짜 */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>출고 날짜</label>
                            <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ddd' }} required />
                        </div>

                        {/* 분류 필터 */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>대분류 (CATEGORY)</label>
                            <select
                                value={filterCategory}
                                onChange={e => {
                                    setFilterCategory(e.target.value)
                                    setFormData(f => ({ ...f, item_name: '', outbound_type: '일반' }))
                                }}
                                style={{ padding: '8px 10px', borderRadius: '4px', border: '1px solid #ddd', minWidth: '130px', height: '37px' }}
                            >
                                <option value="">전체 분류</option>
                                {categories.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>

                        {/* 품목 선택 */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>
                                품목
                                {filterCategory && <span style={{ marginLeft: '6px', fontSize: '0.85em', color: '#6366f1', fontWeight: 'bold' }}>[{filterCategory}]</span>}
                            </label>
                            <SearchableSelect
                                options={itemOptions}
                                value={formData.item_name}
                                onChange={val => {
                                    const cat = (itemsList || []).find(it => it.item_name === val)?.category || ''
                                    setFilterCategory(cat)
                                    setFormData(f => ({ ...f, item_name: val, outbound_type: '일반' }))
                                }}
                                placeholder={filterCategory ? `${filterCategory} 품목 선택` : '품목 검색/선택'}
                                width="260px"
                            />
                        </div>

                        {/* 수량 */}
                        <div>
                            <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>수량</label>
                            <input type="number" min="1" value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} style={{ padding: '8px', width: '80px', borderRadius: '4px', border: '1px solid #ddd' }} required />
                        </div>

                        {/* 다중 지급 대상자 */}
                        <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                                <label style={{ fontSize: '0.9em', fontWeight: 'bold' }}>
                                    지급 대상자
                                    <span style={{ marginLeft: '6px', padding: '1px 8px', borderRadius: '10px', fontSize: '0.8em', backgroundColor: '#e0e7ff', color: '#4338ca', fontWeight: 'bold' }}>
                                        {userNames.filter(n => n).length}명
                                    </span>
                                </label>
                                <button type="button" onClick={() => setUserNames(prev => [...prev, ''])}
                                    style={{ padding: '2px 10px', fontSize: '0.82em', borderRadius: '12px', border: '1px dashed #6366f1', background: '#f5f3ff', color: '#4f46e5', cursor: 'pointer', fontWeight: 'bold' }}>
                                    + 인원 추가
                                </button>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                {userNames.map((uName, idx) => (
                                    <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '0.82em', color: '#6b7280', minWidth: '18px' }}>{idx + 1}.</span>
                                        <SearchableSelect
                                            options={userOptions}
                                            value={uName}
                                            onChange={val => {
                                                const next = [...userNames]
                                                next[idx] = val
                                                setUserNames(next)
                                            }}
                                            placeholder="이름/이메일 검색"
                                            searchFields={["name", "email", "bu"]}
                                            width="260px"
                                            allowCustom={true}
                                        />
                                        {userNames.length > 1 && (
                                            <button type="button" onClick={() => setUserNames(prev => prev.filter((_, i) => i !== idx))}
                                                style={{ padding: '2px 7px', fontSize: '0.8em', borderRadius: '50%', border: '1px solid #fca5a5', background: '#fff', color: '#ef4444', cursor: 'pointer', lineHeight: 1 }}>
                                                ✕
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>

                        <button type="submit" className="btn btn-primary" disabled={isSubmittingMulti} style={{ alignSelf: 'flex-end' }}>
                            {isSubmittingMulti ? `등록 중...` : '확인'}
                        </button>
                    </div>

                    {/* 지급 담당 + 수령 방법 */}
                    <div style={{ marginTop: '12px', display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.88em', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>지급 담당 <span style={{ color: '#ef4444' }}>*</span></label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {STAFF_OPTIONS.map(opt => (
                                    <label key={opt} style={{
                                        padding: '5px 14px', borderRadius: '16px', cursor: 'pointer', fontSize: '0.9em',
                                        border: `1.5px solid ${formData.staff === opt ? '#4f46e5' : '#d1d5db'}`,
                                        backgroundColor: formData.staff === opt ? '#e0e7ff' : '#fff',
                                        fontWeight: formData.staff === opt ? 'bold' : 'normal',
                                        color: formData.staff === opt ? '#4338ca' : '#6b7280',
                                    }}>
                                        <input type="radio" name="staff" value={opt} checked={formData.staff === opt} onChange={() => setFormData({...formData, staff: opt, staff_custom: ''})} style={{ display: 'none' }} />
                                        {opt}
                                    </label>
                                ))}
                            </div>
                            {formData.staff === '기타' && (
                                <input type="text" placeholder="직접 입력" value={formData.staff_custom} onChange={e => setFormData({...formData, staff_custom: e.target.value})}
                                    style={{ marginTop: '6px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #a5b4fc', width: '160px' }} />
                            )}
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.88em', fontWeight: 'bold', marginBottom: '6px', color: '#374151' }}>수령 방법 <span style={{ color: '#ef4444' }}>*</span></label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                {DELIVERY_OPTIONS.map(opt => (
                                    <label key={opt} style={{
                                        padding: '5px 14px', borderRadius: '16px', cursor: 'pointer', fontSize: '0.9em',
                                        border: `1.5px solid ${formData.delivery === opt ? '#0891b2' : '#d1d5db'}`,
                                        backgroundColor: formData.delivery === opt ? '#cffafe' : '#fff',
                                        fontWeight: formData.delivery === opt ? 'bold' : 'normal',
                                        color: formData.delivery === opt ? '#0e7490' : '#6b7280',
                                    }}>
                                        <input type="radio" name="delivery" value={opt} checked={formData.delivery === opt} onChange={() => setFormData({...formData, delivery: opt, delivery_custom: ''})} style={{ display: 'none' }} />
                                        {opt}
                                    </label>
                                ))}
                            </div>
                            {formData.delivery === '기타' && (
                                <input type="text" placeholder="직접 입력" value={formData.delivery_custom} onChange={e => setFormData({...formData, delivery_custom: e.target.value})}
                                    style={{ marginTop: '6px', padding: '5px 10px', borderRadius: '6px', border: '1px solid #67e8f9', width: '160px' }} />
                            )}
                        </div>
                    </div>

                    {/* Tonner 선택 시 일반/위탁 구분 — 별도 행으로 눈에 띄게 표시 */}
                    {isTonner(formData.item_name, selectedItemCategory) && (
                        <div style={{
                            marginTop: '12px', padding: '12px 16px',
                            background: '#fff7ed', border: '2px solid #f97316',
                            borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '16px'
                        }}>
                            <span style={{ fontWeight: 'bold', color: '#c2410c', fontSize: '0.95em' }}>
                                🖨️ Tonner 출고 유형 선택
                            </span>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                {['일반', '위탁'].map(type => (
                                    <label key={type} style={{
                                        display: 'flex', alignItems: 'center', gap: '6px',
                                        padding: '7px 18px', borderRadius: '20px', cursor: 'pointer',
                                        border: `2px solid ${formData.outbound_type === type ? (type === '위탁' ? '#f97316' : '#3b82f6') : '#d1d5db'}`,
                                        backgroundColor: formData.outbound_type === type ? (type === '위탁' ? '#fed7aa' : '#dbeafe') : '#fff',
                                        fontWeight: formData.outbound_type === type ? 'bold' : 'normal',
                                        color: formData.outbound_type === type ? (type === '위탁' ? '#9a3412' : '#1e40af') : '#6b7280',
                                        transition: 'all 0.15s', fontSize: '0.95em'
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
                </form>
            )}

            <LoadingModal isOpen={isSubmittingMulti} message="출고 내역을 구글 시트에 기록 중입니다..." />
            <LoadingModal isOpen={updateMutation.isPending} message="출고 내역을 수정하고 있습니다..." />
            <LoadingModal isOpen={deleteMutation.isPending} message="출고 내역을 삭제하고 있습니다..." />

            {/* 출고 내역 검색 바 */}
            <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.8rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <select
                    value={searchCategoryOutbound}
                    onChange={e => setSearchCategoryOutbound(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9em', minWidth: '130px' }}
                >
                    <option value="">전체 구분</option>
                    {outboundCategories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                    ))}
                </select>
                <input
                    type="text"
                    placeholder="출고 품목명 검색..."
                    value={searchOutbound}
                    onChange={e => setSearchOutbound(e.target.value)}
                    style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', fontSize: '0.9em', minWidth: '200px', flex: 1 }}
                />
                {(searchOutbound || searchCategoryOutbound) && (
                    <button className="btn btn-secondary" style={{ padding: '5px 10px', fontSize: '0.85em' }}
                        onClick={() => { setSearchOutbound(''); setSearchCategoryOutbound('') }}>
                        ✕ 초기화
                    </button>
                )}
                <span style={{ fontSize: '0.85em', color: '#64748b' }}>{filteredHistory.length}건</span>
                <span style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#1e40af', background: '#eff6ff', padding: '3px 10px', borderRadius: '12px', border: '1px solid #bfdbfe' }}>
                    총 지급수량: {totalFilteredQty.toLocaleString()}개
                </span>
            </div>

            <table className="data-table">
                <thead>
                    <tr>
                        <th>출고 날짜</th>
                        <th>구분</th>
                        <th>출고 품목명</th>
                        <th>지급 수량</th>
                        <th>지급 대상자</th>
                        <th style={{ textAlign: 'center' }}>지급 담당</th>
                        <th style={{ textAlign: 'center' }}>수령 방법</th>
                        <th style={{ textAlign: 'center' }}>유형</th>
                        <th style={{ textAlign: 'center', width: '120px' }}>관리</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredHistory?.length > 0 ? filteredHistory.map((row, idx) => {
                        const rowType = row.outbound_type || '일반';
                        const isConsignment = rowType === '위탁';
                        return (
                            <tr key={idx} style={{ backgroundColor: isConsignment ? '#fff7ed' : 'transparent' }}>
                                <td>{row.date}</td>
                                <td style={{ fontSize: '0.85em', color: '#64748b' }}>{row.category || '-'}</td>
                                <td>{row.item_name}</td>
                                <td style={{ textAlign: 'center' }}>{row.quantity}</td>
                                <td>{formatUserNames(row.user_name)}</td>
                                <td style={{ textAlign: 'center', fontSize: '0.85em' }}>{row.staff || '-'}</td>
                                <td style={{ textAlign: 'center', fontSize: '0.85em' }}>{row.delivery || '-'}</td>
                                <td style={{ textAlign: 'center' }}>
                                    <span style={{
                                        display: 'inline-block', padding: '2px 8px', borderRadius: '10px', fontSize: '0.8em', fontWeight: 'bold',
                                        backgroundColor: isConsignment ? '#fed7aa' : '#dbeafe',
                                        color: isConsignment ? '#c2410c' : '#1e40af'
                                    }}>
                                        {isConsignment ? '위탁' : '일반'}
                                    </span>
                                </td>
                                <td style={{ textAlign: 'center' }}>
                                    <button className="btn btn-secondary" style={{ padding: '2px 6px', fontSize: '0.8em', marginRight: '4px' }} onClick={() => handleEditStart(row)}>✏️</button>
                                    <button className="btn btn-danger" style={{ padding: '2px 6px', fontSize: '0.8em' }} onClick={() => handleDelete(row)} disabled={deleteMutation.isPending}>🗑️</button>
                                </td>
                            </tr>
                        )
                    }) : (
                        <tr><td colSpan="9" style={{ textAlign: 'center' }}>출고 내역이 비어 있습니다.</td></tr>
                    )}
                </tbody>
            </table>

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                message={`해당 출고 기록을 완전히 삭제하시겠습니까?\n(재고 관리를 사용하는 품목인 경우, 삭제된 수량만큼 재고가 다시 증가합니다)`}
                onConfirm={executeDelete}
                onCancel={() => setConfirmModal({ isOpen: false, rowIndex: null })}
            />

            {/* ── 출고 수정 모달 ── */}
            {isEditModalOpen && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div className="card modal" style={{ width: '90%', maxWidth: '620px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.5rem', borderBottom: '1px solid #e2e8f0' }}>
                            <h3 style={{ margin: 0 }}>✏️ 출고 내역 수정</h3>
                            <button className="btn btn-secondary" onClick={() => setIsEditModalOpen(false)}>✖</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* 날짜 */}
                            <div className="form-group">
                                <label className="form-label">출고 날짜</label>
                                <input type="date" className="form-input" value={editForm.date || ''} onChange={e => setEditForm({...editForm, date: e.target.value})} />
                            </div>
                            {/* 품목 */}
                            <div className="form-group">
                                <label className="form-label">출고 품목명</label>
                                <SearchableSelect options={itemOptions} value={editForm.item_name || ''}
                                    onChange={val => setEditForm({...editForm, item_name: val})}
                                    placeholder="품목 검색/선택" width="100%" />
                            </div>
                            {/* 수량 */}
                            <div className="form-group">
                                <label className="form-label">지급 수량</label>
                                <input type="number" min="1" className="form-input" value={editForm.quantity || ''} onChange={e => setEditForm({...editForm, quantity: e.target.value})} style={{ maxWidth: '120px' }} />
                            </div>
                            {/* 지급 대상자 */}
                            <div className="form-group">
                                <label className="form-label">지급 대상자</label>
                                <SearchableSelect options={userOptions} value={editForm.user_name || ''}
                                    onChange={val => setEditForm({...editForm, user_name: val})}
                                    placeholder="사용자 검색 (이름/이메일)"
                                    searchFields={["name", "email", "bu"]} width="100%" allowCustom={true} />
                            </div>
                            {/* 지급 담당 */}
                            <div className="form-group">
                                <label className="form-label">지급 담당</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {STAFF_OPTIONS.map(opt => (
                                        <label key={opt} style={{
                                            padding: '5px 14px', borderRadius: '16px', cursor: 'pointer', fontSize: '0.9em',
                                            border: `1.5px solid ${editForm.staff === opt ? '#4f46e5' : '#d1d5db'}`,
                                            backgroundColor: editForm.staff === opt ? '#e0e7ff' : '#fff',
                                            fontWeight: editForm.staff === opt ? 'bold' : 'normal',
                                            color: editForm.staff === opt ? '#4338ca' : '#6b7280',
                                        }}>
                                            <input type="radio" name="edit_staff" value={opt} checked={editForm.staff === opt}
                                                onChange={() => setEditForm({...editForm, staff: opt})} style={{ display: 'none' }} />
                                            {opt}
                                        </label>
                                    ))}
                                    <input type="text" placeholder="직접 입력" value={STAFF_OPTIONS.includes(editForm.staff) ? '' : (editForm.staff || '')}
                                        onChange={e => setEditForm({...editForm, staff: e.target.value})}
                                        style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9em', width: '100px' }} />
                                </div>
                            </div>
                            {/* 수령 방법 */}
                            <div className="form-group">
                                <label className="form-label">수령 방법</label>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    {DELIVERY_OPTIONS.map(opt => (
                                        <label key={opt} style={{
                                            padding: '5px 14px', borderRadius: '16px', cursor: 'pointer', fontSize: '0.9em',
                                            border: `1.5px solid ${editForm.delivery === opt ? '#0891b2' : '#d1d5db'}`,
                                            backgroundColor: editForm.delivery === opt ? '#cffafe' : '#fff',
                                            fontWeight: editForm.delivery === opt ? 'bold' : 'normal',
                                            color: editForm.delivery === opt ? '#0e7490' : '#6b7280',
                                        }}>
                                            <input type="radio" name="edit_delivery" value={opt} checked={editForm.delivery === opt}
                                                onChange={() => setEditForm({...editForm, delivery: opt})} style={{ display: 'none' }} />
                                            {opt}
                                        </label>
                                    ))}
                                    <input type="text" placeholder="직접 입력" value={DELIVERY_OPTIONS.includes(editForm.delivery) ? '' : (editForm.delivery || '')}
                                        onChange={e => setEditForm({...editForm, delivery: e.target.value})}
                                        style={{ padding: '4px 10px', borderRadius: '8px', border: '1px solid #d1d5db', fontSize: '0.9em', width: '100px' }} />
                                </div>
                            </div>
                            {/* 유형 (토너만) */}
                            {isTonner(editForm.item_name) && (
                                <div className="form-group">
                                    <label className="form-label">출고 유형</label>
                                    <select className="form-input" value={editForm.outbound_type || '일반'}
                                        onChange={e => setEditForm({...editForm, outbound_type: e.target.value})}
                                        style={{ maxWidth: '120px' }}>
                                        <option value="일반">일반</option>
                                        <option value="위탁">위탁</option>
                                    </select>
                                </div>
                            )}
                        </div>
                        <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn btn-secondary" onClick={() => setIsEditModalOpen(false)}>취소</button>
                            <button className="btn btn-primary" onClick={() => { handleEditSave(); setIsEditModalOpen(false) }} disabled={updateMutation.isPending}>
                                💾 변경사항 저장
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

const isTonnerItem = (name, category) => {
    const n = (name || '').toLowerCase()
    const c = (category || '').toLowerCase()
    return n.includes('tonner') || n.includes('toner') || n.includes('토너')
        || c.includes('tonner') || c.includes('toner') || c.includes('토너')
}

const ItemsTab = ({ month }) => {
    const queryClient = useQueryClient()
    const [viewMode, setViewMode] = useState('general') // 'general' | 'toner-inventory'
    const [showForm, setShowForm] = useState(false)
    const [formData, setFormData] = useState({ row_index: null, category: '', item_name: '', price: '', is_tracked: false, base_qty: '', order_qty: '' })
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
            setFormData({ row_index: null, category: '', item_name: '', price: '', is_tracked: false, base_qty: '', order_qty: '' })
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
        setFormData({ row_index: item.row_index, category: item.category, item_name: item.item_name, price: item.price, is_tracked: item.is_tracked || false, base_qty: item.base_qty || '', order_qty: item.order_qty || '' })
        setShowForm(true)
    }

    if (isLoading) return <LoadingModal isOpen={isLoading} message="소모품 마스터 리스트를 불러오는 중입니다..." />

    // 일반 소모품만 (토너 제외)
    const allGeneral = items?.filter(it => !isTonnerItem(it.item_name, it.category)) || []
    const sourceItems = allGeneral

    const categories = Array.from(new Set(sourceItems.map(it => it.category).filter(Boolean)))

    const filteredItems = sourceItems.filter(item => {
        const matchSearch = item.item_name.toLowerCase().includes(searchTerm.toLowerCase()) || item.category.toLowerCase().includes(searchTerm.toLowerCase())
        const matchCat = filterCategory ? item.category === filterCategory : true
        return matchSearch && matchCat
    })

    return (
        <div className="card">
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0 }}>
                    소모품 마스터 리스트 (단가표)
                    {month && <span style={{ fontSize: '0.85em', color: '#0ea5e9', marginLeft: '10px' }}>- {month} 기준 재고</span>}
                </h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <ExportButton
                        onClick={() => exportToCSV(filteredItems || [], `소모품리스트_${viewMode}_${todayStr()}`)}
                        disabled={!filteredItems || filteredItems.length === 0}
                    />
                    <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setFormData({ row_index: null, category: '', item_name: '', price: '', is_tracked: false, base_qty: '', order_qty: '' }); }}>
                        {showForm ? '닫기' : '+ 품목 추가'}
                    </button>
                </div>
            </div>

            {/* 일반 소모품 / 토너 재고 관리 서브 탭 */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '1rem', borderBottom: '2px solid #e2e8f0', paddingBottom: '0' }}>
                <button
                    onClick={() => { setViewMode('general'); setFilterCategory(''); setSearchTerm('') }}
                    style={{
                        padding: '8px 20px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95em',
                        borderBottom: viewMode === 'general' ? '3px solid #4f46e5' : '3px solid transparent',
                        color: viewMode === 'general' ? '#4f46e5' : '#64748b',
                        background: 'none', marginBottom: '-2px'
                    }}
                >
                    📦 일반 소모품
                    <span style={{ marginLeft: '6px', padding: '1px 7px', borderRadius: '10px', fontSize: '0.8em', backgroundColor: viewMode === 'general' ? '#e0e7ff' : '#f1f5f9', color: viewMode === 'general' ? '#4f46e5' : '#64748b' }}>
                        {allGeneral.length}
                    </span>
                </button>
                <button
                    onClick={() => { setViewMode('toner-inventory'); setFilterCategory(''); setSearchTerm('') }}
                    style={{
                        padding: '8px 20px', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.95em',
                        borderBottom: viewMode === 'toner-inventory' ? '3px solid #22c55e' : '3px solid transparent',
                        color: viewMode === 'toner-inventory' ? '#15803d' : '#64748b',
                        background: 'none', marginBottom: '-2px'
                    }}
                >
                    📊 토너 재고 관리
                </button>
            </div>

            {/* 토너 재고 관리 뷰 */}
            {viewMode === 'toner-inventory' && <TonnerInventoryTab compact />}

            {viewMode === 'general' && <>
            {/* 품목 추가 폼 */}
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
                    <button type="submit" className="btn btn-primary" disabled={mutation.isPending} style={{ marginLeft: 'auto' }}>
                        저장하기
                    </button>
                    <div style={{ fontSize: '0.8em', color: '#666', marginTop: '5px', width: '100%' }}>* 품목명이 같을 경우 수정되고, 다를 경우 덧붙여집니다.</div>
                </form>
            )}

            <LoadingModal isOpen={mutation.isPending} message="소모품 정보를 저장 중입니다..." />

            {/* 검색 / 필터 */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', background: '#f8f9fa', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <input
                    type="text"
                    placeholder={'🔍 소모품명 또는 대분류 검색...'}
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

            {/* 테이블 */}
            <table className="data-table">
                <thead>
                    <tr>
                        <th>대분류 (Category)</th>
                        <th>{'소모품명 (Item Name)'}</th>
                        <th style={{ textAlign: 'right' }}>정상 단가(₩)</th>
                        <th style={{ textAlign: 'center' }}>고정 재고(기준)</th>
                        <th style={{ textAlign: 'center' }}>현재 재고(입고량)</th>
                        <th style={{ textAlign: 'center' }}>상태(재고현황)</th>
                        <th style={{ textAlign: 'center' }}>관리</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredItems.length > 0 ? filteredItems.map((item, idx) => {
                        const handleInlineUpdate = (field, newVal) => {
                            mutation.mutate({ ...item, [field]: newVal })
                        }
                        let statusBadge = <span style={{ color: '#aaa', fontSize: '0.85em' }}>추적안함 (-)</span>
                        if (item.is_tracked) {
                            const current = item.current_stock || 0
                            const base = item.base_qty || 1
                            const isLow = current < base
                            statusBadge = (
                                <span style={{
                                    padding: '3px 8px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 'bold',
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
                            <tr key={idx} style={{}}>
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
                        <tr><td colSpan="7" style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
                            조건에 맞는 품목이 없습니다.
                        </td></tr>
                    )}
                </tbody>
            </table>
            </>}
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
                {isLoading ? <LoadingModal isOpen={isLoading} message="품목 이력을 불러오는 중입니다..." /> : (
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

    if (isLoading) return <LoadingModal isOpen={isLoading} message="재고 추적 데이터를 불러오는 중입니다..." />

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
                <button type="submit" className="btn btn-primary" style={{ padding: '12px', fontSize: '1.1em', marginTop: '10px' }} disabled={mutation.isPending}>
                    {mutation.isPending ? '시트 개설 중...' : '새로운 월 출고 시트 개설하기'}
                </button>
            </form>
        </div>
    )
}


const TonnerConsignmentTab = ({ month, months }) => {
    const queryClient = useQueryClient()
    const [filterMonth, setFilterMonth] = useState(month || '')
    const [editingKey, setEditingKey] = useState(null) // "month-rowIndex"
    const [editForm, setEditForm] = useState({})
    const [confirmModal, setConfirmModal] = useState({ isOpen: false, row: null })

    const { data: history, isLoading } = useQuery({
        queryKey: ['tonner-consignment', filterMonth],
        queryFn: async () => {
            const url = filterMonth
                ? `/api/consumables/tonner-consignment?month=${encodeURIComponent(filterMonth)}`
                : '/api/consumables/tonner-consignment'
            const { data } = await axios.get(url)
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

    const itemOptions = useMemo(() =>
        (itemsList || []).map(it => ({ label: it.item_name, value: it.item_name })),
    [itemsList])

    const userOptions = useMemo(() =>
        (usersList || []).map(u => {
            const englishName = (u.NAME || '').trim().replace(/\./g, ' ')
            const nameOnly = englishName
                || (u.email || '').split('@')[0].replace(/\./g, ' ')
                || (u.이름 || '').replace(/\./g, ' ')
            const fullNameWithBU = `${nameOnly}${u.BU ? ` (${u.BU})` : ''}`
            return { label: nameOnly, value: fullNameWithBU, name: nameOnly, email: u.email, bu: u.BU }
        }).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [usersList])

    const updateMutation = useMutation({
        mutationFn: async ({ month: m, row_index, ...data }) =>
            axios.put('/api/consumables/outbound', { month: m, row_index, ...data, outbound_type: '위탁' }),
        onSuccess: () => {
            queryClient.invalidateQueries(['tonner-consignment'])
            setEditingKey(null)
            alert("수정되었습니다.")
        },
        onError: () => alert("수정 중 오류가 발생했습니다.")
    })

    const deleteMutation = useMutation({
        mutationFn: async ({ month: m, row_index, date, item_name }) =>
            axios.delete(
                `/api/consumables/outbound?month=${encodeURIComponent(m)}&row_index=${row_index}` +
                `&verify_date=${encodeURIComponent(date || '')}&verify_item=${encodeURIComponent(item_name || '')}`
            ),
        onSuccess: () => {
            queryClient.invalidateQueries(['tonner-consignment'])
            setConfirmModal({ isOpen: false, row: null })
            alert("삭제되었습니다.")
        },
        onError: () => alert("삭제 중 오류가 발생했습니다.")
    })

    const handleEditStart = (row) => {
        setEditingKey(`${row.month}-${row.row_index}`)
        setEditForm({ ...row })
    }

    const handleEditSave = () => {
        if (!editForm.date || !editForm.item_name || !editForm.quantity || !editForm.user_name) {
            alert("모든 필드를 입력해야 합니다.")
            return
        }
        updateMutation.mutate(editForm)
    }

    // 월별 그룹 + 합계
    const grouped = useMemo(() => {
        if (!history) return {}
        return history.reduce((acc, row) => {
            const key = row.month
            if (!acc[key]) acc[key] = { rows: [], total: 0 }
            acc[key].rows.push(row)
            acc[key].total += Number(row.quantity) || 0
            return acc
        }, {})
    }, [history])

    const grandTotal = history?.reduce((s, r) => s + (Number(r.quantity) || 0), 0) || 0

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                    <h3 style={{ margin: 0 }}>🖨️ 위탁 토너 출고 내역</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.9em', color: '#666' }}>
                        위탁으로 출고된 Tonner 전용 내역 — 견적서 합산에서 제외되며 별도 재고 카운트에 반영됩니다.
                    </p>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <label style={{ fontWeight: 'bold', fontSize: '0.9em' }}>📅 월 필터:</label>
                    <select
                        value={filterMonth}
                        onChange={e => setFilterMonth(e.target.value)}
                        style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #ddd', minWidth: '140px' }}
                    >
                        <option value="">전체 월</option>
                        {(months || []).map(m => (
                            <option key={m} value={m}>{m}</option>
                        ))}
                    </select>
                </div>
            </div>

            <LoadingModal isOpen={isLoading} message="위탁 토너 내역을 불러오는 중..." />
            <LoadingModal isOpen={updateMutation.isPending} message="수정 중입니다..." />
            <LoadingModal isOpen={deleteMutation.isPending} message="삭제 중입니다..." />

            {!isLoading && history?.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#999', background: '#fafafa', borderRadius: '8px' }}>
                    위탁 출고된 Tonner 내역이 없습니다.
                </div>
            )}

            {!isLoading && history?.length > 0 && (
                <>
                    {Object.entries(grouped).map(([grpMonth, { rows, total }]) => (
                        <div key={grpMonth} style={{ marginBottom: '1.5rem' }}>
                            <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                background: '#fff7ed', borderLeft: '4px solid #f97316',
                                padding: '8px 14px', borderRadius: '4px', marginBottom: '6px'
                            }}>
                                <span style={{ fontWeight: 'bold', color: '#c2410c' }}>{grpMonth}</span>
                                <span style={{ fontSize: '0.9em', color: '#7c3aed', fontWeight: 'bold' }}>
                                    총 {total.toLocaleString()}개
                                </span>
                            </div>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>출고 날짜</th>
                                        <th>품목명</th>
                                        <th style={{ textAlign: 'center' }}>수량</th>
                                        <th>사용 / 담당자</th>
                                        <th style={{ textAlign: 'center' }}>관리</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((row, idx) => {
                                        const rowKey = `${row.month}-${row.row_index}`
                                        const isEditing = editingKey === rowKey
                                        return isEditing ? (
                                            <tr key={idx} style={{ background: '#fefce8' }}>
                                                <td>
                                                    <input type="date" value={editForm.date}
                                                        onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                                                        style={{ padding: '4px', borderRadius: '4px', border: '1px solid #ddd', width: '130px' }} />
                                                </td>
                                                <td>
                                                    <SearchableSelect
                                                        options={itemOptions}
                                                        value={editForm.item_name}
                                                        onChange={val => setEditForm(f => ({ ...f, item_name: val }))}
                                                        placeholder="품목 선택"
                                                        width="200px"
                                                    />
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    <input type="number" min="1" value={editForm.quantity}
                                                        onChange={e => setEditForm(f => ({ ...f, quantity: e.target.value }))}
                                                        style={{ padding: '4px', width: '60px', borderRadius: '4px', border: '1px solid #ddd', textAlign: 'center' }} />
                                                </td>
                                                <td>
                                                    <SearchableSelect
                                                        options={userOptions}
                                                        value={editForm.user_name}
                                                        onChange={val => setEditForm(f => ({ ...f, user_name: val }))}
                                                        placeholder="담당자 선택"
                                                        searchFields={["name", "email", "bu"]}
                                                        width="220px"
                                                        allowCustom={true}
                                                    />
                                                </td>
                                                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    <button className="btn btn-primary" style={{ padding: '4px 10px', fontSize: '0.85em', marginRight: '4px' }}
                                                        onClick={handleEditSave} disabled={updateMutation.isPending}>저장</button>
                                                    <button className="btn" style={{ padding: '4px 10px', fontSize: '0.85em' }}
                                                        onClick={() => setEditingKey(null)}>취소</button>
                                                </td>
                                            </tr>
                                        ) : (
                                            <tr key={idx}>
                                                <td>{row.date}</td>
                                                <td>
                                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                        {row.item_name}
                                                        <span style={{ padding: '1px 6px', borderRadius: '8px', fontSize: '0.75em', backgroundColor: '#fed7aa', color: '#c2410c', fontWeight: 'bold' }}>위탁</span>
                                                    </span>
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: 'bold' }}>{Number(row.quantity).toLocaleString()}</td>
                                                <td>{formatUserNames(row.user_name)}</td>
                                                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    <button title="수정" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem', marginRight: '4px' }}
                                                        onClick={() => handleEditStart(row)}>✏️</button>
                                                    <button title="삭제" style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                                                        onClick={() => setConfirmModal({ isOpen: true, row })}>🗑️</button>
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    ))}

                    {/* 총계 */}
                    <div style={{
                        display: 'flex', justifyContent: 'flex-end',
                        padding: '10px 16px', background: '#f1f5f9', borderRadius: '6px',
                        fontWeight: 'bold', fontSize: '1em', color: '#1e293b'
                    }}>
                        전체 위탁 토너 출고 합계:&nbsp;
                        <span style={{ color: '#7c3aed', fontSize: '1.1em' }}>{grandTotal.toLocaleString()}개</span>
                    </div>
                </>
            )}

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                message={`"${confirmModal.row?.item_name}" 위탁 출고 내역을 삭제하시겠습니까?`}
                onConfirm={() => deleteMutation.mutate({ month: confirmModal.row.month, row_index: confirmModal.row.row_index, date: confirmModal.row.date, item_name: confirmModal.row.item_name })}
                onCancel={() => setConfirmModal({ isOpen: false, row: null })}
            />
        </div>
    )
}

const TonnerInventoryTab = () => {
    const queryClient = useQueryClient()
    const [editingRow, setEditingRow] = useState(null)   // row_index being edited
    const [editForm, setEditForm] = useState({})
    const [searchTerm, setSearchTerm] = useState('')

    const { data: invData, isLoading, refetch, isFetching } = useQuery({
        queryKey: ['toner-inventory'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/toner-inventory')
            return data
        }
    })

    const updateMutation = useMutation({
        mutationFn: async (rowData) => axios.put('/api/consumables/toner-inventory', rowData),
        onSuccess: () => {
            queryClient.invalidateQueries(['toner-inventory'])
            setEditingRow(null)
            alert("저장되었습니다.")
        },
        onError: () => alert("저장 중 오류가 발생했습니다.")
    })

    const headers    = invData?.headers    || []
    const items      = invData?.items      || []
    const nameCol    = invData?.name_col
    const stockCol   = invData?.stock_col
    const modelCol   = invData?.model_col

    const filtered = searchTerm
        ? items.filter(it => headers.some(h => String(it[h] || '').toLowerCase().includes(searchTerm.toLowerCase())))
        : items

    const handleEditStart = (item) => {
        setEditingRow(item.row_index)
        setEditForm({ ...item })
    }

    const handleEditSave = () => {
        updateMutation.mutate(editForm)
    }

    const handleSync = async () => {
        await axios.get('/api/consumables/clear-cache')
        refetch()
    }

    // 재고 상태 뱃지
    const StockBadge = ({ item }) => {
        if (stockCol == null || item[stockCol] == null) return <span style={{ color: '#aaa', fontSize: '0.85em' }}>-</span>
        const qty = item.current_stock ?? 0
        const isLow = qty <= 0
        return (
            <span style={{
                padding: '3px 10px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 'bold', display: 'inline-block',
                backgroundColor: isLow ? '#fee2e2' : '#dcfce7',
                color: isLow ? '#ef4444' : '#22c55e',
                border: `1px solid ${isLow ? '#fca5a5' : '#86efac'}`
            }}>
                {isLow ? `🚨 재고 없음 (${qty}개)` : `✅ 재고 있음 (${qty}개)`}
            </span>
        )
    }

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                <div>
                    <h3 style={{ margin: 0 }}>📊 토너 재고 관리</h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85em', color: '#64748b' }}>
                        전용 구글 시트 기준 — 일반 출고 시 자동 차감 · 더블클릭으로 인라인 수정
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <ExportButton
                        onClick={() => {
                            const rows = filtered.map(it => {
                                const { row_index, headers: _h, name_col_idx: _n, stock_col_idx: _s, current_stock: _c, compatible_models: _m, item_name: _i, ...rest } = it
                                return rest
                            })
                            exportToCSV(rows, `토너재고_${todayStr()}`)
                        }}
                        disabled={filtered.length === 0}
                    />
                    <button className="btn btn-secondary" onClick={handleSync} disabled={isFetching} style={{ fontSize: '0.9em' }}>
                        {isFetching ? '동기화 중...' : '🔄 시트 동기화'}
                    </button>
                </div>
            </div>

            {/* 요약 카드 */}
            {items.length > 0 && (() => {
                const lowStock  = items.filter(it => (it.current_stock ?? 0) <= 0)
                const goodStock = items.filter(it => (it.current_stock ?? 0) > 0)
                return (
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 18px', minWidth: '120px' }}>
                            <div style={{ fontSize: '0.75em', color: '#15803d', fontWeight: 'bold' }}>✅ 재고 있음</div>
                            <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#22c55e' }}>{goodStock.length}</div>
                        </div>
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 18px', minWidth: '120px' }}>
                            <div style={{ fontSize: '0.75em', color: '#dc2626', fontWeight: 'bold' }}>🚨 재고 없음</div>
                            <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#ef4444' }}>{lowStock.length}</div>
                        </div>
                        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 18px', minWidth: '120px' }}>
                            <div style={{ fontSize: '0.75em', color: '#64748b', fontWeight: 'bold' }}>전체 품목</div>
                            <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#334155' }}>{items.length}</div>
                        </div>
                    </div>
                )
            })()}

            {/* 검색 */}
            <div style={{ marginBottom: '1rem' }}>
                <input
                    type="text"
                    placeholder="🔍 토너명 / 기종 검색..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    style={{ padding: '8px 12px', width: '100%', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.95em' }}
                />
            </div>

            {isLoading && <LoadingModal isOpen={isLoading} message="토너 재고 데이터를 불러오는 중입니다..." />}
            <LoadingModal isOpen={updateMutation.isPending} message="저장 중입니다..." />

            {!isLoading && headers.length === 0 && (
                <div style={{ textAlign: 'center', padding: '2rem', color: '#94a3b8', background: '#f8fafc', borderRadius: '8px' }}>
                    토너 재고 시트에 데이터가 없거나 연결할 수 없습니다.<br/>
                    <small>구글 시트 권한 및 TONER_SPREADSHEET_ID 환경변수를 확인하세요.</small>
                </div>
            )}

            {!isLoading && headers.length > 0 && (
                <div className="table-wrapper" style={{ overflowX: 'auto' }}>
                    <table className="data-table">
                        <thead>
                            <tr>
                                {headers.map(h => (
                                    <th key={h} style={{
                                        backgroundColor: h === stockCol ? '#f0fdf4' : h === nameCol ? '#eff6ff' : h === modelCol ? '#fefce8' : undefined,
                                        color: h === stockCol ? '#15803d' : h === nameCol ? '#1d4ed8' : h === modelCol ? '#854d0e' : undefined,
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {h === stockCol ? '📦 재고' : h === nameCol ? `🖨️ ${h}` : h === modelCol ? `🔧 ${h}` : h}
                                    </th>
                                ))}
                                <th style={{ textAlign: 'center', width: '60px' }}>수정</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length > 0 ? filtered.map((item) => {
                                const isEditing = editingRow === item.row_index
                                const isLow = (item.current_stock ?? 1) <= 0
                                return (
                                    <tr key={item.row_index} style={{ backgroundColor: isEditing ? '#fefce8' : isLow ? '#fff5f5' : 'transparent' }}>
                                        {isEditing ? (
                                            <>
                                                {headers.map(h => (
                                                    <td key={h} style={{ padding: '4px' }}>
                                                        <input
                                                            type={h === stockCol ? 'number' : 'text'}
                                                            value={editForm[h] ?? ''}
                                                            onChange={e => setEditForm(f => ({ ...f, [h]: e.target.value }))}
                                                            style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #93c5fd', boxSizing: 'border-box', minWidth: h === stockCol ? '70px' : '100px' }}
                                                        />
                                                    </td>
                                                ))}
                                                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: '0.8em', marginRight: '3px' }} onClick={handleEditSave} disabled={updateMutation.isPending}>💾</button>
                                                    <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '0.8em' }} onClick={() => setEditingRow(null)}>✖</button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                {headers.map(h => (
                                                    <td key={h}
                                                        onDoubleClick={() => handleEditStart(item)}
                                                        title="더블클릭으로 수정"
                                                        style={{
                                                            cursor: 'pointer',
                                                            fontWeight: h === nameCol ? 'bold' : 'normal',
                                                            textAlign: h === stockCol ? 'center' : undefined,
                                                            whiteSpace: h === modelCol ? 'pre-wrap' : undefined,
                                                            maxWidth: h === modelCol ? '220px' : undefined,
                                                            fontSize: h === modelCol ? '0.85em' : undefined
                                                        }}
                                                    >
                                                        {h === stockCol ? (
                                                            <span style={{
                                                                display: 'inline-block',
                                                                padding: '2px 12px',
                                                                borderRadius: '12px',
                                                                fontWeight: 'bold',
                                                                fontSize: '0.95em',
                                                                backgroundColor: (item.current_stock ?? 0) <= 0 ? '#fee2e2' : '#dcfce7',
                                                                color: (item.current_stock ?? 0) <= 0 ? '#ef4444' : '#15803d',
                                                                border: `1px solid ${(item.current_stock ?? 0) <= 0 ? '#fca5a5' : '#86efac'}`
                                                            }}>
                                                                {(item.current_stock ?? 0) <= 0 ? `🚨 ${item.current_stock ?? 0}개` : `${item.current_stock ?? 0}개`}
                                                            </span>
                                                        ) : item[h]}
                                                    </td>
                                                ))}
                                                <td style={{ textAlign: 'center' }}>
                                                    <button
                                                        title="수정"
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1rem' }}
                                                        onClick={() => handleEditStart(item)}
                                                    >✏️</button>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                )
                            }) : (
                                <tr><td colSpan={headers.length + 2} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>검색 결과가 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {!isLoading && items.length > 0 && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.8em', color: '#94a3b8', textAlign: 'right' }}>
                    💡 더블클릭하거나 ✏️ 버튼으로 수정 · 일반 출고 시 재고 자동 차감
                </div>
            )}
        </div>
    )
}

export default Consumables

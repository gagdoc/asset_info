import { useState, useEffect, useRef, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import ConfirmModal from '../components/ConfirmModal'
import SearchableSelect from '../components/SearchableSelect'
import LoadingModal from '../components/LoadingModal'
import ImageCropModal from '../components/ImageCropModal'
import ImageViewerModal from '../components/ImageViewerModal'
import { exportToXLSX, todayStr, ExportButton } from '../utils/exportUtils'

const Consumables = () => {
    const [activeTab, setActiveTab] = useState('estimate')
    const [selectedMonth, setSelectedMonth] = useState('')
    const queryClient = useQueryClient()
    const [isSyncing, setIsSyncing] = useState(false)

    // 실행 환경 확인 (개발 모드 배너용)
    const { data: appEnv } = useQuery({
        queryKey: ['app-env'],
        queryFn: async () => { const { data } = await axios.get('/api/consumables/app-env'); return data },
        staleTime: Infinity,
    })
    const isDev = appEnv ? !appEnv.is_production : true  // 응답 전까지 개발 모드로 간주

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

    // 페이지 로딩 시 토너 재고 시트 → 품목리스트 자동 동기화 (1회)
    useEffect(() => {
        let cancelled = false
        const runSync = async () => {
            try {
                const { data } = await axios.post('/api/consumables/sync-toner')
                if (cancelled) return
                if (data.added_count > 0) {
                    queryClient.invalidateQueries(['consumables-items'])
                    console.info(`토너 동기화: ${data.added_count}개 품목 추가 (${data.added.join(', ')})`)
                }
            } catch (e) {
                console.warn('토너 동기화 실패:', e)
            }
        }
        runSync()
        return () => { cancelled = true }
    }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
                
                {activeTab !== 'create-month' && activeTab !== 'items' && (
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

            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
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
                    className={`btn ${activeTab === 'purchase' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('purchase')}
                    style={{ backgroundColor: activeTab === 'purchase' ? '' : '#eff6ff', border: '1px solid #3b82f6', color: activeTab === 'purchase' ? '' : '#1d4ed8' }}
                >
                    🛒 구매 입고
                </button>
                <button
                    className={`btn ${activeTab === 'inventory' ? 'btn-primary' : ''}`}
                    onClick={() => setActiveTab('inventory')}
                    style={{ backgroundColor: activeTab === 'inventory' ? '' : '#f0fdf4', border: '1px solid #22c55e', color: activeTab === 'inventory' ? '' : '#15803d' }}
                >
                    📊 입출고 현황
                </button>
            </div>

            {activeTab === 'estimate' && selectedMonth && <EstimateTab month={selectedMonth} />}
            {activeTab === 'outbound' && selectedMonth && <OutboundTab month={selectedMonth} isDev={isDev} />}
            {activeTab === 'create-month' && <CreateMonthTab />}
            {activeTab === 'items' && <ItemsTab />}
            {activeTab === 'tracked' && <TrackedItemsTab />}
            {activeTab === 'purchase' && <PurchaseTab months={monthsData} items={undefined} />}
            {activeTab === 'inventory' && <InventoryTab />}
            
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

    const handleCopyText = async () => {
        if (!estimateData || estimateData.length === 0) return;
        
        let text = "순번. 품명 (총수) : 사용자(상세)\n";
        estimateData.forEach((row, idx) => {
            const users = Array.isArray(row.users) ? row.users.join(', ') : (row.users || '');
            text += `${idx + 1}. ${row.item_name} (${row.total_qty}EA) : ${users}\n`;
        });
        
        try {
            await navigator.clipboard.writeText(text);
            alert("텍스트가 클립보드에 복사되었습니다.");
        } catch (err) {
            console.error('Failed to copy!', err);
            alert("복사에 실패했습니다.");
        }
    }

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                <h3>{month} 견적서 산출 내역</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <button 
                        className="btn btn-secondary" 
                        onClick={handleCopyText} 
                        disabled={!estimateData || estimateData.length === 0}
                        style={{ backgroundColor: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1' }}
                    >
                        📋 텍스트 복사
                    </button>
                    <ExportButton
                        onClick={async () => {
                        const rows = (estimateData || []).map(r => ({
                            '구분(분류)': r.category, '품목명': r.item_name,
                            '총수량': r.total_qty, '사용자': Array.isArray(r.users) ? r.users.join(', ') : (r.users || ''),
                            '단가(원)': r.unit_price, '견적비용(원)': r.total_price || r.total_cost || '',
                        }))
                        // 총 합계 행 추가
                        if (rows.length > 0) {
                            rows.push({
                                '구분(분류)': '총 합계',
                                '품목명': '',
                                '총수량': totalQty.toLocaleString(),
                                '사용자': '',
                                '단가(원)': '',
                                '견적비용(원)': totalCost.toLocaleString(),
                            })
                        }
                        await exportToXLSX({ filename: `견적서_${month}_${todayStr()}`,
                            columns: [{key:'구분(분류)',label:'구분(분류)'},{key:'품목명',label:'품목명'},{key:'총수량',label:'총수량'},{key:'사용자',label:'사용자'},{key:'단가(원)',label:'단가(원)'},{key:'견적비용(원)',label:'견적비용(원)'}],
                            rows })
                    }}
                        disabled={!estimateData || estimateData.length === 0}
                    />
                    <button className="btn btn-secondary" onClick={() => refetch()} disabled={isFetching}>
                        {isFetching ? '새로고침 중...' : '시트 데이터 다시 불러오기'}
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

const OutboundTab = ({ month, isDev = false }) => {
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
    const [originalRow, setOriginalRow] = useState(null)
    const [editForm, setEditForm] = useState({})
    const [isEditModalOpen, setIsEditModalOpen] = useState(false)

    const updateMutation = useMutation({
        mutationFn: async (newData) => await axios.put('/api/consumables/outbound', newData),
        onSuccess: () => {
            queryClient.invalidateQueries(['consumables-outbound', month])
            queryClient.invalidateQueries(['consumables-items'])
            setEditingRow(null)
            setOriginalRow(null)
            setIsEditModalOpen(false)
            alert("출고 내역이 수정되었습니다.")
        },
        onError: () => alert("수정 중 오류가 발생했습니다.")
    })

    const [selectedRows, setSelectedRows] = useState([]) // [row.row_index]

    const deleteMutation = useMutation({
        mutationFn: async ({ rowIndex, date, item_name, user_name }) => await axios.delete(
            `/api/consumables/outbound?month=${month}&row_index=${rowIndex}` +
            `&verify_date=${encodeURIComponent(date)}&verify_item=${encodeURIComponent(item_name)}` +
            `&verify_user=${encodeURIComponent(user_name || '')}`
        ),
        onSuccess: () => {
            alert("출고 내역이 삭제되었습니다.")
            setSelectedRows([])
            setTimeout(() => {
                queryClient.invalidateQueries(['consumables-outbound', month])
                queryClient.invalidateQueries(['consumables-estimate', month])
                queryClient.invalidateQueries(['consumables-items'])
            }, 800)
        },
        onError: (err) => alert(err?.response?.data?.detail || "삭제 중 오류가 발생했습니다.")
    })

    const deleteBatchMutation = useMutation({
        mutationFn: async (items) => await axios.delete('/api/consumables/outbound/batch', {
            data: { month, items }
        }),
        onSuccess: (res) => {
            alert(`선택한 ${res.data?.deleted_count || 0}건의 출고 내역이 안전하게 삭제되었습니다.`)
            setSelectedRows([])
            setTimeout(() => {
                queryClient.invalidateQueries(['consumables-outbound', month])
                queryClient.invalidateQueries(['consumables-estimate', month])
                queryClient.invalidateQueries(['consumables-items'])
            }, 800)
        },
        onError: (err) => alert(err?.response?.data?.detail || "일괄 삭제 중 오류가 발생했습니다.")
    })

    const handleEditStart = (row) => {
        setEditingRow(row.row_index)
        setOriginalRow(row)
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
            verify_date: originalRow?.date,
            verify_item: originalRow?.item_name,
            verify_user: originalRow?.user_name,
            ...editForm
        })
    }

    const [confirmModal, setConfirmModal] = useState({ isOpen: false, rows: [], isBatch: false })

    const handleDelete = (row) => {
        setConfirmModal({ isOpen: true, rows: [row], isBatch: false })
    }

    const handleBatchDeleteClick = () => {
        const rowsToDelete = (history || []).filter(r => selectedRows.includes(r.row_index))
        if (rowsToDelete.length === 0) return
        setConfirmModal({ isOpen: true, rows: rowsToDelete, isBatch: true })
    }

    const executeDelete = () => {
        const { rows, isBatch } = confirmModal
        if (isBatch) {
            const items = rows.map(r => ({
                row_index: r.row_index,
                verify_date: r.date,
                verify_item: r.item_name,
                verify_user: r.user_name || ''
            }))
            deleteBatchMutation.mutate(items)
        } else if (rows.length > 0) {
            const row = rows[0]
            deleteMutation.mutate({
                rowIndex: row.row_index,
                date: row.date,
                item_name: row.item_name,
                user_name: row.user_name
            })
        }
        setConfirmModal({ isOpen: false, rows: [], isBatch: false })
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
            queryClient.invalidateQueries(['consumables-items'])
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
            queryClient.invalidateQueries(['consumables-items'])
            setShowForm(false)
            setFormData({ date: '', item_name: '', quantity: '1', outbound_type: '일반', staff: '', staff_custom: '', delivery: '', delivery_custom: '' })
            setUserNames([''])
            alert(`출고 내역이 추가되었습니다. (${filledUsers.length}명 → 1행)`)
        } catch (err) {
            const msg = err?.response?.data?.detail || "오류가 발생했습니다. 구글 시트를 확인하세요."
            alert(msg)
        } finally {
            setIsSubmittingMulti(false)
        }
    }

    if (isLoading) return <LoadingModal isOpen={isLoading} message="출고 상세 내역을 불러오는 중입니다..." />

    return (
        <div className="card">
            {/* 월 마감 상태바 */}
            <MonthStatusBar month={month} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0 }}>{month} 출고 상세 기록</h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <ExportButton
                        onClick={async () => {
                        const rows = (history || []).map(r => ({
                            '출고날짜': r.date, '구분': r.category || '',
                            '품목명': r.item_name, '지급수량': r.quantity,
                            '지급대상자': r.user_name, '지급담당': r.staff || '',
                            '수령방법': r.delivery || '', '유형': r.outbound_type || '일반',
                        }))
                        await exportToXLSX({ filename: `출고내역_${month}_${todayStr()}`,
                            columns: [{key:'출고날짜',label:'출고날짜'},{key:'구분',label:'구분'},{key:'품목명',label:'품목명'},{key:'지급수량',label:'지급수량'},{key:'지급대상자',label:'지급대상자'},{key:'지급담당',label:'지급담당'},{key:'수령방법',label:'수령방법'},{key:'유형',label:'유형'}],
                            rows })
                    }}
                        disabled={!history || history.length === 0}
                    />
                    <MonthStatusButton month={month} isDev={isDev} />
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
                </form>
            )}

            <LoadingModal isOpen={isSubmittingMulti} message="출고 내역을 구글 시트에 기록 중입니다..." />
            <LoadingModal isOpen={updateMutation.isPending} message="출고 내역을 수정하고 있습니다..." />
            <LoadingModal isOpen={deleteMutation.isPending} message="출고 내역을 삭제하고 있습니다..." />
            <LoadingModal isOpen={deleteBatchMutation.isPending} message="선택한 출고 내역들을 안전하게 삭제하고 있습니다..." />

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

                {/* 다중 선택 일괄 삭제 액션 바 */}
                {selectedRows.length > 0 && (
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '10px',
                        backgroundColor: '#fef2f2', border: '1px solid #fecaca',
                        padding: '4px 12px', borderRadius: '8px', marginLeft: 'auto'
                    }}>
                        <span style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#b91c1c' }}>
                            ✓ {selectedRows.length}건 선택됨
                        </span>
                        <button
                            className="btn btn-danger"
                            style={{ padding: '4px 10px', fontSize: '0.85em', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
                            onClick={handleBatchDeleteClick}
                            disabled={deleteBatchMutation.isPending}
                        >
                            🗑️ 선택 삭제 ({selectedRows.length}건)
                        </button>
                        <button
                            className="btn btn-secondary"
                            style={{ padding: '4px 8px', fontSize: '0.82em' }}
                            onClick={() => setSelectedRows([])}
                        >
                            선택 해제
                        </button>
                    </div>
                )}
            </div>

            <table className="data-table">
                <thead>
                    <tr>
                        <th style={{ width: '40px', textAlign: 'center' }}>
                            <input
                                type="checkbox"
                                title="전체 선택 / 해제"
                                checked={filteredHistory.length > 0 && filteredHistory.every(r => selectedRows.includes(r.row_index))}
                                onChange={e => {
                                    if (e.target.checked) {
                                        const allIds = filteredHistory.map(r => r.row_index)
                                        setSelectedRows(Array.from(new Set([...selectedRows, ...allIds])))
                                    } else {
                                        const filteredIds = new Set(filteredHistory.map(r => r.row_index))
                                        setSelectedRows(selectedRows.filter(id => !filteredIds.has(id)))
                                    }
                                }}
                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                            />
                        </th>
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
                        const isSelected = selectedRows.includes(row.row_index);
                        const rowBg = isSelected ? '#fee2e2' : (isConsignment ? '#fff7ed' : 'transparent');
                        return (
                            <tr key={idx} style={{ backgroundColor: rowBg, transition: 'background-color 0.15s' }}>
                                <td style={{ textAlign: 'center' }}>
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={e => {
                                            if (e.target.checked) {
                                                setSelectedRows(prev => [...prev, row.row_index])
                                            } else {
                                                setSelectedRows(prev => prev.filter(id => id !== row.row_index))
                                            }
                                        }}
                                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                    />
                                </td>
                                <td>{row.date}</td>
                                <td style={{ fontSize: '0.85em', color: '#64748b' }}>{row.category || '-'}</td>
                                <td>{row.item_name}</td>
                                <td style={{ textAlign: 'center', fontWeight: isSelected ? 'bold' : 'normal' }}>{row.quantity}</td>
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
                                    <button className="btn btn-danger" style={{ padding: '2px 6px', fontSize: '0.8em' }} onClick={() => handleDelete(row)} disabled={deleteMutation.isPending || deleteBatchMutation.isPending}>🗑️</button>
                                </td>
                            </tr>
                        )
                    }) : (
                        <tr><td colSpan="10" style={{ textAlign: 'center' }}>출고 내역이 비어 있습니다.</td></tr>
                    )}
                </tbody>
            </table>

            {/* 안전 확인 모달 (단일/선택 일괄 삭제 모두 지원) */}
            {confirmModal.isOpen && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999
                }}>
                    <div style={{
                        background: '#fff', padding: '24px', borderRadius: '12px', maxWidth: '480px', width: '92%',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '2.2rem', marginBottom: '10px' }}>⚠️</div>
                            <h3 style={{ margin: '0 0 10px 0', color: '#1a202c', fontSize: '1.2rem' }}>
                                {confirmModal.isBatch ? `선택한 ${confirmModal.rows.length}건의 출고 내역을 삭제하시겠습니까?` : '출고 내역을 삭제하시겠습니까?'}
                            </h3>
                            <p style={{ margin: '0 0 14px 0', color: '#4b5563', fontSize: '0.9rem', lineHeight: '1.4' }}>
                                삭제 시 재고 관리 품목(토너 등)의 경우 <strong>출고 수량만큼 실재고가 자동으로 복원</strong>됩니다.
                            </p>
                        </div>

                        {/* 삭제 대상 항목 리스트 미리보기 */}
                        <div style={{
                            maxHeight: '180px', overflowY: 'auto', background: '#f8fafc',
                            border: '1px solid #e2e8f0', borderRadius: '8px', padding: '10px 14px', marginBottom: '20px'
                        }}>
                            <div style={{ fontSize: '0.82em', fontWeight: 'bold', color: '#64748b', marginBottom: '6px' }}>
                                📋 삭제 대상 목록 ({confirmModal.rows.length}건):
                            </div>
                            {confirmModal.rows.map((r, i) => (
                                <div key={i} style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    fontSize: '0.85em', padding: '4px 0', borderBottom: i < confirmModal.rows.length - 1 ? '1px dashed #cbd5e1' : 'none'
                                }}>
                                    <span style={{ color: '#334155', fontWeight: '500' }}>
                                        {r.date} | <strong>{r.item_name}</strong> ({formatUserNames(r.user_name)})
                                    </span>
                                    <span style={{ color: '#dc2626', fontWeight: 'bold' }}>
                                        {r.quantity}개
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button
                                className="btn btn-secondary"
                                onClick={() => setConfirmModal({ isOpen: false, rows: [], isBatch: false })}
                                style={{ padding: '8px 16px' }}
                            >
                                취소
                            </button>
                            <button
                                className="btn btn-danger"
                                onClick={executeDelete}
                                disabled={deleteMutation.isPending || deleteBatchMutation.isPending}
                                style={{ padding: '8px 20px', fontWeight: 'bold' }}
                            >
                                {confirmModal.isBatch ? `선택 ${confirmModal.rows.length}건 삭제` : '삭제하기'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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
            {/* 월별 토너 재고 보고서 */}
            <MonthlyTonerReport month={month} />
        </div>
    )
}

// ── 월 상태 관련 공용 컴포넌트 ────────────────────────────────

const STATUS_META = {
    open:      { label: '출고 진행중', color: '#1d4ed8', bg: '#dbeafe', border: '#93c5fd', icon: '📋' },
    confirmed: { label: '재고 확정됨', color: '#15803d', bg: '#dcfce7', border: '#86efac', icon: '✅' },
    closed:    { label: '마감 완료',   color: '#7c3aed', bg: '#ede9fe', border: '#c4b5fd', icon: '🔒' },
}

const MonthStatusBar = ({ month }) => {
    const { data: statusData } = useQuery({
        queryKey: ['month-status', month],
        queryFn: async () => { const { data } = await axios.get(`/api/consumables/month-status?month=${encodeURIComponent(month)}`); return data },
        enabled: !!month,
    })
    const status = statusData?.status || 'open'
    const meta = STATUS_META[status] || STATUS_META.open
    if (!statusData) return null
    return (
        <div style={{ marginBottom: '0.75rem', padding: '8px 14px', borderRadius: '8px', background: meta.bg, border: `1px solid ${meta.border}`, display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.88rem' }}>
            <span>{meta.icon}</span>
            <span style={{ color: meta.color, fontWeight: 'bold' }}>{month} 상태: {meta.label}</span>
            {statusData.confirmed_at && <span style={{ color: '#64748b', marginLeft: '8px' }}>확정: {statusData.confirmed_at}</span>}
            {statusData.closed_at && <span style={{ color: '#64748b', marginLeft: '8px' }}>마감: {statusData.closed_at}</span>}
        </div>
    )
}

const MonthStatusButton = ({ month, isDev = false }) => {
    const queryClient = useQueryClient()
    const [loading, setLoading] = useState(false)
    const { data: statusData } = useQuery({
        queryKey: ['month-status', month],
        queryFn: async () => { const { data } = await axios.get(`/api/consumables/month-status?month=${encodeURIComponent(month)}`); return data },
        enabled: !!month,
    })
    const status = statusData?.status || 'open'

    const invalidate = () => {
        queryClient.invalidateQueries(['month-status', month])
        queryClient.invalidateQueries(['monthly-toner-report', month])
    }

    const handleReset = async () => {
        if (!window.confirm(`[개발 모드] '${month}' 재고 확정/마감을 초기화하시겠습니까?\n스냅샷이 삭제되고 상태가 'open'으로 돌아갑니다.`)) return
        setLoading(true)
        try {
            await axios.post('/api/consumables/month-reset', { month })
            invalidate()
            alert('초기화 완료. 상태가 open으로 리셋되었습니다.')
        } catch (e) { alert(e?.response?.data?.detail || '초기화 실패') }
        finally { setLoading(false) }
    }

    const handleConfirm = async () => {
        if (!window.confirm(`'${month}' 재고를 확정하시겠습니까?\n현재 토너 재고(또는 이전 달 잔여재고)가 이달 시작 재고로 저장됩니다.`)) return
        setLoading(true)
        try {
            await axios.post('/api/consumables/month-confirm', { month })
            invalidate()
            alert('이달 재고가 확정되었습니다.')
        } catch (e) { alert(e?.response?.data?.detail || '오류가 발생했습니다.') }
        finally { setLoading(false) }
    }

    const handleClose = async () => {
        if (!window.confirm(`'${month}'을(를) 마감하시겠습니까?\n마감 후에는 신규 출고를 추가할 수 없습니다.\n(기존 내역 수정은 가능)`)) return
        setLoading(true)
        try {
            await axios.post('/api/consumables/month-close', { month })
            invalidate()
            alert(`'${month}' 마감이 완료되었습니다.`)
        } catch (e) { alert(e?.response?.data?.detail || '오류가 발생했습니다.') }
        finally { setLoading(false) }
    }

    const handleReopen = async () => {
        if (!window.confirm(`'${month}' 마감을 해제하시겠습니까?`)) return
        setLoading(true)
        try {
            await axios.post('/api/consumables/month-reopen', { month })
            invalidate()
            alert('마감이 해제되었습니다.')
        } catch (e) { alert(e?.response?.data?.detail || '오류가 발생했습니다.') }
        finally { setLoading(false) }
    }

    // 개발 모드 초기화 버튼 (상태와 무관하게 항상 표시)
    const resetBtn = isDev && status !== 'open' ? (
        <button className="btn" onClick={handleReset} disabled={loading}
            title="개발 모드 전용: 스냅샷/마감 상태를 open으로 되돌립니다"
            style={{ background: '#f59e0b', color: '#fff', padding: '5px 12px', fontSize: '0.85em' }}>
            🔄 초기화
        </button>
    ) : null

    if (status === 'open') return (
        <>
            <button className="btn" onClick={handleConfirm} disabled={loading}
                style={{ background: '#16a34a', color: '#fff', padding: '5px 12px', fontSize: '0.85em' }}>
                {loading ? '처리중...' : '📸 이달 재고 확정'}
            </button>
            {resetBtn}
        </>
    )
    if (status === 'confirmed') return (
        <>
            <button className="btn" onClick={handleClose} disabled={loading}
                style={{ background: '#7c3aed', color: '#fff', padding: '5px 12px', fontSize: '0.85em' }}>
                {loading ? '처리중...' : '🔒 마감'}
            </button>
            {resetBtn}
        </>
    )
    if (status === 'closed') return (
        <>
            <button className="btn btn-secondary" onClick={handleReopen} disabled={loading}
                style={{ padding: '5px 12px', fontSize: '0.85em' }}>
                {loading ? '처리중...' : '🔓 마감 해제'}
            </button>
            {resetBtn}
        </>
    )
    return null
}

const MonthlyTonerReport = ({ month }) => {
    const { data: report, isLoading } = useQuery({
        queryKey: ['monthly-toner-report', month],
        queryFn: async () => { const { data } = await axios.get(`/api/consumables/monthly-report?month=${encodeURIComponent(month)}`); return data },
        enabled: !!month,
    })

    if (!report || !report.has_snapshot || isLoading) return null

    const handleExcel = async () => {
        const generalRows = (report.general_items || []).map(it => ({
            '구분': '일반 소모품', '월': month,
            '품목명': it.item_name, '시작재고': it.start_stock,
            '입고수량': it.inbound_qty || 0,
            '출고수량': it.outbound_qty, '잔여재고': it.remaining,
        }))
        const tonerRows = (report.toner_items || []).map(it => ({
            '구분': '토너', '월': month,
            '품목명': it.item_name, '시작재고': it.start_stock,
            '입고수량': it.inbound_qty || 0,
            '출고수량': it.outbound_qty, '잔여재고': it.remaining,
        }))
        const cols = [
            {key:'구분',label:'구분'},{key:'월',label:'월'},{key:'품목명',label:'품목명'},
            {key:'시작재고',label:'시작재고'},{key:'입고수량',label:'입고수량'},
            {key:'출고수량',label:'출고수량'},{key:'잔여재고',label:'잔여재고'}
        ]
        await exportToXLSX({
            filename: `재고현황_${month}_${todayStr()}`,
            sheets: [
                { title: '일반 소모품', columns: cols, rows: generalRows },
                { title: '토너', columns: cols, rows: tonerRows },
            ],
        })
    }

    const statusMeta = STATUS_META[report.status] || STATUS_META.open

    const StockTable = ({ items, emptyMsg }) => (
        <table className="data-table" style={{ fontSize: '0.9rem' }}>
            <thead>
                <tr style={{ background: '#f1f5f9' }}>
                    {['품목명', '시작 재고', '입고 수량', '출고 수량', '잔여 재고'].map(h => (
                        <th key={h} style={{ padding: '8px 12px', textAlign: h === '품목명' ? 'left' : 'center', fontWeight: '600', color: '#475569', fontSize: '0.85em', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                    ))}
                </tr>
            </thead>
            <tbody>
                {items.length === 0
                    ? <tr><td colSpan={5} style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '0.85em' }}>{emptyMsg}</td></tr>
                    : items.map((it, idx) => {
                        const isLow = it.remaining <= 0
                        const inQty = it.inbound_qty || 0
                        return (
                            <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9', background: idx % 2 === 0 ? '#fff' : '#fafafa' }}>
                                <td style={{ padding: '7px 12px', fontWeight: '500' }}>{it.item_name}</td>
                                <td style={{ padding: '7px 12px', textAlign: 'center' }}>{it.start_stock}</td>
                                <td style={{ padding: '7px 12px', textAlign: 'center', color: inQty > 0 ? '#2563eb' : '#64748b' }}>{inQty > 0 ? `+${inQty}` : '0'}</td>
                                <td style={{ padding: '7px 12px', textAlign: 'center', color: it.outbound_qty > 0 ? '#dc2626' : '#64748b' }}>{it.outbound_qty > 0 ? `-${it.outbound_qty}` : '0'}</td>
                                <td style={{ padding: '7px 12px', textAlign: 'center', fontWeight: 'bold', color: isLow ? '#dc2626' : '#15803d' }}>
                                    {it.remaining}{isLow && <span style={{ marginLeft: '4px', fontSize: '0.8em' }}>🚨</span>}
                                </td>
                            </tr>
                        )
                    })
                }
            </tbody>
        </table>
    )

    return (
        <div style={{ marginTop: '2rem', border: '1px solid #e2e8f0', borderRadius: '10px', overflow: 'hidden' }}>
            {/* 헤더 */}
            <div style={{ background: '#f8fafc', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>🗂️ {month} 재고 현황</span>
                    <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '0.8em', background: statusMeta.bg, color: statusMeta.color, border: `1px solid ${statusMeta.border}` }}>
                        {statusMeta.icon} {statusMeta.label}
                    </span>
                </div>
                <button className="btn btn-secondary" onClick={handleExcel} style={{ padding: '4px 12px', fontSize: '0.85em' }}>
                    📥 엑셀 내보내기
                </button>
            </div>

            {/* 일반 소모품 섹션 */}
            <div>
                <div style={{ padding: '8px 14px', background: '#eff6ff', borderBottom: '1px solid #bfdbfe', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: '700', color: '#1d4ed8', fontSize: '0.88rem' }}>📦 일반 소모품</span>
                    <span style={{ fontSize: '0.8em', color: '#64748b' }}>({(report.general_items || []).length}개 품목)</span>
                </div>
                <StockTable items={report.general_items || []} emptyMsg="재고 추적 중인 일반 소모품이 없습니다." />
            </div>

            {/* 토너 섹션 */}
            <div style={{ borderTop: '2px solid #e2e8f0' }}>
                <div style={{ padding: '8px 14px', background: '#fff7ed', borderBottom: '1px solid #fed7aa', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: '700', color: '#c2410c', fontSize: '0.88rem' }}>🖨️ 토너</span>
                    <span style={{ fontSize: '0.8em', color: '#64748b' }}>({(report.toner_items || []).length}개 품목)</span>
                </div>
                <StockTable items={report.toner_items || []} emptyMsg="토너 재고 데이터가 없습니다." />
            </div>
        </div>
    )
}

const isTonnerItem = (name, category) => {
    const n = (name || '').toLowerCase()
    const c = (category || '').toLowerCase()
    return n.includes('tonner') || n.includes('toner') || n.includes('토너')
        || c.includes('tonner') || c.includes('toner') || c.includes('토너')
}

const ItemsTab = () => {
    const queryClient = useQueryClient()
    const [viewMode, setViewMode] = useState('general') // 'general' | 'toner-inventory'
    const [showForm, setShowForm] = useState(false)
    const [formData, setFormData] = useState({
        row_index: null,
        category: '',
        item_name: '',
        price: '',
        purchase_url: '',
        is_tracked: false,
        current_stock: '',
        base_qty: 0,
        order_qty: 0
    })
    const [isCustomCategory, setIsCustomCategory] = useState(false) // 대분류 직접 입력 모드 여부
    const [isCustomItem, setIsCustomItem] = useState(false)         // 품목명 직접 입력 모드 여부
    const [searchTerm, setSearchTerm] = useState('')
    const [filterCategory, setFilterCategory] = useState('')
    // 개별 추가 모달
    const [indivModal, setIndivModal] = useState(null)  // null | { item_name, item }
    const today = new Date().toISOString().slice(0, 10)
    const [indivForm, setIndivForm] = useState({ date: today, quantity: '', source: '한누리', note: '' })
    // 개별 입고 인라인 수정
    const [indivEditRow, setIndivEditRow] = useState(null)  // null | { row_index, date, quantity, note, item_name }
    const [indivEditForm, setIndivEditForm] = useState({ date: '', quantity: '', source: '한누리', note: '' })

    // 제품 이미지 크롭/편집 및 뷰어 모달 상태
    const [cropModalItem, setCropModalItem] = useState(null) // null | { item_name, image }
    const [viewerModalItem, setViewerModalItem] = useState(null) // null | { item_name, image }

    // 품목 구매 가격 히스토리 & 사이트 상세 모달 상태
    const [priceHistoryModalItem, setPriceHistoryModalItem] = useState(null) // null | item_name
    // 통합 상세 수정 모달 (기본정보 + 사진 + 가격이력 + 개별추가 통합)
    const [detailModalItem, setDetailModalItem] = useState(null) // null | item

    const handleSaveItemImage = async (dataUrl) => {
        if (!cropModalItem?.item_name) return
        try {
            await axios.post('/api/consumables/images', {
                item_name: cropModalItem.item_name,
                image_data: dataUrl
            })
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
            queryClient.invalidateQueries({ queryKey: ['item-price-history', cropModalItem.item_name] })
            setFormData(prev => prev.item_name === cropModalItem.item_name ? { ...prev, image: dataUrl } : prev)
            setDetailModalItem(prev => (prev && prev.item_name === cropModalItem.item_name) ? { ...prev, image: dataUrl } : prev)
            alert('제품 이미지가 성공적으로 등록되었습니다.')
        } catch (err) {
            alert('이미지 저장 실패: ' + (err.response?.data?.detail || err.message))
        }
    }

    const handleDeleteItemImage = async () => {
        if (!cropModalItem?.item_name) return
        try {
            await axios.delete(`/api/consumables/images/${encodeURIComponent(cropModalItem.item_name)}`)
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
            queryClient.invalidateQueries({ queryKey: ['item-price-history', cropModalItem.item_name] })
            setFormData(prev => prev.item_name === cropModalItem.item_name ? { ...prev, image: '' } : prev)
            setDetailModalItem(prev => (prev && prev.item_name === cropModalItem.item_name) ? { ...prev, image: '' } : prev)
            alert('제품 이미지가 삭제되었습니다.')
        } catch (err) {
            alert('이미지 삭제 실패: ' + (err.response?.data?.detail || err.message))
        }
    }

    const itemsQueryKey = ['consumables-items', 'cumulative']
    const { data: items, isLoading } = useQuery({
        queryKey: itemsQueryKey,
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/items?dispatch_mode=cumulative')
            return data
        }
    })

    // 폼 제출용 mutation (알림 포함)
    const mutation = useMutation({
        mutationFn: async (newData) => axios.post('/api/consumables/items', newData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
            setShowForm(false)
            setFormData({ row_index: null, category: '', item_name: '', price: '', purchase_url: '', is_tracked: false, current_stock: '', base_qty: 0, order_qty: 0 })
            setIsCustomCategory(false)
            setIsCustomItem(false)
            alert("품목이 저장되었습니다.")
        },
        onError: () => alert("오류가 발생했습니다. 구글 시트를 확인하세요.")
    })

    // 인라인 셀 수정용 mutation (Optimistic Update - 즉시 UI 반영)
    const inlineMutation = useMutation({
        mutationFn: async (newData) => axios.post('/api/consumables/items', newData),
        onMutate: async (newData) => {
            await queryClient.cancelQueries({ queryKey: itemsQueryKey })
            const prev = queryClient.getQueryData(itemsQueryKey)
            queryClient.setQueryData(itemsQueryKey, (old) =>
                old?.map(it => it.row_index === newData.row_index ? { ...it, ...newData } : it)
            )
            return { prev }
        },
        onError: (err, newData, context) => {
            queryClient.setQueryData(itemsQueryKey, context.prev)
            alert("수정 중 오류가 발생했습니다.")
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
        }
    })

    // 품목 삭제 mutation
    const deleteMutation = useMutation({
        mutationFn: async ({ row_index, item_name }) =>
            axios.delete(`/api/consumables/items?row_index=${row_index}&item_name=${encodeURIComponent(item_name)}`),
        onSuccess: () => {
            queryClient.invalidateQueries(['consumables-items'])
            alert("품목이 삭제되었습니다.")
        },
        onError: () => alert("삭제 중 오류가 발생했습니다.")
    })

    const handleDelete = (item) => {
        if (!window.confirm(`"${item.item_name}" 품목을 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.`)) return
        deleteMutation.mutate({ row_index: item.row_index, item_name: item.item_name })
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!formData.category || !formData.item_name || !formData.price) {
            alert("모든 필드를 입력해주세요.")
            return
        }
        const isTonner = isTonnerItem(formData.item_name, formData.category)
        const payload = {
            ...formData,
            base_qty: isTonner ? 0 : (parseInt(String(formData.base_qty).replace(/,/g, '')) || 0),
            order_qty: parseInt(String(formData.order_qty).replace(/,/g, '')) || 0
        }
        if (!payload.image) {
            delete payload.image
        }
        // 기본 품목 저장 (E열 base_qty, F열 order_qty 포함)
        mutation.mutate(payload)
        
        // 토너 품목인 경우에만 실재고 수량 변경 시 토너 시트 업데이트
        if (isTonner && formData.row_index) {
            const newStock = formData.current_stock
            const origStock = formData._orig_stock
            if (newStock !== '' && newStock !== null && String(newStock) !== String(origStock ?? '')) {
                try {
                    await axios.patch('/api/consumables/items/stock', {
                        item_name: formData.item_name,
                        stock: parseInt(String(newStock).replace(/,/g, '')) || 0,
                    })
                    queryClient.invalidateQueries(['toner-inventory'])
                } catch (err) {
                    alert(`실재고 수정 실패: ${err?.response?.data?.detail || err.message}\n(품목 기본 정보는 저장되었습니다.)`)
                }
            }
        }
    }

    const startEdit = (item) => {
        setIsCustomCategory(false)
        setIsCustomItem(false)
        setFormData({
            row_index: item.row_index,
            category: item.category,
            item_name: item.item_name,
            price: item.price,
            purchase_url: item.purchase_url || '',
            is_tracked: item.is_tracked || false,
            current_stock: item.current_stock ?? '',   // 실재고 수량 (토너 시트)
            _orig_stock: item.current_stock ?? null,   // 변경 여부 비교용
            base_qty: item.base_qty ?? 0,
            order_qty: item.order_qty ?? 0,
            image: item.image || ''
        })
        setShowForm(true)
    }



    // 개별 입고 전체 내역 (모달에서 해당 품목 내역 표시용) — 키를 'individual-inbound-modal'로 분리해 월별 쿼리와 충돌 방지
    const { data: indivAllHistory, refetch: refetchIndivAll } = useQuery({
        queryKey: ['individual-inbound-modal'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/individual-inbound')
            return data
        },
        staleTime: 30000,
        enabled: !!indivModal,
    })

    // 현재 모달 품목의 전체 입고 내역 (날짜 내림차순)
    const indivModalHistory = useMemo(() => {
        if (!indivAllHistory || !indivModal) return []
        return indivAllHistory
            .filter(r => r.item_name?.toLowerCase() === indivModal.item_name?.toLowerCase())
            .sort((a, b) => b.date.localeCompare(a.date))
    }, [indivAllHistory, indivModal])

    // 개별 추가 뮤테이션
    const indivAddMutation = useMutation({
        mutationFn: (data) => axios.post('/api/consumables/individual-inbound', data),
        onSuccess: () => {
            queryClient.invalidateQueries(['individual-inbound'])
            queryClient.invalidateQueries(['individual-inbound-modal'])
            queryClient.invalidateQueries(['toner-inventory'])
            queryClient.invalidateQueries(['consumables-items'])
            setIndivForm({ date: today, quantity: '', source: '한누리', note: '' })
            refetchIndivAll()
            alert('개별 추가가 등록되었습니다.')
        },
        onError: (err) => alert(`개별 추가 실패: ${err?.response?.data?.detail || err.message}`),
    })

    // 개별 입고 수정 뮤테이션
    const indivUpdateMutation = useMutation({
        mutationFn: (data) => axios.put('/api/consumables/individual-inbound', data),
        onSuccess: () => {
            queryClient.invalidateQueries(['individual-inbound'])
            queryClient.invalidateQueries(['individual-inbound-modal'])
            queryClient.invalidateQueries(['toner-inventory'])
            queryClient.invalidateQueries(['consumables-items'])
            setIndivEditRow(null)
            refetchIndivAll()
            alert('수정되었습니다.')
        },
        onError: (err) => alert(`수정 실패: ${err?.response?.data?.detail || err.message}`),
    })

    // 개별 입고 삭제 뮤테이션 (모달 내 내역에서)
    const indivDeleteModalMutation = useMutation({
        mutationFn: ({ row_index, item_name, quantity }) =>
            axios.delete(`/api/consumables/individual-inbound?row_index=${row_index}&item_name=${encodeURIComponent(item_name)}&quantity=${quantity}`),
        onSuccess: () => {
            queryClient.invalidateQueries(['individual-inbound'])
            queryClient.invalidateQueries(['individual-inbound-modal'])
            queryClient.invalidateQueries(['toner-inventory'])
            queryClient.invalidateQueries(['consumables-items'])
            refetchIndivAll()
        },
        onError: (err) => alert(`삭제 실패: ${err?.response?.data?.detail || err.message}`),
    })

    // 일반 소모품만 (토너 제외)
    const allGeneral = useMemo(() => items?.filter(it => !isTonnerItem(it.item_name, it.category)) || [], [items])
    const sourceItems = allGeneral

    const categories = useMemo(() => Array.from(new Set(sourceItems.map(it => it.category).filter(Boolean))).sort(), [sourceItems])

    // 현재 선택된 대분류에 속한 품목 목록 (대분류 미선택 시 전체 일반 소모품)
    const itemsInSelectedCategory = useMemo(() => {
        if (!formData.category) return sourceItems
        return sourceItems.filter(it => it.category?.toLowerCase() === formData.category?.toLowerCase())
    }, [sourceItems, formData.category])

    const filteredItems = useMemo(() => {
        const search = (searchTerm || '').trim().toLowerCase()
        return sourceItems.filter(item => {
            const name = (item.item_name || '').toLowerCase()
            const cat = (item.category || '').toLowerCase()
            const matchSearch = !search || name.includes(search) || cat.includes(search)
            const matchCat = filterCategory ? item.category === filterCategory : true
            return matchSearch && matchCat
        })
    }, [sourceItems, searchTerm, filterCategory])

    if (isLoading) return <LoadingModal isOpen={isLoading} message="소모품 마스터 리스트를 불러오는 중입니다..." />

    return (
        <div className="card">
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0 }}>
                    소모품 마스터 리스트 (단가표)
                </h3>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <ExportButton
                        onClick={async () => {
                        const rows = (filteredItems || []).map(r => ({
                            '대분류': r.category, '품목명': r.item_name,
                            '단가(원)': r.price, '현재 수량': r.current_stock ?? 0,
                            '구매사이트': r.purchase_url || '',
                        }))
                        await exportToXLSX({ filename: `소모품마스터리스트_${todayStr()}`,
                            columns: [{key:'대분류',label:'대분류'},{key:'품목명',label:'품목명'},{key:'단가(원)',label:'단가(원)'},{key:'현재 수량',label:'현재 수량'},{key:'구매사이트',label:'구매사이트'}],
                            rows })
                    }}
                        disabled={!filteredItems || filteredItems.length === 0}
                    />
                    <button className="btn btn-primary" onClick={() => {
                        setShowForm(!showForm);
                        setFormData({ row_index: null, category: '', item_name: '', price: '', purchase_url: '', is_tracked: false, current_stock: '', base_qty: 0, order_qty: 0, image: '' });
                        setIsCustomCategory(false);
                        setIsCustomItem(false);
                    }}>
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
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', gap: '8px' }}>
                            <label style={{ fontSize: '0.9em', fontWeight: 'bold', color: '#334155' }}>대분류 (Category)</label>
                            <button
                                type="button"
                                onClick={() => {
                                    const next = !isCustomCategory
                                    setIsCustomCategory(next)
                                    if (next) {
                                        setFormData(prev => ({ ...prev, category: '' }))
                                    }
                                }}
                                style={{
                                    background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.78em',
                                    cursor: 'pointer', padding: 0, textDecoration: 'underline'
                                }}
                            >
                                {isCustomCategory ? '📋 목록 선택' : '✏️ 직접 입력'}
                            </button>
                        </div>
                        {isCustomCategory ? (
                            <input
                                type="text"
                                placeholder="새 대분류명 입력"
                                value={formData.category}
                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                style={{ padding: '8px', minWidth: '150px', borderColor: '#818cf8', backgroundColor: '#f5f3ff', borderRadius: '4px' }}
                                required
                                autoFocus
                            />
                        ) : (
                            <select
                                value={formData.category}
                                onChange={e => {
                                    const val = e.target.value
                                    if (val === '__custom__') {
                                        setIsCustomCategory(true)
                                        setFormData({ ...formData, category: '' })
                                    } else {
                                        setFormData({ ...formData, category: val })
                                    }
                                }}
                                style={{ padding: '8px', minWidth: '150px', borderRadius: '4px', borderColor: '#cbd5e1' }}
                                required
                            >
                                <option value="">-- 대분류 선택 --</option>
                                {categories.map(c => (
                                    <option key={c} value={c}>{c}</option>
                                ))}
                                <option value="__custom__">➕ 신규 대분류 직접 입력...</option>
                            </select>
                        )}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px', gap: '8px' }}>
                            <label style={{ fontSize: '0.9em', fontWeight: 'bold', color: '#334155' }}>품목명</label>
                            <button
                                type="button"
                                onClick={() => {
                                    const next = !isCustomItem
                                    setIsCustomItem(next)
                                    if (next) {
                                        setFormData(prev => ({ ...prev, row_index: null }))
                                    }
                                }}
                                style={{
                                    background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.78em',
                                    cursor: 'pointer', padding: 0, textDecoration: 'underline'
                                }}
                            >
                                {isCustomItem ? '📋 목록 선택' : '✏️ 신규 입력'}
                            </button>
                        </div>
                        {isCustomItem ? (
                            <input
                                type="text"
                                placeholder="신규 품목명 입력"
                                value={formData.item_name}
                                onChange={e => setFormData({ ...formData, item_name: e.target.value })}
                                style={{ padding: '8px', minWidth: '220px', borderColor: '#818cf8', backgroundColor: '#f5f3ff', borderRadius: '4px' }}
                                required
                                autoFocus
                            />
                        ) : (
                            <select
                                value={formData.item_name}
                                onChange={e => {
                                    const val = e.target.value
                                    if (val === '__custom__') {
                                        setIsCustomItem(true)
                                        setFormData(prev => ({ ...prev, row_index: null, item_name: '' }))
                                    } else if (val) {
                                        const selectedItem = sourceItems.find(it => it.item_name === val)
                                        if (selectedItem) {
                                            setFormData({
                                                row_index: selectedItem.row_index,
                                                category: selectedItem.category || formData.category,
                                                item_name: selectedItem.item_name,
                                                price: selectedItem.price,
                                                purchase_url: selectedItem.purchase_url || '',
                                                is_tracked: selectedItem.is_tracked || false,
                                                current_stock: selectedItem.current_stock ?? '',
                                                _orig_stock: selectedItem.current_stock ?? null,
                                                base_qty: selectedItem.base_qty ?? 0,
                                                order_qty: selectedItem.order_qty ?? 0,
                                                image: selectedItem.image || ''
                                            })
                                        }
                                    } else {
                                        setFormData(prev => ({ ...prev, row_index: null, item_name: '', purchase_url: '' }))
                                    }
                                }}
                                style={{ padding: '8px', minWidth: '220px', borderRadius: '4px', borderColor: '#cbd5e1' }}
                                required
                            >
                                <option value="">-- {formData.category ? `'${formData.category}' 품목 선택` : '기존 품목 선택'} ({itemsInSelectedCategory.length}개) --</option>
                                {itemsInSelectedCategory.map(it => (
                                    <option key={it.item_name} value={it.item_name}>
                                        {it.item_name} {it.price ? `(${Number(String(it.price).replace(/,/g, '')).toLocaleString()}원)` : ''}
                                    </option>
                                ))}
                                <option value="__custom__">➕ 신규 품목 직접 입력...</option>
                            </select>
                        )}
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>단가 (원)</label>
                        <input type="text" placeholder="18,000" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} style={{ padding: '8px', width: '100px' }} required />
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', color: '#0369a1', fontWeight: 'bold' }}>구매 사이트 (URL) 🌐</label>
                        <input
                            type="text"
                            placeholder="https://... (구매처 링크)"
                            value={formData.purchase_url}
                            onChange={e => setFormData({ ...formData, purchase_url: e.target.value })}
                            style={{ padding: '8px', width: '100%', borderColor: '#7dd3fc', borderRadius: '4px' }}
                        />
                    </div>
                    <div style={{ marginLeft: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', color: '#1976d2', fontWeight: 'bold' }}>재고 추적 🎯</label>
                        <input type="checkbox" checked={formData.is_tracked} onChange={e => setFormData({...formData, is_tracked: e.target.checked})} style={{ width: '20px', height: '20px', cursor: 'pointer' }} />
                    </div>
                    {/* 실재고 또는 구매 수량 입력 필드 */}
                    {isTonnerItem(formData.item_name, formData.category) ? (
                        // 토너 품목인 경우: 수정 시에만 실재고 수량 변경 노출 (토너 시트에 반영되므로)
                        formData.row_index && (
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', color: '#b91c1c', fontWeight: 'bold' }}>실재고 수량 📦</label>
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="현재 실재고"
                                    value={formData.current_stock}
                                    onChange={e => setFormData({...formData, current_stock: e.target.value})}
                                    style={{ padding: '8px', width: '90px', borderColor: '#fca5a5' }}
                                />
                                <div style={{ fontSize: '0.75em', color: '#94a3b8', marginTop: '3px' }}>토너 시트 반영</div>
                            </div>
                        )
                    ) : (
                        // 일반 소모품인 경우: 기준(적정) 수량(E열) 및 실제 보유 초기재고(F열) 설정 가능
                        <>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', color: '#2563eb', fontWeight: 'bold' }}>기준(적정) 수량 🎯</label>
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="적정 기준수량"
                                    value={formData.base_qty}
                                    onChange={e => setFormData({...formData, base_qty: e.target.value})}
                                    style={{ padding: '8px', width: '100px', borderColor: '#93c5fd' }}
                                />
                                <div style={{ fontSize: '0.75em', color: '#94a3b8', marginTop: '3px' }}>E열 (부족 경고 기준값)</div>
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px', color: '#16a34a', fontWeight: 'bold' }}>초기 재고 수량 📦</label>
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="초기 재고수량"
                                    value={formData.order_qty}
                                    onChange={e => setFormData({...formData, order_qty: e.target.value})}
                                    style={{ padding: '8px', width: '100px', borderColor: '#bbf7d0' }}
                                />
                                <div style={{ fontSize: '0.75em', color: '#94a3b8', marginTop: '3px' }}>F열 (실제 총재고)</div>
                            </div>
                        </>
                    )}
                    {/* 제품 이미지 등록 버튼 */}
                    <div>
                        <label style={{ display: 'block', fontSize: '0.9em', marginBottom: '5px' }}>제품 이미지 📷</label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {formData.image && (
                                <img
                                    src={formData.image}
                                    alt="미리보기"
                                    onClick={() => setViewerModalItem({ item_name: formData.item_name || '미리보기', image: formData.image })}
                                    style={{ width: '36px', height: '36px', objectFit: 'contain', borderRadius: '4px', border: '1px solid #cbd5e1', cursor: 'pointer', background: '#fff' }}
                                    title="크게 보기"
                                />
                            )}
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                    if (!formData.item_name.trim()) {
                                        alert('먼저 품목명을 입력해주세요.')
                                        return
                                    }
                                    setCropModalItem({ item_name: formData.item_name, image: formData.image || null })
                                }}
                                style={{ padding: '7px 12px', fontSize: '0.85em', display: 'flex', alignItems: 'center', gap: '4px' }}
                            >
                                📷 {formData.image ? '사진 변경' : '사진 등록/크롭'}
                            </button>
                        </div>
                    </div>
                    <button type="submit" className="btn btn-primary" disabled={mutation.isPending} style={{ marginLeft: 'auto' }}>
                        저장하기
                    </button>
                    <div style={{ fontSize: '0.82em', marginTop: '6px', width: '100%', display: 'flex', gap: '8px', alignItems: 'center' }}>
                        {formData.row_index ? (
                            <span style={{ color: '#2563eb', fontWeight: '500' }}>
                                ℹ️ 기존 등록 품목 [<strong>{formData.item_name}</strong>] 정보 수정 모드입니다. 저장 시 구글 시트에 즉시 반영됩니다.
                            </span>
                        ) : (
                            <span style={{ color: '#16a34a' }}>
                                ✨ 신규 품목 등록 모드입니다. (동일 품목명이 존재할 경우 수정되고, 새로운 품목명이면 추가됩니다.)
                            </span>
                        )}
                    </div>
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
                        <th style={{ width: '50px', textAlign: 'center' }}>이미지</th>
                        <th style={{ width: '13%' }}>대분류 (Category)</th>
                        <th>{'소모품명 (Item Name)'}</th>
                        <th style={{ textAlign: 'right', width: '11%' }}>정상 단가(₩)</th>
                        <th style={{ textAlign: 'center', width: '12%', background: '#fff1f2', color: '#9f1239' }}>현재 수량 (실재고)</th>
                        <th style={{ textAlign: 'center', width: '14%' }}>구매 사이트</th>
                        <th style={{ textAlign: 'center', width: '28%' }}>관리</th>
                    </tr>
                </thead>
                <tbody>
                    {filteredItems.length > 0 ? filteredItems.map((item, idx) => {
                        const handleInlineUpdate = (field, newVal) => {
                            inlineMutation.mutate({ ...item, [field]: newVal })
                        }
                        const currentStock = item.current_stock ?? null

                        // 실재고 수량 표시 (품목별 기초/기준재고 이하 시 부족 경고)
                        const threshold = (item.base_qty && Number(item.base_qty) > 0) ? Number(item.base_qty) : 3
                        const isLow = currentStock !== null && currentStock <= threshold
                        const isNegative = currentStock !== null && currentStock < 0
                        let currentStockCell
                        if (currentStock === null) {
                            currentStockCell = <td style={{ textAlign: 'center', color: '#aaa', fontSize: '0.85em' }}>-</td>
                        } else if (isNegative) {
                            currentStockCell = (
                                <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#b91c1c', fontSize: '1.05em' }}>
                                    🚨 {currentStock.toLocaleString()}
                                </td>
                            )
                        } else {
                            currentStockCell = (
                                <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1.05em',
                                    color: isLow ? '#d32f2f' : '#2e7d32' }}>
                                    {isLow ? `🚨 ${currentStock.toLocaleString()}` : `✅ ${currentStock.toLocaleString()}`}
                                </td>
                            )
                        }

                        const purchaseUrl = item.purchase_url ? item.purchase_url.trim() : ''
                        const formattedUrl = purchaseUrl ? (purchaseUrl.startsWith('http://') || purchaseUrl.startsWith('https://') ? purchaseUrl : `https://${purchaseUrl}`) : ''

                        return (
                            <tr key={idx}>
                                <td style={{ textAlign: 'center', padding: '6px', verticalAlign: 'middle' }}>
                                    {item.image ? (
                                        <div style={{ position: 'relative', display: 'inline-block' }}>
                                            <img
                                                src={item.image}
                                                alt={item.item_name}
                                                onClick={() => setViewerModalItem({ item_name: item.item_name, image: item.image })}
                                                style={{
                                                    width: '40px',
                                                    height: '40px',
                                                    objectFit: 'contain',
                                                    borderRadius: '6px',
                                                    border: '1px solid #cbd5e1',
                                                    cursor: 'pointer',
                                                    backgroundColor: '#ffffff',
                                                    display: 'block',
                                                    transition: 'transform 0.15s ease'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.15)'}
                                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                                                title="클릭하여 크게 보기"
                                            />
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setCropModalItem({ item_name: item.item_name, image: null })}
                                            style={{
                                                background: '#f8fafc',
                                                border: '1px dashed #cbd5e1',
                                                borderRadius: '6px',
                                                width: '40px',
                                                height: '40px',
                                                cursor: 'pointer',
                                                color: '#94a3b8',
                                                fontSize: '1rem',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                margin: '0 auto',
                                                transition: 'all 0.15s ease'
                                            }}
                                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#4f46e5'; e.currentTarget.style.color = '#4f46e5' }}
                                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.color = '#94a3b8' }}
                                            title="제품 이미지 등록 및 크롭"
                                        >
                                            📷
                                        </button>
                                    )}
                                </td>
                                <EditableCell value={item.category} onSave={(val) => handleInlineUpdate('category', val)} />
                                <EditableCell value={item.item_name} onSave={(val) => handleInlineUpdate('item_name', val)} bold={true} />
                                <EditableCell value={item.price} onSave={(val) => handleInlineUpdate('price', val)} align="right" />
                                {/* 현재 수량 (실재고) */}
                                {currentStockCell}
                                {/* 구매 사이트 */}
                                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                                    {formattedUrl ? (
                                        <a
                                            href={formattedUrl}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            onClick={e => e.stopPropagation()}
                                            style={{
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '4px',
                                                padding: '4px 8px',
                                                backgroundColor: '#f0f9ff',
                                                color: '#0284c7',
                                                border: '1px solid #bae6fd',
                                                borderRadius: '6px',
                                                fontSize: '0.82em',
                                                fontWeight: 'bold',
                                                textDecoration: 'none',
                                                transition: 'background-color 0.15s'
                                            }}
                                            onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e0f2fe'}
                                            onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f0f9ff'}
                                            title={formattedUrl}
                                        >
                                            🌐 바로가기 ↗
                                        </a>
                                    ) : (
                                        <span style={{ color: '#cbd5e1', fontSize: '0.85em' }}>-</span>
                                    )}
                                </td>
                                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                    <button
                                        className="btn btn-primary"
                                        style={{ padding: '4px 10px', fontSize: '0.82em', fontWeight: 'bold', marginRight: '6px' }}
                                        onClick={() => setDetailModalItem(item)}
                                        title="기본정보, 제품 사진, 가격 이력 및 입고 통합 관리"
                                    >
                                        ✏️ 상세 수정
                                    </button>
                                    <button
                                        className="btn btn-danger"
                                        style={{ padding: '4px 8px', fontSize: '0.8em' }}
                                        onClick={() => handleDelete(item)}
                                        disabled={deleteMutation.isPending}
                                        title="품목 삭제"
                                    >
                                        🗑️ 삭제
                                    </button>
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
            <LoadingModal isOpen={deleteMutation.isPending} message="품목을 삭제하고 있습니다..." />
            <LoadingModal isOpen={indivAddMutation.isPending} message="개별 입고를 등록하는 중입니다..." />
            <LoadingModal isOpen={indivUpdateMutation.isPending} message="개별 입고를 수정하는 중입니다..." />
            <LoadingModal isOpen={indivDeleteModalMutation.isPending} message="개별 입고를 삭제하는 중입니다..." />

            {/* 개별 추가 모달 */}
            {indivModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 }}>
                    <div className="card" style={{ width: '560px', maxHeight: '85vh', overflowY: 'auto', padding: '1.5rem' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0 }}>📦 개별 입고 관리</h3>
                            <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.85em' }} onClick={() => { setIndivModal(null); setIndivEditRow(null) }}>✕ 닫기</button>
                        </div>
                        <p style={{ margin: '0 0 1rem', fontWeight: 'bold', color: '#15803d', fontSize: '1.05em' }}>{indivModal.item_name}</p>

                        {/* 새 입고 추가 폼 */}
                        <div style={{ background: '#f0fdf4', borderRadius: '8px', padding: '1rem', marginBottom: '1.2rem', border: '1px solid #bbf7d0' }}>
                            <p style={{ margin: '0 0 10px', fontWeight: 'bold', fontSize: '0.9em', color: '#15803d' }}>➕ 새 입고 추가</p>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85em', marginBottom: '3px', fontWeight: 'bold' }}>날짜</label>
                                    <input type="date" value={indivForm.date} onChange={e => setIndivForm(f => ({ ...f, date: e.target.value }))} style={{ width: '100%', padding: '7px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9em' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85em', marginBottom: '3px', fontWeight: 'bold' }}>추가 수량</label>
                                    <input type="number" min="1" placeholder="수량" value={indivForm.quantity} onChange={e => setIndivForm(f => ({ ...f, quantity: e.target.value }))} style={{ width: '100%', padding: '7px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9em' }} />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.85em', marginBottom: '3px', fontWeight: 'bold' }}>출처</label>
                                    <select value={indivForm.source} onChange={e => setIndivForm(f => ({ ...f, source: e.target.value }))} style={{ width: '100%', padding: '7px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9em' }}>
                                        <option value="한누리">한누리</option>
                                        <option value="사용자 반납">사용자 반납</option>
                                        <option value="기타">기타</option>
                                    </select>
                                </div>
                            </div>
                            <div style={{ marginTop: '8px' }}>
                                <label style={{ display: 'block', fontSize: '0.85em', marginBottom: '3px', fontWeight: 'bold' }}>비고 (선택)</label>
                                <input type="text" placeholder="예: 비축용 개별 구매" value={indivForm.note} onChange={e => setIndivForm(f => ({ ...f, note: e.target.value }))} style={{ width: '100%', padding: '7px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9em' }} />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                                <button
                                    className="btn btn-primary"
                                    style={{ backgroundColor: '#16a34a', borderColor: '#16a34a', fontSize: '0.9em' }}
                                    disabled={indivAddMutation.isPending || !indivForm.quantity || parseInt(indivForm.quantity) <= 0}
                                    onClick={() => indivAddMutation.mutate({ item_name: indivModal.item_name, date: indivForm.date, quantity: parseInt(indivForm.quantity) || 0, source: indivForm.source, note: indivForm.note })}
                                >
                                    {indivAddMutation.isPending ? '등록 중...' : '등록'}
                                </button>
                            </div>
                            <p style={{ fontSize: '0.78em', color: '#64748b', margin: '8px 0 0' }}>💡 입고 수량이 실재고에 즉시 반영됩니다.</p>
                        </div>

                        {/* 기존 입고 내역 */}
                        <div>
                            <p style={{ margin: '0 0 8px', fontWeight: 'bold', fontSize: '0.9em', color: '#374151' }}>📋 입고 내역 (전체)</p>
                            {indivModalHistory.length === 0 ? (
                                <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: '0.88em', padding: '1rem 0' }}>등록된 개별 입고 내역이 없습니다.</p>
                            ) : (
                                <table className="data-table" style={{ fontSize: '0.88em' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc' }}>
                                            <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>날짜</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>수량</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>출처</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'left' }}>비고</th>
                                            <th style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center' }}>관리</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {indivModalHistory.map((rec) => {
                                            const isDeleted = rec.note?.includes('[삭제됨]')
                                            return (
                                            <tr key={rec.row_index} style={{ background: indivEditRow?.row_index === rec.row_index ? '#fefce8' : (isDeleted ? '#f8fafc' : 'white') }}>
                                                {indivEditRow?.row_index === rec.row_index && !isDeleted ? (
                                                    <>
                                                        <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0' }}>
                                                            <input type="date" value={indivEditForm.date} onChange={e => setIndivEditForm(f => ({ ...f, date: e.target.value }))} style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85em' }} />
                                                        </td>
                                                        <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0' }}>
                                                            <input type="number" min="1" value={indivEditForm.quantity} onChange={e => setIndivEditForm(f => ({ ...f, quantity: e.target.value }))} style={{ width: '70px', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85em', textAlign: 'center' }} />
                                                        </td>
                                                        <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                                                            <select value={indivEditForm.source} onChange={e => setIndivEditForm(f => ({ ...f, source: e.target.value }))} style={{ width: '80px', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85em' }}>
                                                                <option value="한누리">한누리</option>
                                                                <option value="사용자 반납">사용자 반납</option>
                                                                <option value="기타">기타</option>
                                                            </select>
                                                        </td>
                                                        <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0' }}>
                                                            <input type="text" value={indivEditForm.note} onChange={e => setIndivEditForm(f => ({ ...f, note: e.target.value }))} style={{ width: '100%', padding: '4px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.85em' }} />
                                                        </td>
                                                        <td style={{ padding: '4px 6px', border: '1px solid #e2e8f0', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                            <button
                                                                className="btn btn-primary"
                                                                style={{ padding: '3px 8px', fontSize: '0.78em', marginRight: '4px' }}
                                                                disabled={indivUpdateMutation.isPending}
                                                                onClick={() => indivUpdateMutation.mutate({
                                                                    row_index: rec.row_index,
                                                                    item_name: rec.item_name,
                                                                    date: indivEditForm.date,
                                                                    quantity: parseInt(indivEditForm.quantity) || rec.quantity,
                                                                    source: indivEditForm.source,
                                                                    note: indivEditForm.note,
                                                                })}
                                                            >저장</button>
                                                            <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '0.78em' }} onClick={() => setIndivEditRow(null)}>취소</button>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', textDecoration: isDeleted ? 'line-through' : 'none', color: isDeleted ? '#94a3b8' : 'inherit' }}>{rec.date}</td>
                                                        <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', fontWeight: isDeleted ? 'normal' : 'bold', color: isDeleted ? '#94a3b8' : '#15803d' }}>{isDeleted ? '0' : `+${rec.quantity}`}</td>
                                                        <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', color: '#475569', fontSize: '0.9em', textDecoration: isDeleted ? 'line-through' : 'none' }}>{rec.source || '-'}</td>
                                                        <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', color: isDeleted ? '#ef4444' : '#64748b', fontWeight: isDeleted ? 'bold' : 'normal' }}>{rec.note || '-'}</td>
                                                        <td style={{ padding: '6px 8px', border: '1px solid #e2e8f0', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                            <button
                                                                className="btn btn-secondary"
                                                                style={{ padding: '2px 7px', fontSize: '0.78em', marginRight: '4px', opacity: isDeleted ? 0.5 : 1 }}
                                                                disabled={isDeleted}
                                                                onClick={() => { setIndivEditRow(rec); setIndivEditForm({ date: rec.date, quantity: String(rec.quantity), source: rec.source || '한누리', note: rec.note || '' }) }}
                                                            >✏️ 수정</button>
                                                            <button
                                                                className="btn btn-danger"
                                                                style={{ padding: '2px 7px', fontSize: '0.78em', opacity: isDeleted ? 0.5 : 1 }}
                                                                disabled={indivDeleteModalMutation.isPending || isDeleted}
                                                                onClick={() => {
                                                                    if (window.confirm(`[${rec.date}] 수량 ${rec.quantity}개 입고 내역을 삭제하시겠습니까?\n실재고에서 ${rec.quantity}개가 차감됩니다.`)) {
                                                                        indivDeleteModalMutation.mutate({ row_index: rec.row_index, item_name: rec.item_name, quantity: rec.quantity })
                                                                    }
                                                                }}
                                                            >🗑️ 삭제</button>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}
            </>}

            {/* 제품 이미지 등록/편집 모달 (크롭/리사이즈/회전/용량최적화) */}
            <ImageCropModal
                isOpen={!!cropModalItem}
                onClose={() => setCropModalItem(null)}
                itemName={cropModalItem?.item_name || ''}
                initialImage={cropModalItem?.image || null}
                onSave={handleSaveItemImage}
                onDelete={handleDeleteItemImage}
            />

            {/* 제품 이미지 확대 뷰어 모달 */}
            <ImageViewerModal
                isOpen={!!viewerModalItem}
                onClose={() => setViewerModalItem(null)}
                itemName={viewerModalItem?.item_name || ''}
                imageUrl={viewerModalItem?.image || ''}
            />

            {/* 품목 구매 가격 히스토리 & 사이트 상세 모달 (레거시 지원) */}
            {priceHistoryModalItem && (
                <PriceHistoryModal
                    itemName={priceHistoryModalItem}
                    onClose={() => setPriceHistoryModalItem(null)}
                />
            )}

            {/* 통합 상세 수정 모달 (기본정보 + 사진관리 + 가격이력/개별추가 통합) */}
            {detailModalItem && (
                <ItemDetailModal
                    item={detailModalItem}
                    categories={categories}
                    onClose={() => setDetailModalItem(null)}
                    onUpdateItem={(updatedItem) => setDetailModalItem(prev => prev ? { ...prev, ...updatedItem } : null)}
                    onOpenCropModal={(targetItem) => setCropModalItem(targetItem)}
                    onOpenViewerModal={(targetItem) => setViewerModalItem(targetItem)}
                />
            )}
        </div>
    )
}

// ─── 통합 상세 수정 모달 (기본정보 / 사진 / 입고 및 가격 이력 통합) ───────────
const ItemDetailModal = ({ item, categories = [], onClose, onUpdateItem, onOpenCropModal, onOpenViewerModal }) => {
    const queryClient = useQueryClient()
    const today = new Date().toISOString().slice(0, 10)
    const isTonner = isTonnerItem(item.item_name, item.category)

    // ── 1. 품목 기본 정보 상태
    const [isCustomCategory, setIsCustomCategory] = useState(false)
    const [formData, setFormData] = useState({
        row_index: item.row_index,
        category: item.category || '',
        item_name: item.item_name || '',
        price: item.price ?? '',
        purchase_url: item.purchase_url || '',
        is_tracked: item.is_tracked ?? false,
        current_stock: item.current_stock ?? '',
        _orig_stock: item.current_stock ?? null,
        base_qty: item.base_qty ?? 0,
        order_qty: item.order_qty ?? 0,
        _orig_order_qty: item.order_qty ?? 0,
        image: item.image || ''
    })

    // ── 1.5 실사 재고 조정 상태
    const [showAuditBox, setShowAuditBox] = useState(false)
    const [auditStock, setAuditStock] = useState('')
    const [auditNote, setAuditNote] = useState('')

    // ── 2. 통합 입고 & 구매 등록 폼 상태
    const [showInboundForm, setShowInboundForm] = useState(true)
    const [inboundForm, setInboundForm] = useState({
        date: today,
        quantity: '1',
        unit_price: item.price ? String(item.price).replace(/,/g, '') : '',
        vendor: '한누리',
        purchase_url: item.purchase_url || '',
        staff: '',
        note: '',
        update_stock: true,
        update_master: true,
    })

    // ── 3. 통합 구매 & 입고 데이터 쿼리
    const { data: priceData, isLoading, refetch } = useQuery({
        queryKey: ['item-price-history', item.item_name],
        queryFn: async () => {
            const { data } = await axios.get(`/api/consumables/items/${encodeURIComponent(item.item_name)}/purchase-history`)
            return data
        },
        enabled: !!item.item_name
    })

    // 최신 마스터 정보 및 통계
    const master = priceData?.master_info || item
    const stats = priceData?.stats || {}
    const history = priceData?.history || []

    // 실시간 이미지 (마스터 및 상위 전달값 연동)
    const currentImage = formData.image || item.image || master?.image || ''

    // 상위에서 사진 등록 시(item.image 갱신) 또는 마스터 로드 시 formData.image 동기화
    useEffect(() => {
        const latestImg = item?.image || master?.image || ''
        if (latestImg && latestImg !== formData.image) {
            setFormData(prev => ({ ...prev, image: latestImg }))
        }
    }, [item?.image, master?.image])

    // ── 4. 기본 정보 저장 뮤테이션
    const updateMasterMutation = useMutation({
        mutationFn: async (payload) => {
            const res = await axios.post('/api/consumables/items', payload)
            // 토너 실재고 변경이 있는 경우
            if (isTonner && payload.row_index) {
                const newStock = payload.current_stock
                const origStock = payload._orig_stock
                if (newStock !== '' && newStock !== null && String(newStock) !== String(origStock ?? '')) {
                    await axios.patch('/api/consumables/items/stock', {
                        item_name: payload.item_name,
                        stock: parseInt(String(newStock).replace(/,/g, '')) || 0,
                    })
                }
            }
            return res.data
        },
        onSuccess: (_data, variables) => {
            // 즉시 로컬 캐시(consumables-items)에 수정값 반영하여 Rate Limit 시에도 목록이 절대 비지 않고 즉시 갱신되도록 보장
            queryClient.setQueryData(['consumables-items', 'cumulative'], (old) => {
                if (!Array.isArray(old)) return old
                return old.map(it => {
                    if (it.row_index === variables.row_index || it.item_name === variables.item_name) {
                        const updatedTotal = variables.order_qty ?? it.order_qty ?? 0
                        const dispatched = it.dispatched_qty ?? 0
                        const rented = it.rented_qty ?? 0
                        const newCurrent = isTonner
                            ? (variables.current_stock !== '' && variables.current_stock !== undefined ? Number(variables.current_stock) : it.current_stock)
                            : (updatedTotal - dispatched - rented)
                        return {
                            ...it,
                            ...variables,
                            total_stock: updatedTotal,
                            current_stock: newCurrent,
                            image: variables.image || it.image || ''
                        }
                    }
                    return it
                })
            })
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
            queryClient.invalidateQueries({ queryKey: ['item-price-history', item.item_name] })
            if (isTonner) {
                queryClient.invalidateQueries({ queryKey: ['toner-inventory'] })
            }
            refetch()
            setFormData(prev => ({
                ...prev,
                ...variables,
                _orig_order_qty: variables.order_qty ?? prev.order_qty,
                _orig_stock: variables.current_stock ?? prev.current_stock
            }))
            if (onUpdateItem) onUpdateItem(variables)
            alert('기본 정보 및 재고 수량이 성공적으로 저장되었습니다.')
        },
        onError: (err) => {
            alert('기본 정보 저장 실패: ' + (err.response?.data?.detail || err.message))
        }
    })

    // ── 5. 이미지 삭제 뮤테이션
    const deleteImageMutation = useMutation({
        mutationFn: async () => {
            return axios.delete(`/api/consumables/images/${encodeURIComponent(item.item_name)}`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
            queryClient.invalidateQueries({ queryKey: ['item-price-history', item.item_name] })
            setFormData(prev => ({ ...prev, image: '' }))
            refetch()
            alert('제품 사진이 삭제되었습니다.')
        },
        onError: (err) => {
            alert('사진 삭제 실패: ' + (err.response?.data?.detail || err.message))
        }
    })

    // ── 6. 통합 입고 / 구매 등록 뮤테이션
    const addInboundMutation = useMutation({
        mutationFn: async (payload) => {
            return axios.post('/api/consumables/purchase-history', {
                ...payload,
                item_name: item.item_name,
                quantity: Number(payload.quantity) || 1
            })
        },
        onSuccess: (_data, variables) => {
            const addedQty = Number(variables?.quantity) || 1
            // 방금 입고된 수량을 formData에도 즉시 가산하여, 직후 기본정보 저장 시 입고분이 오래된 값으로 덮어써져 증발하는 현상 원천 차단
            setFormData(prev => ({
                ...prev,
                order_qty: (Number(prev.order_qty) || 0) + addedQty,
                _orig_order_qty: (Number(prev._orig_order_qty || prev.order_qty) || 0) + addedQty,
                current_stock: prev.current_stock !== '' ? (Number(prev.current_stock) || 0) + addedQty : prev.current_stock,
                _orig_stock: prev._orig_stock !== null ? (Number(prev._orig_stock) || 0) + addedQty : prev._orig_stock
            }))
            queryClient.invalidateQueries({ queryKey: ['item-price-history', item.item_name] })
            queryClient.invalidateQueries({ queryKey: ['purchase-history'] })
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
            queryClient.invalidateQueries({ queryKey: ['toner-inventory'] })
            queryClient.invalidateQueries({ queryKey: ['individual-inbound'] })
            setInboundForm({
                date: today,
                quantity: '1',
                unit_price: '',
                vendor: '한누리',
                purchase_url: formData.purchase_url || '',
                staff: '',
                note: '',
                update_stock: true,
                update_master: true,
            })
            refetch()
            alert(`입고 및 구매 내역이 성공적으로 등록되었습니다. (+${addedQty}개 실재고 자동 가산)`)
        },
        onError: (err) => {
            alert('입고 등록 실패: ' + (err.response?.data?.detail || err.message))
        }
    })

    // ── 7. 입고 / 구매 내역 삭제 뮤테이션
    const deleteInboundMutation = useMutation({
        mutationFn: async ({ row_index, source_type, quantity }) => {
            return axios.delete(`/api/consumables/purchase-history/${row_index}`, {
                params: {
                    item_name: item.item_name,
                    quantity: quantity || 0,
                    restore_stock: true,
                    source_type: source_type || 'purchase'
                }
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['item-price-history', item.item_name] })
            queryClient.invalidateQueries({ queryKey: ['purchase-history'] })
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
            queryClient.invalidateQueries({ queryKey: ['toner-inventory'] })
            queryClient.invalidateQueries({ queryKey: ['individual-inbound'] })
            refetch()
            alert('내역이 삭제되었습니다. (실재고 복원 완료)')
        },
        onError: (err) => {
            alert('삭제 실패: ' + (err.response?.data?.detail || err.message))
        }
    })

    // ── 7.5 실사 재고 정밀 조정 뮤테이션
    const auditAdjustMutation = useMutation({
        mutationFn: async ({ actual_stock, note }) => {
            const res = await axios.post('/api/consumables/audit-adjust', {
                item_name: item.item_name,
                actual_stock: parseInt(String(actual_stock).replace(/,/g, ''), 10),
                note: note || '현장 실사 조정'
            })
            return res.data
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
            queryClient.invalidateQueries({ queryKey: ['item-price-history', item.item_name] })
            queryClient.invalidateQueries({ queryKey: ['toner-inventory'] })
            queryClient.invalidateQueries({ queryKey: ['individual-inbound'] })
            refetch()
            setFormData(prev => ({
                ...prev,
                current_stock: data.actual_stock,
                _orig_stock: data.actual_stock,
                order_qty: data.new_order_qty !== undefined ? data.new_order_qty : prev.order_qty,
                _orig_order_qty: data.new_order_qty !== undefined ? data.new_order_qty : prev._orig_order_qty
            }))
            setShowAuditBox(false)
            setAuditStock('')
            setAuditNote('')
            alert(`✅ ${data.message || '실사 재고가 성공적으로 조정되었습니다.'}`)
        },
        onError: (err) => {
            alert('실사 재고 조정 실패: ' + (err.response?.data?.detail || err.message))
        }
    })

    const handleMasterSubmit = (e) => {
        e.preventDefault()
        if (!formData.category || !formData.item_name) {
            alert('대분류와 품목명은 필수 입력 항목입니다.')
            return
        }
        const payload = {
            ...formData,
            price: formData.price ? parseInt(String(formData.price).replace(/,/g, '')) || 0 : '',
            base_qty: isTonner ? 0 : (parseInt(String(formData.base_qty).replace(/,/g, '')) || 0),
            order_qty: parseInt(String(formData.order_qty).replace(/,/g, '')) || 0,
            image: currentImage || ''
        }
        if (!payload.image) {
            delete payload.image
        }
        updateMasterMutation.mutate(payload)
    }

    const handleInboundSubmit = (e) => {
        e.preventDefault()
        if (!inboundForm.date || !inboundForm.quantity) {
            alert('입고 일자와 수량은 필수입니다.')
            return
        }
        addInboundMutation.mutate(inboundForm)
    }

    const formatPrice = (val) => {
        if (val === null || val === undefined || val === '') return '-'
        const num = Number(String(val).replace(/,/g, ''))
        return isNaN(num) ? String(val) : num.toLocaleString() + '원'
    }

    const currentUrl = (formData.purchase_url || master?.purchase_url || stats.latest_purchase_url || '').trim()
    const formattedUrl = currentUrl ? (currentUrl.startsWith('http://') || currentUrl.startsWith('https://') ? currentUrl : `https://${currentUrl}`) : ''

    return (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, padding: '16px' }}>
            <div className="card" style={{ width: '960px', maxWidth: '96vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', padding: 0 }}>
                {/* 헤더 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', color: '#fff' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '1.35rem' }}>✏️</span>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, color: '#fff', fontSize: '1.2rem', fontWeight: 'bold' }}>{item.item_name}</h3>
                                {formData.category && (
                                    <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', backgroundColor: '#475569', color: '#f1f5f9' }}>
                                        {formData.category}
                                    </span>
                                )}
                                {formData.is_tracked && (
                                    <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', backgroundColor: '#0284c7', color: '#fff' }}>
                                        재고추적
                                    </span>
                                )}
                            </div>
                            <p style={{ margin: '2px 0 0', fontSize: '0.8rem', color: '#94a3b8' }}>
                                소모품 마스터 상세 정보 수정 / 제품 사진 관리 / 통합 입고 및 구매 가격 이력 관리
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer', lineHeight: '1', padding: '4px 8px' }}
                        title="닫기"
                    >
                        ✕
                    </button>
                </div>

                {/* 모달 본문 (스크롤) */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* ══════════════════════════════════════════════════════
                        섹션 1: 품목 기본 정보 & 제품 사진 관리
                    ══════════════════════════════════════════════════════ */}
                    <div style={{ background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0', padding: '16px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid #e2e8f0', paddingBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '1.1rem' }}>⚙️</span>
                                <span style={{ fontWeight: 'bold', fontSize: '0.98rem', color: '#1e293b' }}>품목 마스터 기본 정보 & 제품 사진</span>
                            </div>
                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>품목 정보 및 기준 단가를 수정할 수 있습니다.</span>
                        </div>

                        <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
                            {/* 좌측: 제품 사진 관리 */}
                            <div style={{ width: '160px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                                <div
                                    onClick={() => currentImage && onOpenViewerModal({ item_name: item.item_name, image: currentImage })}
                                    style={{
                                        width: '140px',
                                        height: '140px',
                                        border: '1px solid #cbd5e1',
                                        borderRadius: '8px',
                                        backgroundColor: '#fff',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                        alignItems: 'center',
                                        overflow: 'hidden',
                                        cursor: currentImage ? 'zoom-in' : 'default',
                                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.05)',
                                        position: 'relative'
                                    }}
                                    title={currentImage ? '클릭 시 원본 크기로 확대 보기' : '등록된 사진 없음'}
                                >
                                    {currentImage ? (
                                        <>
                                            <img
                                                src={currentImage}
                                                alt={item.item_name}
                                                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                            />
                                            <div style={{ position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.6)', color: '#fff', borderRadius: '4px', fontSize: '0.7em', padding: '1px 4px' }}>
                                                🔍
                                            </div>
                                        </>
                                    ) : (
                                        <div style={{ textAlign: 'center', color: '#94a3b8', padding: '10px' }}>
                                            <div style={{ fontSize: '2rem', marginBottom: '4px' }}>📦</div>
                                            <span style={{ fontSize: '0.75rem' }}>사진 없음</span>
                                        </div>
                                    )}
                                </div>
                                <div style={{ display: 'flex', gap: '4px', width: '140px' }}>
                                    <button
                                        type="button"
                                        className="btn btn-secondary"
                                        style={{ flex: 1, padding: '5px 4px', fontSize: '0.78em', backgroundColor: '#eef2ff', color: '#4338ca', borderColor: '#c7d2fe', fontWeight: 'bold' }}
                                        onClick={() => onOpenCropModal({ item_name: item.item_name, image: currentImage || null })}
                                        title="사진 크롭/리사이즈 편집 및 등록"
                                    >
                                        📷 {currentImage ? '사진 변경' : '사진 등록'}
                                    </button>
                                    {currentImage && (
                                        <button
                                            type="button"
                                            className="btn btn-danger"
                                            style={{ padding: '5px 8px', fontSize: '0.78em' }}
                                            onClick={() => {
                                                if (window.confirm(`"${item.item_name}" 품목의 제품 사진을 삭제하시겠습니까?`)) {
                                                    deleteImageMutation.mutate()
                                                }
                                            }}
                                            disabled={deleteImageMutation.isPending}
                                            title="사진 삭제"
                                        >
                                            🗑️
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* 우측: 기본 정보 폼 */}
                            <form onSubmit={handleMasterSubmit} style={{ flex: 1, minWidth: '320px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                                    <div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                            <label style={{ fontSize: '0.82em', fontWeight: 'bold', color: '#334155' }}>대분류 (Category) *</label>
                                            <button
                                                type="button"
                                                onClick={() => setIsCustomCategory(v => !v)}
                                                style={{ border: 'none', background: 'none', color: '#2563eb', fontSize: '0.75em', cursor: 'pointer', padding: 0 }}
                                            >
                                                {isCustomCategory ? '목록 선택' : '직접 입력'}
                                            </button>
                                        </div>
                                        {isCustomCategory ? (
                                            <input
                                                type="text"
                                                placeholder="대분류 직접 입력"
                                                value={formData.category}
                                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                                style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88em', boxSizing: 'border-box' }}
                                                required
                                            />
                                        ) : (
                                            <select
                                                value={formData.category}
                                                onChange={e => setFormData({ ...formData, category: e.target.value })}
                                                style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88em', boxSizing: 'border-box' }}
                                                required
                                            >
                                                <option value="">대분류 선택</option>
                                                {categories.map(c => <option key={c} value={c}>{c}</option>)}
                                            </select>
                                        )}
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.82em', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>품목명 *</label>
                                        <input
                                            type="text"
                                            value={formData.item_name}
                                            onChange={e => setFormData({ ...formData, item_name: e.target.value })}
                                            style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88em', boxSizing: 'border-box', backgroundColor: '#f1f5f9' }}
                                            required
                                        />
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '10px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.82em', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>마스터 기준 단가(원)</label>
                                        <input
                                            type="text"
                                            placeholder="예: 25,000"
                                            value={formData.price}
                                            onChange={e => setFormData({ ...formData, price: e.target.value })}
                                            style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88em', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.82em', fontWeight: 'bold', color: '#334155', marginBottom: '4px' }}>구매 사이트 (URL)</label>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <input
                                                type="text"
                                                placeholder="https://... (공식/온라인 구매처 링크)"
                                                value={formData.purchase_url}
                                                onChange={e => setFormData({ ...formData, purchase_url: e.target.value })}
                                                style={{ flex: 1, padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88em', boxSizing: 'border-box' }}
                                            />
                                            {formattedUrl && (
                                                <a
                                                    href={formattedUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        padding: '6px 10px',
                                                        backgroundColor: '#0284c7',
                                                        color: '#fff',
                                                        borderRadius: '6px',
                                                        fontSize: '0.8em',
                                                        fontWeight: 'bold',
                                                        textDecoration: 'none',
                                                        whiteSpace: 'nowrap'
                                                    }}
                                                    title="새 창으로 사이트 방문하기"
                                                >
                                                    바로가기 ↗
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* 재고 수량 직접 수정 및 추적 설정 그리드 */}
                                <div style={{ background: '#fff', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px dashed #e2e8f0', paddingBottom: '6px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85em', color: '#1e293b', cursor: 'pointer', fontWeight: 'bold' }}>
                                            <input
                                                type="checkbox"
                                                checked={formData.is_tracked}
                                                onChange={e => setFormData({ ...formData, is_tracked: e.target.checked })}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            재고 추적 관리 대상 품목 (is_tracked)
                                        </label>
                                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                            💡 E열은 부족 경고 기준수량(미포함)이며, F열이 실제 보유 총 재고 수량입니다.
                                        </span>
                                    </div>

                                    {/* 재고 수량 직접 입력/수정 필드 */}
                                    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                                        {!isTonner ? (
                                            <>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <label style={{ fontSize: '0.82em', fontWeight: 'bold', color: '#1d4ed8' }}>기준(적정) 수량 (E열):</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        value={formData.base_qty}
                                                        onChange={e => setFormData({ ...formData, base_qty: e.target.value })}
                                                        style={{ width: '80px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #93c5fd', fontSize: '0.88em', textAlign: 'center', fontWeight: 'bold', backgroundColor: '#eff6ff' }}
                                                        title="재고 부족 여부를 판정하는 기준(적정) 수량 (재고 계산에 포함되지 않음)"
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <label style={{ fontSize: '0.82em', fontWeight: 'bold', color: '#15803d' }}>재고 수량 (F열):</label>
                                                    <input
                                                        type="number"
                                                        value={formData.order_qty}
                                                        onChange={e => setFormData({ ...formData, order_qty: e.target.value })}
                                                        style={{ width: '80px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.88em', textAlign: 'center', fontWeight: 'bold', backgroundColor: '#f0fdf4' }}
                                                        title="실제 보유 총 재고 수량 (구매/입고 시 자동 가산되며 수기 수정 가능)"
                                                    />
                                                </div>
                                                <div style={{ fontSize: '0.82em', color: '#475569', background: '#f8fafc', padding: '4px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                                    총 보유 재고: <b style={{ color: '#0f172a' }}>{(parseInt(formData.order_qty) || 0)}개</b>
                                                </div>
                                                <div style={{ fontSize: '0.82em', color: '#15803d', background: '#f0fdf4', padding: '4px 10px', borderRadius: '6px', border: '1px solid #bbf7d0' }}>
                                                    현재 실재고: <b style={{ color: '#166534' }}>{(formData.current_stock ?? 0)}개</b>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAuditBox(v => !v)}
                                                    style={{ padding: '4px 10px', fontSize: '0.78rem', borderRadius: '6px', border: '1px solid #6366f1', backgroundColor: showAuditBox ? '#e0e7ff' : '#f5f3ff', color: '#4338ca', fontWeight: 'bold', cursor: 'pointer' }}
                                                >
                                                    🎯 현장 실사 수량 맞추기
                                                </button>
                                            </>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <label style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#b91c1c' }}>토너 실재고 수량:</label>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    value={formData.current_stock}
                                                    onChange={e => setFormData({ ...formData, current_stock: e.target.value })}
                                                    style={{ width: '90px', padding: '5px 8px', borderRadius: '6px', border: '1px solid #fca5a5', fontSize: '0.88em', textAlign: 'center', fontWeight: 'bold', backgroundColor: '#fef2f2' }}
                                                    title="복합기 토너 재고 DB에 직접 반영되는 실시간 실재고"
                                                />
                                                <span style={{ fontSize: '0.75rem', color: '#991b1b' }}>개 (토너 DB 직접 반영)</span>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAuditBox(v => !v)}
                                                    style={{ padding: '4px 10px', fontSize: '0.78rem', borderRadius: '6px', border: '1px solid #6366f1', backgroundColor: showAuditBox ? '#e0e7ff' : '#f5f3ff', color: '#4338ca', fontWeight: 'bold', cursor: 'pointer', marginLeft: '6px' }}
                                                >
                                                    🎯 실사 수량 맞추기
                                                </button>
                                            </div>
                                        )}

                                        <div style={{ marginLeft: 'auto' }}>
                                            <button
                                                type="submit"
                                                className="btn btn-primary"
                                                style={{ padding: '6px 16px', fontSize: '0.85em', fontWeight: 'bold' }}
                                                disabled={updateMasterMutation.isPending}
                                            >
                                                {updateMasterMutation.isPending ? '저장 중...' : '💾 기본정보 & 재고수량 저장'}
                                            </button>
                                        </div>
                                    </div>

                                    {/* 🎯 현장 실사(수량 맞추기) 서브 패널 */}
                                    {showAuditBox && (
                                        <div style={{ background: '#f8fafc', border: '1px dashed #6366f1', borderRadius: '8px', padding: '12px 14px', marginTop: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                                <span style={{ fontSize: '0.85em', fontWeight: 'bold', color: '#3730a3' }}>
                                                    🎯 현장 실사(Audit) 재고 직접 맞추기
                                                </span>
                                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                                    현재 실재고({formData.current_stock ?? 0}개)와의 차액을 자동 계산하여 정확히 맞춥니다.
                                                </span>
                                            </div>
                                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <label style={{ fontSize: '0.8em', fontWeight: 'bold', color: '#1e293b' }}>실사 확인 수량:</label>
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        placeholder="실제 센 개수"
                                                        value={auditStock}
                                                        onChange={e => setAuditStock(e.target.value)}
                                                        style={{ width: '90px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #6366f1', fontSize: '0.85em', textAlign: 'center', fontWeight: 'bold', backgroundColor: '#fff' }}
                                                    />
                                                    <span style={{ fontSize: '0.8em', color: '#475569' }}>개</span>
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, minWidth: '160px' }}>
                                                    <input
                                                        type="text"
                                                        placeholder="실사 사유 (예: 10월 정기 실사 분실/차액 조정)"
                                                        value={auditNote}
                                                        onChange={e => setAuditNote(e.target.value)}
                                                        style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: '1px solid #cbd5e1', fontSize: '0.82em', backgroundColor: '#fff' }}
                                                    />
                                                </div>
                                                <button
                                                    type="button"
                                                    disabled={auditStock === '' || auditAdjustMutation.isPending}
                                                    onClick={() => {
                                                        if (auditStock === '') return
                                                        const stockVal = parseInt(auditStock, 10)
                                                        if (isNaN(stockVal) || stockVal < 0) {
                                                            alert('올바른 0 이상의 수량을 입력해주세요.')
                                                            return
                                                        }
                                                        if (!window.confirm(`품목 '${item.item_name}'의 실재고를 ${stockVal}개로 조정하시겠습니까?\n차액은 조정 이력으로 안전하게 기록됩니다.`)) return
                                                        auditAdjustMutation.mutate({ actual_stock: stockVal, note: auditNote })
                                                    }}
                                                    style={{ padding: '5px 14px', borderRadius: '6px', border: 'none', backgroundColor: '#4f46e5', color: '#fff', fontSize: '0.82em', fontWeight: 'bold', cursor: 'pointer' }}
                                                >
                                                    {auditAdjustMutation.isPending ? '조정 중...' : '확인 및 실사재고 반영'}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowAuditBox(false)}
                                                    style={{ padding: '5px 10px', borderRadius: '6px', border: '1px solid #cbd5e1', backgroundColor: '#fff', color: '#64748b', fontSize: '0.82em', cursor: 'pointer' }}
                                                >
                                                    취소
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </form>
                        </div>
                    </div>

                    {/* ══════════════════════════════════════════════════════
                        섹션 2: 📦 통합 입고 / 구매 내역 & 가격 히스토리 (통합)
                    ══════════════════════════════════════════════════════ */}
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <span style={{ fontSize: '1.2rem' }}>📦</span>
                                    <h4 style={{ margin: 0, fontSize: '1.05rem', color: '#0f172a' }}>통합 입고 및 실제 구매 가격 히스토리</h4>
                                </div>
                                <p style={{ margin: '3px 0 0', fontSize: '0.78rem', color: '#64748b' }}>
                                    가격 이력과 개별 추가가 통합되어, 입고 시 실재고와 단가 내역이 함께 안전하게 연동됩니다.
                                </p>
                            </div>
                            <button
                                type="button"
                                className="btn btn-primary"
                                style={{ padding: '5px 12px', fontSize: '0.82em', backgroundColor: showInboundForm ? '#64748b' : '#16a34a', borderColor: 'transparent' }}
                                onClick={() => setShowInboundForm(v => !v)}
                            >
                                {showInboundForm ? '폼 접기 ▲' : '➕ 새 입고/구매 등록 ▼'}
                            </button>
                        </div>

                        {/* 통계 요약 카드 4단 */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '10px', marginBottom: '14px' }}>
                            <div style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', marginBottom: '2px' }}>마스터 기준 단가</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#0f172a' }}>{formatPrice(master?.price || formData.price)}</div>
                            </div>
                            <div style={{ padding: '12px 14px', background: '#eff6ff', borderRadius: '8px', border: '1px solid #bfdbfe' }}>
                                <div style={{ fontSize: '0.75rem', color: '#1d4ed8', fontWeight: '600', marginBottom: '2px' }}>최근 구매 단가</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#1e40af' }}>{formatPrice(stats.latest_price)}</div>
                            </div>
                            <div style={{ padding: '12px 14px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                <div style={{ fontSize: '0.75rem', color: '#15803d', fontWeight: '600', marginBottom: '2px' }}>최저 / 최고 단가</div>
                                <div style={{ fontSize: '0.98rem', fontWeight: 'bold', color: '#166534', marginTop: '2px' }}>
                                    {stats.min_price != null ? `${Number(stats.min_price).toLocaleString()}원 ~ ${Number(stats.max_price).toLocaleString()}원` : '-'}
                                </div>
                            </div>
                            <div style={{ padding: '12px 14px', background: '#fefce8', borderRadius: '8px', border: '1px solid #fef08a' }}>
                                <div style={{ fontSize: '0.75rem', color: '#854d0e', fontWeight: '600', marginBottom: '2px' }}>누적 입고/구매 수량</div>
                                <div style={{ fontSize: '1.15rem', fontWeight: 'bold', color: '#713f12' }}>
                                    {(stats.total_quantity || 0).toLocaleString()}개 <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: '#a16207' }}>(총 {stats.count || 0}건)</span>
                                </div>
                            </div>
                        </div>

                        {/* 새 입고 / 구매 등록 폼 */}
                        {showInboundForm && (
                            <form onSubmit={handleInboundSubmit} style={{ padding: '14px 16px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0', marginBottom: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '1rem' }}>⚡</span>
                                        <h5 style={{ margin: 0, fontSize: '0.92rem', color: '#166534', fontWeight: 'bold' }}>새 입고 및 구매 내역 등록</h5>
                                    </div>
                                    <span style={{ fontSize: '0.78rem', color: '#15803d' }}>입고 시 실재고와 가격 히스토리가 자동으로 동기화됩니다.</span>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.78em', fontWeight: 'bold', color: '#166534', marginBottom: '3px' }}>입고 일자 *</label>
                                        <input
                                            type="date"
                                            value={inboundForm.date}
                                            onChange={e => setInboundForm({ ...inboundForm, date: e.target.value })}
                                            style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.88em', boxSizing: 'border-box' }}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.78em', fontWeight: 'bold', color: '#166534', marginBottom: '3px' }}>입고 수량 *</label>
                                        <input
                                            type="number"
                                            min="1"
                                            placeholder="수량"
                                            value={inboundForm.quantity}
                                            onChange={e => setInboundForm({ ...inboundForm, quantity: e.target.value })}
                                            style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.88em', boxSizing: 'border-box' }}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.78em', fontWeight: 'bold', color: '#166534', marginBottom: '3px' }}>실제 구매 단가(원)</label>
                                        <input
                                            type="text"
                                            placeholder="예: 25,000 (선택)"
                                            value={inboundForm.unit_price}
                                            onChange={e => setInboundForm({ ...inboundForm, unit_price: e.target.value })}
                                            style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.88em', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.78em', fontWeight: 'bold', color: '#166534', marginBottom: '3px' }}>구매처 / 출처</label>
                                        <input
                                            type="text"
                                            list="vendor-suggestions"
                                            placeholder="한누리, 쿠팡, 반납 등"
                                            value={inboundForm.vendor}
                                            onChange={e => setInboundForm({ ...inboundForm, vendor: e.target.value })}
                                            style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.88em', boxSizing: 'border-box' }}
                                        />
                                        <datalist id="vendor-suggestions">
                                            <option value="한누리" />
                                            <option value="쿠팡" />
                                            <option value="네이버스토어" />
                                            <option value="사용자 반납" />
                                            <option value="기타 거래처" />
                                        </datalist>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '8px', marginTop: '8px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.78em', fontWeight: 'bold', color: '#166534', marginBottom: '3px' }}>구매 사이트 (URL)</label>
                                        <input
                                            type="text"
                                            placeholder="https://... (상품 상세 링크)"
                                            value={inboundForm.purchase_url}
                                            onChange={e => setInboundForm({ ...inboundForm, purchase_url: e.target.value })}
                                            style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.88em', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.78em', fontWeight: 'bold', color: '#166534', marginBottom: '3px' }}>담당자</label>
                                        <input
                                            type="text"
                                            placeholder="담당자 이름"
                                            value={inboundForm.staff}
                                            onChange={e => setInboundForm({ ...inboundForm, staff: e.target.value })}
                                            style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.88em', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>

                                <div style={{ marginTop: '8px' }}>
                                    <label style={{ display: 'block', fontSize: '0.78em', fontWeight: 'bold', color: '#166534', marginBottom: '3px' }}>비고 (메모)</label>
                                    <input
                                        type="text"
                                        placeholder="비축용 입고, 특이사항, 할인 등 메모"
                                        value={inboundForm.note}
                                        onChange={e => setInboundForm({ ...inboundForm, note: e.target.value })}
                                        style={{ width: '100%', padding: '6px', borderRadius: '6px', border: '1px solid #86efac', fontSize: '0.88em', boxSizing: 'border-box' }}
                                    />
                                </div>

                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap', gap: '8px' }}>
                                    <div style={{ display: 'flex', gap: '14px', flexWrap: 'wrap' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82em', color: '#15803d', cursor: 'pointer', fontWeight: '600' }}>
                                            <input
                                                type="checkbox"
                                                checked={inboundForm.update_stock}
                                                onChange={e => setInboundForm({ ...inboundForm, update_stock: e.target.checked })}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            💡 실재고(추가 수량)에 즉시 반영 (+{inboundForm.quantity || 0}개)
                                        </label>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '0.82em', color: '#1e40af', cursor: 'pointer', fontWeight: '500' }}>
                                            <input
                                                type="checkbox"
                                                checked={inboundForm.update_master}
                                                onChange={e => setInboundForm({ ...inboundForm, update_master: e.target.checked })}
                                                style={{ cursor: 'pointer' }}
                                            />
                                            마스터 리스트 기준 단가 / 사이트도 함께 갱신
                                        </label>
                                    </div>
                                    <button
                                        type="submit"
                                        className="btn btn-primary"
                                        style={{ backgroundColor: '#16a34a', borderColor: '#16a34a', fontSize: '0.85em', padding: '6px 14px' }}
                                        disabled={addInboundMutation.isPending}
                                    >
                                        {addInboundMutation.isPending ? '등록 중...' : '📥 입고/구매 등록'}
                                    </button>
                                </div>
                            </form>
                        )}

                        {/* 통합 구매 및 입고 내역 테이블 */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                <h5 style={{ margin: 0, fontSize: '0.9rem', color: '#334155' }}>📋 과거 입고 및 구매 내역</h5>
                                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>최신순 정렬 (총 {history.length}건)</span>
                            </div>

                            {isLoading ? (
                                <div style={{ padding: '2rem', textAlign: 'center', color: '#64748b' }}>
                                    데이터를 불러오는 중입니다...
                                </div>
                            ) : history.length === 0 ? (
                                <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#94a3b8' }}>
                                    등록된 입고 및 구매 내역이 없습니다.<br />
                                    <span style={{ fontSize: '0.85em' }}>위의 '새 입고 및 구매 내역 등록' 폼에서 첫 입고 기록을 작성해보세요.</span>
                                </div>
                            ) : (
                                <div className="table-wrapper" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                                    <table className="data-table" style={{ fontSize: '0.85em' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: '13%' }}>일자</th>
                                                <th style={{ width: '15%' }}>구분 / 출처</th>
                                                <th style={{ width: '11%', textAlign: 'center' }}>수량</th>
                                                <th style={{ width: '15%', textAlign: 'right' }}>실제 단가</th>
                                                <th style={{ width: '13%', textAlign: 'center' }}>구매 사이트</th>
                                                <th style={{ width: '11%' }}>담당자</th>
                                                <th>비고</th>
                                                <th style={{ width: '50px', textAlign: 'center' }}>삭제</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((row, idx) => {
                                                const isIndividual = row.source_type === 'individual'
                                                const isDeleted = row.is_deleted || (row.note && row.note.includes('[삭제됨]'))
                                                const rowUrl = (row.purchase_url || '').trim()
                                                const rowFormattedUrl = rowUrl ? (rowUrl.startsWith('http://') || rowUrl.startsWith('https://') ? rowUrl : `https://${rowUrl}`) : ''

                                                return (
                                                    <tr key={idx} style={{ backgroundColor: isDeleted ? '#f8fafc' : undefined }}>
                                                        <td style={{ color: isDeleted ? '#94a3b8' : '#475569', textDecoration: isDeleted ? 'line-through' : 'none' }}>
                                                            {row.date}
                                                        </td>
                                                        <td>
                                                            <span style={{
                                                                display: 'inline-block',
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.78em',
                                                                fontWeight: 'bold',
                                                                marginRight: '4px',
                                                                backgroundColor: isIndividual ? '#f0fdf4' : '#eff6ff',
                                                                color: isIndividual ? '#15803d' : '#1d4ed8',
                                                                border: isIndividual ? '1px solid #bbf7d0' : '1px solid #bfdbfe'
                                                            }}>
                                                                {isIndividual ? '개별입고' : '구매입고'}
                                                            </span>
                                                            <span style={{ textDecoration: isDeleted ? 'line-through' : 'none', color: isDeleted ? '#94a3b8' : 'inherit' }}>
                                                                {row.vendor || '-'}
                                                            </span>
                                                        </td>
                                                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: isDeleted ? '#94a3b8' : '#166534' }}>
                                                            {isDeleted ? '0개' : `+${Number(row.quantity || 0).toLocaleString()}개`}
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: isDeleted ? '#94a3b8' : '#0f172a' }}>
                                                            {row.unit_price ? formatPrice(row.unit_price) : '-'}
                                                        </td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            {rowFormattedUrl ? (
                                                                <a
                                                                    href={rowFormattedUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '2px',
                                                                        padding: '1px 5px',
                                                                        backgroundColor: '#eff6ff',
                                                                        color: '#1d4ed8',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.8em',
                                                                        textDecoration: 'none'
                                                                    }}
                                                                    title={rowFormattedUrl}
                                                                >
                                                                    링크 ↗
                                                                </a>
                                                            ) : (
                                                                <span style={{ color: '#cbd5e1' }}>-</span>
                                                            )}
                                                        </td>
                                                        <td style={{ color: '#475569' }}>{row.staff || '-'}</td>
                                                        <td style={{ color: isDeleted ? '#ef4444' : '#64748b', fontSize: '0.85em' }}>{row.note || '-'}</td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            {!isDeleted && (
                                                                <button
                                                                    className="btn btn-danger"
                                                                    style={{ padding: '2px 5px', fontSize: '0.75em' }}
                                                                    disabled={deleteInboundMutation.isPending}
                                                                    onClick={() => {
                                                                        if (window.confirm(`[${row.date}] ${item.item_name} (${row.quantity}개) 입고 내역을 삭제하시겠습니까?\n\n💡 실재고(추가 수량)에서도 ${row.quantity}개가 자동으로 복원 차감됩니다.`)) {
                                                                            deleteInboundMutation.mutate({
                                                                                row_index: row.row_index,
                                                                                source_type: row.source_type,
                                                                                quantity: Number(row.quantity) || 0
                                                                            })
                                                                        }
                                                                    }}
                                                                    title="내역 삭제 및 실재고 복원 차감"
                                                                >
                                                                    🗑️
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* 하단 닫기 바 */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 22px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                    <button className="btn btn-secondary" onClick={onClose}>✕ 닫기</button>
                </div>
            </div>
        </div>
    )
}

// ─── 품목별 구매 사이트 & 실제 구매 가격 히스토리 모달 ───────────
const PriceHistoryModal = ({ itemName, onClose }) => {
    const queryClient = useQueryClient()
    const today = new Date().toISOString().slice(0, 10)
    const [showAddForm, setShowAddForm] = useState(false)
    const [formData, setFormData] = useState({
        date: today,
        quantity: '1',
        unit_price: '',
        vendor: '',
        purchase_url: '',
        staff: '',
        note: '',
        update_master: true,
    })

    const { data: priceData, isLoading, refetch } = useQuery({
        queryKey: ['item-price-history', itemName],
        queryFn: async () => {
            const { data } = await axios.get(`/api/consumables/items/${encodeURIComponent(itemName)}/purchase-history`)
            return data
        },
        enabled: !!itemName
    })

    const addMutation = useMutation({
        mutationFn: async (payload) => {
            return axios.post('/api/consumables/purchase-history', {
                ...payload,
                item_name: itemName,
                quantity: Number(payload.quantity) || 1
            })
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['item-price-history', itemName] })
            queryClient.invalidateQueries({ queryKey: ['purchase-history'] })
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
            setShowAddForm(false)
            setFormData({
                date: today,
                quantity: '1',
                unit_price: '',
                vendor: '',
                purchase_url: '',
                staff: '',
                note: '',
                update_master: true,
            })
            refetch()
            alert('구매 및 가격 내역이 성공적으로 등록되었습니다.')
        },
        onError: (err) => {
            alert('등록 실패: ' + (err.response?.data?.detail || err.message))
        }
    })

    const deleteMutation = useMutation({
        mutationFn: async (rowIndex) => {
            return axios.delete(`/api/consumables/purchase-history/${rowIndex}`)
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['item-price-history', itemName] })
            queryClient.invalidateQueries({ queryKey: ['purchase-history'] })
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
            refetch()
            alert('구매 내역이 삭제되었습니다.')
        },
        onError: (err) => {
            alert('삭제 실패: ' + (err.response?.data?.detail || err.message))
        }
    })

    const handleSubmit = (e) => {
        e.preventDefault()
        if (!formData.date || !formData.quantity) {
            alert('날짜와 수량은 필수 입력 항목입니다.')
            return
        }
        addMutation.mutate(formData)
    }

    const master = priceData?.master_info
    const stats = priceData?.stats || {}
    const history = priceData?.history || []

    const currentUrl = (master?.purchase_url || stats.latest_purchase_url || '').trim()
    const formattedUrl = currentUrl ? (currentUrl.startsWith('http://') || currentUrl.startsWith('https://') ? currentUrl : `https://${currentUrl}`) : ''

    const formatPrice = (val) => {
        if (val === null || val === undefined || val === '') return '-'
        const num = Number(String(val).replace(/,/g, ''))
        return isNaN(num) ? String(val) : num.toLocaleString() + '원'
    }

    return (
        <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1200, padding: '16px' }}>
            <div className="card" style={{ width: '900px', maxWidth: '95vw', maxHeight: '90vh', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden', padding: 0 }}>
                {/* 헤더 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 24px', background: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)', color: '#fff' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '1.4rem' }}>📊</span>
                            <h3 style={{ margin: 0, color: '#fff', fontSize: '1.25rem', fontWeight: 'bold' }}>{itemName}</h3>
                            {master?.category && (
                                <span style={{ padding: '2px 8px', borderRadius: '12px', fontSize: '0.75rem', backgroundColor: '#475569', color: '#e2e8f0' }}>
                                    {master.category}
                                </span>
                            )}
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#94a3b8' }}>
                            구매 사이트 링크 및 실제 구매 단가 변동 히스토리 내역
                        </p>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button
                            className="btn btn-primary"
                            style={{ padding: '6px 14px', fontSize: '0.85em', backgroundColor: showAddForm ? '#64748b' : '#2563eb', borderColor: 'transparent' }}
                            onClick={() => setShowAddForm(v => !v)}
                        >
                            {showAddForm ? '닫기' : '+ 새 구매내역 등록'}
                        </button>
                        <button
                            onClick={onClose}
                            style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer', lineHeight: '1', padding: '4px 8px' }}
                            title="닫기"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {isLoading ? (
                    <div style={{ padding: '3rem', textAlign: 'center', color: '#64748b' }}>
                        <LoadingModal isOpen message="구매 가격 히스토리를 불러오는 중입니다..." />
                    </div>
                ) : (
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
                        {/* 상단 통계 카드 그리드 */}
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '16px' }}>
                            <div style={{ padding: '14px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                <div style={{ fontSize: '0.78rem', color: '#64748b', fontWeight: '600', marginBottom: '4px' }}>마스터 기준 단가</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#0f172a' }}>{formatPrice(master?.price)}</div>
                            </div>
                            <div style={{ padding: '14px', background: '#eff6ff', borderRadius: '10px', border: '1px solid #bfdbfe' }}>
                                <div style={{ fontSize: '0.78rem', color: '#1d4ed8', fontWeight: '600', marginBottom: '4px' }}>최근 구매 단가</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#1e40af' }}>{formatPrice(stats.latest_price)}</div>
                            </div>
                            <div style={{ padding: '14px', background: '#f0fdf4', borderRadius: '10px', border: '1px solid #bbf7d0' }}>
                                <div style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: '600', marginBottom: '4px' }}>최저 / 최고 단가</div>
                                <div style={{ fontSize: '1.05rem', fontWeight: 'bold', color: '#166534', marginTop: '2px' }}>
                                    {stats.min_price != null ? `${Number(stats.min_price).toLocaleString()}원 ~ ${Number(stats.max_price).toLocaleString()}원` : '-'}
                                </div>
                            </div>
                            <div style={{ padding: '14px', background: '#fefce8', borderRadius: '10px', border: '1px solid #fef08a' }}>
                                <div style={{ fontSize: '0.78rem', color: '#854d0e', fontWeight: '600', marginBottom: '4px' }}>누적 구매 수량 (총 {stats.count || 0}건)</div>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#713f12' }}>
                                    {(stats.total_quantity || 0).toLocaleString()}개
                                </div>
                            </div>
                        </div>

                        {/* 구매 사이트 연결 배너 */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd', marginBottom: '16px', flexWrap: 'wrap', gap: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '240px' }}>
                                <span style={{ fontSize: '1.2rem' }}>🌐</span>
                                <div>
                                    <span style={{ fontSize: '0.82rem', color: '#0369a1', fontWeight: 'bold' }}>구매처 공식/온라인 사이트</span>
                                    <div style={{ fontSize: '0.9rem', color: formattedUrl ? '#0284c7' : '#94a3b8', wordBreak: 'break-all' }}>
                                        {formattedUrl || '등록된 구매 사이트 URL이 없습니다.'}
                                    </div>
                                </div>
                            </div>
                            {formattedUrl ? (
                                <a
                                    href={formattedUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '7px 14px',
                                        backgroundColor: '#0284c7',
                                        color: '#fff',
                                        borderRadius: '6px',
                                        fontSize: '0.85em',
                                        fontWeight: 'bold',
                                        textDecoration: 'none',
                                        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                                    }}
                                >
                                    구매 사이트 방문하기 ↗
                                </a>
                            ) : (
                                <span style={{ fontSize: '0.8em', color: '#64748b' }}>
                                    💡 아래 '새 구매내역 등록' 또는 마스터 리스트의 '상세 수정'에서 URL을 등록할 수 있습니다.
                                </span>
                            )}
                        </div>

                        {/* 신규 구매 입고 등록 폼 */}
                        {showAddForm && (
                            <form onSubmit={handleSubmit} style={{ padding: '16px', background: '#f8fafc', borderRadius: '10px', border: '1px solid #cbd5e1', marginBottom: '16px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                    <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#1e293b' }}>⚡ 새 구매 내역 등록</h4>
                                    <span style={{ fontSize: '0.8rem', color: '#64748b' }}>등록 즉시 구매입고 시트에 추가됩니다.</span>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '10px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8em', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>구매 일자 *</label>
                                        <input
                                            type="date"
                                            value={formData.date}
                                            onChange={e => setFormData({ ...formData, date: e.target.value })}
                                            style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9em', boxSizing: 'border-box' }}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8em', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>구매 수량 *</label>
                                        <input
                                            type="number"
                                            min="1"
                                            placeholder="수량"
                                            value={formData.quantity}
                                            onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                                            style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9em', boxSizing: 'border-box' }}
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8em', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>실제 구매 단가(원)</label>
                                        <input
                                            type="text"
                                            placeholder="예: 25,000"
                                            value={formData.unit_price}
                                            onChange={e => setFormData({ ...formData, unit_price: e.target.value })}
                                            style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9em', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8em', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>구매처</label>
                                        <input
                                            type="text"
                                            placeholder="예: 쿠팡, 한누리, 네이버스토어"
                                            value={formData.vendor}
                                            onChange={e => setFormData({ ...formData, vendor: e.target.value })}
                                            style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9em', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '10px', marginTop: '10px' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8em', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>구매 사이트 (URL)</label>
                                        <input
                                            type="text"
                                            placeholder="https://... (해당 상품 구매 상세 링크)"
                                            value={formData.purchase_url}
                                            onChange={e => setFormData({ ...formData, purchase_url: e.target.value })}
                                            style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9em', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.8em', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>담당자</label>
                                        <input
                                            type="text"
                                            placeholder="담당자 이름"
                                            value={formData.staff}
                                            onChange={e => setFormData({ ...formData, staff: e.target.value })}
                                            style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9em', boxSizing: 'border-box' }}
                                        />
                                    </div>
                                </div>
                                <div style={{ marginTop: '10px' }}>
                                    <label style={{ display: 'block', fontSize: '0.8em', fontWeight: 'bold', color: '#475569', marginBottom: '4px' }}>비고 (메모)</label>
                                    <input
                                        type="text"
                                        placeholder="특이사항, 할인 적용 여부 등"
                                        value={formData.note}
                                        onChange={e => setFormData({ ...formData, note: e.target.value })}
                                        style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.9em', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', flexWrap: 'wrap', gap: '8px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85em', color: '#1e40af', cursor: 'pointer', fontWeight: '500' }}>
                                        <input
                                            type="checkbox"
                                            checked={formData.update_master}
                                            onChange={e => setFormData({ ...formData, update_master: e.target.checked })}
                                            style={{ cursor: 'pointer' }}
                                        />
                                        💡 마스터 리스트의 기준 단가와 구매 사이트도 이 값으로 함께 갱신
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            style={{ fontSize: '0.85em' }}
                                            onClick={() => setShowAddForm(false)}
                                        >
                                            취소
                                        </button>
                                        <button
                                            type="submit"
                                            className="btn btn-primary"
                                            style={{ fontSize: '0.85em' }}
                                            disabled={addMutation.isPending}
                                        >
                                            {addMutation.isPending ? '등록 중...' : '저장하기'}
                                        </button>
                                    </div>
                                </div>
                            </form>
                        )}

                        {/* 구매 내역 테이블 */}
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#1e293b' }}>📋 과거 구매 내역 목록</h4>
                                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>최신순 정렬 (총 {history.length}건)</span>
                            </div>
                            {history.length === 0 ? (
                                <div style={{ padding: '2.5rem', textAlign: 'center', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px dashed #cbd5e1', color: '#94a3b8' }}>
                                    등록된 구매 가격 히스토리 내역이 없습니다.<br />
                                    <span style={{ fontSize: '0.85em' }}>우측 상단의 '+ 새 구매내역 등록' 버튼으로 첫 구매 기록을 남겨보세요.</span>
                                </div>
                            ) : (
                                <div className="table-wrapper" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                                    <table className="data-table" style={{ fontSize: '0.88em' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: '14%' }}>구매일자</th>
                                                <th style={{ width: '12%', textAlign: 'center' }}>구매수량</th>
                                                <th style={{ width: '16%', textAlign: 'right' }}>실제 구매단가</th>
                                                <th style={{ width: '16%' }}>구매처</th>
                                                <th style={{ width: '14%', textAlign: 'center' }}>구매 사이트</th>
                                                <th style={{ width: '12%' }}>담당자</th>
                                                <th>비고</th>
                                                <th style={{ width: '60px', textAlign: 'center' }}>삭제</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {history.map((row, idx) => {
                                                const rowUrl = (row.purchase_url || '').trim()
                                                const rowFormattedUrl = rowUrl ? (rowUrl.startsWith('http://') || rowUrl.startsWith('https://') ? rowUrl : `https://${rowUrl}`) : ''

                                                return (
                                                    <tr key={idx}>
                                                        <td style={{ color: '#475569', fontWeight: '500' }}>{row.date}</td>
                                                        <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#166534' }}>
                                                            {Number(row.quantity || 0).toLocaleString()}개
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0f172a' }}>
                                                            {formatPrice(row.unit_price)}
                                                        </td>
                                                        <td style={{ color: '#334155' }}>{row.vendor || '-'}</td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            {rowFormattedUrl ? (
                                                                <a
                                                                    href={rowFormattedUrl}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '2px',
                                                                        padding: '2px 6px',
                                                                        backgroundColor: '#eff6ff',
                                                                        color: '#1d4ed8',
                                                                        borderRadius: '4px',
                                                                        fontSize: '0.82em',
                                                                        textDecoration: 'none'
                                                                    }}
                                                                    title={rowFormattedUrl}
                                                                >
                                                                    링크 ↗
                                                                </a>
                                                            ) : (
                                                                <span style={{ color: '#cbd5e1' }}>-</span>
                                                            )}
                                                        </td>
                                                        <td style={{ color: '#475569' }}>{row.staff || '-'}</td>
                                                        <td style={{ color: '#64748b', fontSize: '0.85em' }}>{row.note || '-'}</td>
                                                        <td style={{ textAlign: 'center' }}>
                                                            <button
                                                                className="btn btn-danger"
                                                                style={{ padding: '2px 6px', fontSize: '0.78em' }}
                                                                disabled={deleteMutation.isPending}
                                                                onClick={() => {
                                                                    if (window.confirm(`[${row.date}] ${row.item_name} (${row.quantity}개) 구매 내역을 삭제하시겠습니까?`)) {
                                                                        deleteMutation.mutate(row.row_index)
                                                                    }
                                                                }}
                                                                title="내역 삭제"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* 하단 닫기 바 */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '12px 24px', backgroundColor: '#f8fafc', borderTop: '1px solid #e2e8f0' }}>
                    <button className="btn btn-secondary" onClick={onClose}>닫기</button>
                </div>
            </div>
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

// ─── 재고 추적 관리 탭 (TrackedItemsTab) ──────────────────────────
const TrackedItemsTab = () => {
    const queryClient = useQueryClient()
    const [searchTerm, setSearchTerm] = useState('')
    const [filterStatus, setFilterStatus] = useState('all') // 'all' | 'low' | 'good'
    const [detailModalItem, setDetailModalItem] = useState(null) // null | item

    // 실시간 누적 실재고 조회 (마스터 리스트와 100% 동일한 cumulative 모드)
    const trackedQueryKey = ['consumables-items', 'cumulative', 'tracked-tab']
    const { data: allItems, isLoading } = useQuery({
        queryKey: trackedQueryKey,
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/items?dispatch_mode=cumulative')
            return data
        }
    })

    const trackedItems = useMemo(() => {
        if (!allItems) return []
        return allItems.filter(item => item.is_tracked)
    }, [allItems])

    // 각 품목별 적정 기준 재고 및 상태 판정
    const processedItems = useMemo(() => {
        return trackedItems.map(item => {
            const current = item.current_stock ?? 0
            const baseQty = Number(item.base_qty) || 0
            // 기준 수량: 품목 마스터의 기초재고(base_qty)를 적정 유지 재고로 사용 (미설정 시 기본 3개)
            const threshold = baseQty > 0 ? baseQty : 3
            const isOutOfStock = current <= 0
            const isLow = current <= threshold

            return {
                ...item,
                threshold,
                isOutOfStock,
                isLow,
                statusType: isOutOfStock ? 'out' : (isLow ? 'low' : 'good')
            }
        })
    }, [trackedItems])

    // 필터링 적용
    const filteredItems = useMemo(() => {
        return processedItems.filter(item => {
            const matchesSearch = !searchTerm ||
                item.item_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                item.category?.toLowerCase().includes(searchTerm.toLowerCase())
            const matchesStatus =
                filterStatus === 'all' ? true :
                filterStatus === 'low' ? item.isLow :
                filterStatus === 'good' ? !item.isLow : true
            return matchesSearch && matchesStatus
        })
    }, [processedItems, searchTerm, filterStatus])

    // KPI 카운트
    const totalCount = processedItems.length
    const lowCount = processedItems.filter(it => it.isLow).length
    const goodCount = processedItems.filter(it => !it.isLow).length

    if (isLoading) return <LoadingModal isOpen={isLoading} message="실시간 재고 추적 데이터를 불러오는 중입니다..." />

    return (
        <div className="card">
            {/* 상단 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '10px' }}>
                <div>
                    <h3 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>📍</span> 재고 추적 관리 현황
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85em', color: '#64748b' }}>
                        소모품 마스터에서 <strong>'재고 추적'</strong>을 선택한 핵심 품목들의 실시간 실재고 및 기준재고 대비 상태를 모니터링합니다.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <input
                        type="text"
                        placeholder="품목명 또는 대분류 검색..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        style={{ padding: '6px 12px', borderRadius: '6px', border: '1px solid #cbd5e1', fontSize: '0.88em', width: '220px' }}
                    />
                </div>
            </div>

            {/* KPI 요약 카드 그리드 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '1.2rem' }}>
                <div
                    onClick={() => setFilterStatus('all')}
                    style={{
                        padding: '12px 16px', background: filterStatus === 'all' ? '#e0f2fe' : '#f8fafc',
                        border: filterStatus === 'all' ? '2px solid #0284c7' : '1px solid #e2e8f0',
                        borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s'
                    }}
                >
                    <div style={{ fontSize: '0.78rem', color: '#0369a1', fontWeight: 'bold' }}>전체 추적 품목</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#0f172a', marginTop: '2px' }}>
                        {totalCount} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#64748b' }}>개 품목</span>
                    </div>
                </div>

                <div
                    onClick={() => setFilterStatus('good')}
                    style={{
                        padding: '12px 16px', background: filterStatus === 'good' ? '#dcfce7' : '#f0fdf4',
                        border: filterStatus === 'good' ? '2px solid #16a34a' : '1px solid #bbf7d0',
                        borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s'
                    }}
                >
                    <div style={{ fontSize: '0.78rem', color: '#15803d', fontWeight: 'bold' }}>✅ 재고 양호 (기준 초과)</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#166534', marginTop: '2px' }}>
                        {goodCount} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#64748b' }}>개 품목</span>
                    </div>
                </div>

                <div
                    onClick={() => setFilterStatus('low')}
                    style={{
                        padding: '12px 16px', background: filterStatus === 'low' ? '#fee2e2' : '#fff5f5',
                        border: filterStatus === 'low' ? '2px solid #dc2626' : '1px solid #fecaca',
                        borderRadius: '10px', cursor: 'pointer', transition: 'all 0.15s'
                    }}
                >
                    <div style={{ fontSize: '0.78rem', color: '#b91c1c', fontWeight: 'bold' }}>🚨 재고 부족 (기준 이하)</div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 'bold', color: '#991b1b', marginTop: '2px' }}>
                        {lowCount} <span style={{ fontSize: '0.8rem', fontWeight: 'normal', color: '#b91c1c' }}>개 품목 (클릭 시 필터)</span>
                    </div>
                </div>
            </div>

            {/* 상태 안내 배너 */}
            <div style={{ padding: '10px 14px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', fontSize: '0.82em', color: '#475569' }}>
                <div>
                    💡 <strong>양호 / 부족 판정 기준</strong>: 각 품목의 <strong>'기준(적정) 수량 (E열)'</strong>이 최소 유지 적정 기준 수량입니다 (재고 계산 미포함). 현재 실재고(F열 - 출고량)가 기준치 이하로 내려가면 자동으로 🚨 <strong>부족</strong> 경고가 표시됩니다.
                </div>
                {filterStatus !== 'all' && (
                    <button
                        onClick={() => setFilterStatus('all')}
                        style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontWeight: 'bold', padding: 0 }}
                    >
                        전체 보기로 돌아가기 ↩
                    </button>
                )}
            </div>

            {/* 품목 테이블 */}
            <div className="table-wrapper">
                <table className="data-table">
                    <thead>
                        <tr>
                            <th style={{ width: '14%' }}>대분류</th>
                            <th>품목명</th>
                            <th style={{ width: '13%', textAlign: 'right' }}>기준 단가(₩)</th>
                            <th style={{ width: '13%', textAlign: 'center', color: '#1d4ed8' }}>
                                기준(적정) 수량<br/>
                                <small style={{ fontWeight: 'normal', fontSize: '0.75em' }}>부족판정 기준 E열</small>
                            </th>
                            <th style={{ width: '12%', textAlign: 'center', color: '#f59e0b' }}>
                                총 누적출고<br/>
                                <small style={{ fontWeight: 'normal', fontSize: '0.75em' }}>전체기간</small>
                            </th>
                            <th style={{ width: '14%', textAlign: 'center', color: '#0f172a', fontSize: '1.05em' }}>
                                현재 실재고<br/>
                                <small style={{ fontWeight: 'normal', fontSize: '0.75em' }}>실물 잔여</small>
                            </th>
                            <th style={{ width: '13%', textAlign: 'center' }}>상태</th>
                            <th style={{ width: '90px', textAlign: 'center' }}>관리</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredItems.length > 0 ? filteredItems.map((item, idx) => {
                            const current = item.current_stock ?? 0
                            const priceFormatted = item.price ? Number(String(item.price).replace(/,/g, '')).toLocaleString() + '원' : '-'

                            return (
                                <tr key={idx} style={{ backgroundColor: item.isLow ? '#fff5f5' : undefined }}>
                                    <td style={{ color: '#64748b', fontSize: '0.88em' }}>{item.category || '-'}</td>
                                    <td style={{ fontWeight: 'bold', color: '#1e293b' }}>
                                        {item.item_name}
                                    </td>
                                    <td style={{ textAlign: 'right', color: '#334155' }}>{priceFormatted}</td>
                                    <td style={{ textAlign: 'center', fontWeight: 'bold', color: '#1d4ed8', backgroundColor: '#eff6ff' }}>
                                        {item.threshold}개
                                    </td>
                                    <td style={{ textAlign: 'center', color: '#f59e0b', fontWeight: 'bold' }}>
                                        {(item.dispatched_qty || 0).toLocaleString()}개
                                    </td>
                                    <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1.15em', color: item.isLow ? '#dc2626' : '#15803d' }}>
                                        {current.toLocaleString()}개
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <span style={{
                                            padding: '4px 10px', borderRadius: '12px', fontSize: '0.82em', fontWeight: 'bold', display: 'inline-block',
                                            backgroundColor: item.isOutOfStock ? '#fef2f2' : (item.isLow ? '#fff1f2' : '#dcfce7'),
                                            color: item.isOutOfStock ? '#991b1b' : (item.isLow ? '#e11d48' : '#15803d'),
                                            border: `1px solid ${item.isOutOfStock ? '#fca5a5' : (item.isLow ? '#fecdd3' : '#86efac')}`
                                        }}>
                                            {item.isOutOfStock ? `🚨 품절 (0개)` : (item.isLow ? `⚠️ 부족 (${current}/${item.threshold}개)` : `✅ 양호`)}
                                        </span>
                                    </td>
                                    <td style={{ textAlign: 'center' }}>
                                        <button
                                            className="btn btn-primary"
                                            style={{ padding: '3px 8px', fontSize: '0.8em', fontWeight: 'bold' }}
                                            onClick={() => setDetailModalItem(item)}
                                            title="기준재고 수정, 입고 등록, 사진 변경 등 상세 관리"
                                        >
                                            ✏️ 상세 수정
                                        </button>
                                    </td>
                                </tr>
                            )
                        }) : (
                            <tr>
                                <td colSpan="8" style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                                    {trackedItems.length === 0 ? (
                                        <>
                                            재고 추적 중인 품목이 없습니다.<br/>
                                            <span style={{ fontSize: '0.85em' }}>[소모품 품목] 탭에서 원하는 품목의 '상세 수정'을 열어 <strong>'재고 추적 대상 품목'</strong>을 체크하세요.</span>
                                        </>
                                    ) : (
                                        '조건에 일치하는 추적 품목이 없습니다.'
                                    )}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* 통합 상세 수정 모달 */}
            {detailModalItem && (
                <ItemDetailModal
                    item={detailModalItem}
                    categories={[]}
                    onClose={() => setDetailModalItem(null)}
                    onUpdateItem={() => {
                        queryClient.invalidateQueries({ queryKey: trackedQueryKey })
                        queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
                    }}
                    onOpenCropModal={() => {}}
                    onOpenViewerModal={() => {}}
                />
            )}
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
                💡 이번 달 혹은 새로운 월의 출고 내역을 기록하기 위한 출고 탭을 생성합니다.<br/>
                지정하신 '월' 이름으로 구글 시트 출고 탭이 생성되며, <strong>소모품 마스터 리스트의 기존 재고(구매/추가 수량)는 안전하게 그대로 유지</strong>됩니다.
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

    // "중고재고"만 숨김 처리 — 실재고·안전재고는 표시
    const HIDDEN_COLS = ['중고재고']
    const displayHeaders = headers.filter(h => !HIDDEN_COLS.includes(h))

    const filtered = searchTerm
        ? items.filter(it => headers.some(h => String(it[h] || '').toLowerCase().includes(searchTerm.toLowerCase())))
        : items

    // 출고수량 — 일반 출고 (dispatched_qty)
    const { data: itemsForDispatch } = useQuery({
        queryKey: ['consumables-items', 'cumulative', 'toner'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/items?dispatch_mode=cumulative')
            return data
        },
        staleTime: 60000,
    })
    // 위탁 출고 내역 (전체 월)
    const { data: consignmentHistory } = useQuery({
        queryKey: ['toner-consignment', 'all'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/tonner-consignment')
            return data
        },
        staleTime: 60000,
    })
    // 일반 + 위탁 합산 출고맵
    const dispatchMap = useMemo(() => {
        const m = {}
        // 일반 출고 (위탁 제외된 dispatched_qty)
        if (itemsForDispatch) {
            itemsForDispatch.forEach(it => {
                if (it.item_name) m[it.item_name.toLowerCase()] = it.dispatched_qty || 0
            })
        }
        // 위탁 출고 추가 합산
        if (consignmentHistory) {
            consignmentHistory.forEach(rec => {
                if (rec.item_name) {
                    const key = rec.item_name.toLowerCase()
                    m[key] = (m[key] || 0) + (rec.quantity || 0)
                }
            })
        }
        return m
    }, [itemsForDispatch, consignmentHistory])

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

    // 재고 상태 뱃지 (안전재고 기준으로 부족 판단)
    const getSafetyQty = (item) => parseInt(String(item['안전재고'] || '0').replace(/,/g, '')) || 0
    const StockBadge = ({ item }) => {
        if (stockCol == null || item[stockCol] == null) return <span style={{ color: '#aaa', fontSize: '0.85em' }}>-</span>
        const qty = item.current_stock ?? 0
        const safety = getSafetyQty(item)
        const isLow = qty <= safety
        return (
            <span style={{
                padding: '3px 10px', borderRadius: '12px', fontSize: '0.85em', fontWeight: 'bold', display: 'inline-block',
                backgroundColor: isLow ? '#fee2e2' : '#dcfce7',
                color: isLow ? '#ef4444' : '#22c55e',
                border: `1px solid ${isLow ? '#fca5a5' : '#86efac'}`
            }}>
                {isLow ? `🚨 부족 (${qty}개)` : `✅ 충분 (${qty}개)`}
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
                        onClick={async () => {
                            // displayHeaders 기준으로 모든 컬럼 내보내기
                            const expHeaders = ['품목명', '현재재고', ...displayHeaders.filter(h => h !== nameCol && h !== stockCol)]
                            const rows = filtered.map(it => {
                                const row = { '품목명': it.item_name, '현재재고': it.current_stock ?? 0 }
                                displayHeaders.filter(h => h !== nameCol && h !== stockCol).forEach(h => { row[h] = it[h] ?? '' })
                                return row
                            })
                            const columns = expHeaders.map(h => ({ key: h, label: h }))
                            await exportToXLSX({ filename: `토너재고_${todayStr()}`, columns, rows })
                        }}
                        disabled={filtered.length === 0}
                    />
                    <button className="btn btn-secondary" onClick={handleSync} disabled={isFetching} style={{ fontSize: '0.9em' }}>
                        {isFetching ? '동기화 중...' : '🔄 시트 동기화'}
                    </button>
                    <button
                        className="btn btn-danger"
                        style={{ fontSize: '0.88em', padding: '6px 12px', backgroundColor: '#dc2626', borderColor: '#b91c1c' }}
                        onClick={async () => {
                            if (!window.confirm('⚠️ [주의] 모든 월별 출고 시트와 입고 시트에서 토너 관련 기록을 완전히 일괄 삭제하시겠습니까?\n\n이 작업을 수행하면:\n1. 모든 월별 출고 시트(위탁/일반)의 토너 출고 행이 완전히 삭제됩니다.\n2. 입고 시트의 토너 기록이 정리됩니다.\n3. 재고 마감 및 스냅샷의 토너 출고 집계가 0으로 초기화됩니다.\n\n계속 진행하시겠습니까?')) return
                            try {
                                const { data } = await axios.post('/api/consumables/toner/clear-all-records')
                                queryClient.invalidateQueries(['toner-inventory'])
                                queryClient.invalidateQueries(['tonner-consignment'])
                                queryClient.invalidateQueries(['consumables-items'])
                                alert(`토너 입출고 기록이 정리되었습니다.\n- 총 출고 삭제: ${data.total_deleted_outbound}건\n- 입고 삭제: ${data.deleted_inbound + data.deleted_indiv}건`)
                                refetch()
                            } catch (err) {
                                alert('토너 기록 삭제 실패: ' + (err.response?.data?.detail || err.message))
                            }
                        }}
                        title="모든 월별 출고/입고 시트에서 토너 기록 일괄 삭제"
                    >
                        🗑️ 토너 입출고 전체 삭제
                    </button>
                </div>
            </div>

            {/* 요약 카드 */}
            {items.length > 0 && (() => {
                const lowStock  = items.filter(it => (it.current_stock ?? 0) <= getSafetyQty(it))
                const goodStock = items.filter(it => (it.current_stock ?? 0) > getSafetyQty(it))
                return (
                    <div style={{ display: 'flex', gap: '12px', marginBottom: '1rem', flexWrap: 'wrap' }}>
                        <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '10px 18px', minWidth: '120px' }}>
                            <div style={{ fontSize: '0.75em', color: '#15803d', fontWeight: 'bold' }}>✅ 재고 충분</div>
                            <div style={{ fontSize: '1.5em', fontWeight: 'bold', color: '#22c55e' }}>{goodStock.length}</div>
                        </div>
                        <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: '8px', padding: '10px 18px', minWidth: '120px' }}>
                            <div style={{ fontSize: '0.75em', color: '#dc2626', fontWeight: 'bold' }}>🚨 안전재고 이하</div>
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
                                {displayHeaders.flatMap(h => {
                                    const cell = (
                                        <th key={h} style={{
                                            backgroundColor: h === stockCol ? '#f0fdf4' : h === nameCol ? '#eff6ff' : h === modelCol ? '#fefce8' : h === '안전재고' ? '#fff7ed' : undefined,
                                            color: h === stockCol ? '#15803d' : h === nameCol ? '#1d4ed8' : h === modelCol ? '#854d0e' : h === '안전재고' ? '#c2410c' : undefined,
                                            whiteSpace: 'nowrap'
                                        }}>
                                            {h === stockCol ? '📦 실재고' : h === nameCol ? '🖨️ 품목명' : h === modelCol ? `🔧 ${h}` : h === '안전재고' ? '⚠️ 안전재고' : h}
                                        </th>
                                    )
                                    // 실재고 바로 다음에 출고수량 삽입
                                    if (h === stockCol) {
                                        return [cell, <th key="__dispatch__" style={{ textAlign: 'center', whiteSpace: 'nowrap', backgroundColor: '#faf5ff', color: '#7c3aed' }}>📤 출고수량</th>]
                                    }
                                    return [cell]
                                })}
                                <th style={{ textAlign: 'center', width: '60px' }}>수정</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length > 0 ? filtered.map((item) => {
                                const isEditing = editingRow === item.row_index
                                const safety = getSafetyQty(item)
                                const isLow = (item.current_stock ?? 0) <= safety
                                const dispatchedQty = dispatchMap[item.item_name?.toLowerCase()] ?? 0
                                return (
                                    <tr key={item.row_index} style={{ backgroundColor: isEditing ? '#fefce8' : isLow ? '#fff5f5' : 'transparent' }}>
                                        {isEditing ? (
                                            <>
                                                {displayHeaders.flatMap(h => {
                                                    const inputCell = (
                                                        <td key={h} style={{ padding: '4px' }}>
                                                            <input
                                                                type={h === stockCol || h === '안전재고' ? 'number' : 'text'}
                                                                value={editForm[h] ?? ''}
                                                                onChange={e => setEditForm(f => ({ ...f, [h]: e.target.value }))}
                                                                style={{ width: '100%', padding: '4px 6px', borderRadius: '4px', border: '1px solid #93c5fd', boxSizing: 'border-box', minWidth: h === stockCol ? '70px' : '100px' }}
                                                            />
                                                        </td>
                                                    )
                                                    if (h === stockCol) {
                                                        return [inputCell, <td key="__dispatch__" style={{ textAlign: 'center', color: '#7c3aed', fontWeight: 'bold', padding: '4px 8px' }}>{dispatchedQty}</td>]
                                                    }
                                                    return [inputCell]
                                                })}
                                                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                    <button className="btn btn-primary" style={{ padding: '3px 8px', fontSize: '0.8em', marginRight: '3px' }} onClick={handleEditSave} disabled={updateMutation.isPending}>💾</button>
                                                    <button className="btn btn-secondary" style={{ padding: '3px 8px', fontSize: '0.8em' }} onClick={() => setEditingRow(null)}>✖</button>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                {displayHeaders.flatMap(h => {
                                                    const cell = (
                                                        <td key={h}
                                                            onDoubleClick={() => handleEditStart(item)}
                                                            title="더블클릭으로 수정"
                                                            style={{
                                                                cursor: 'pointer',
                                                                fontWeight: h === nameCol ? 'bold' : 'normal',
                                                                textAlign: h === stockCol || h === '안전재고' ? 'center' : undefined,
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
                                                                    backgroundColor: isLow ? '#fee2e2' : '#dcfce7',
                                                                    color: isLow ? '#ef4444' : '#15803d',
                                                                    border: `1px solid ${isLow ? '#fca5a5' : '#86efac'}`
                                                                }}>
                                                                    {isLow ? `🚨 ${item.current_stock ?? 0}개` : `${item.current_stock ?? 0}개`}
                                                                </span>
                                                            ) : h === '안전재고' ? (
                                                                <span style={{ color: '#c2410c', fontWeight: 'bold' }}>{item[h] ?? '-'}</span>
                                                            ) : item[h]}
                                                        </td>
                                                    )
                                                    if (h === stockCol) {
                                                        return [cell, (
                                                            <td key="__dispatch__" style={{ textAlign: 'center', color: '#7c3aed', fontWeight: 'bold' }}>
                                                                {dispatchedQty > 0 ? `📤 ${dispatchedQty}` : '-'}
                                                            </td>
                                                        )]
                                                    }
                                                    return [cell]
                                                })}
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
                                <tr><td colSpan={displayHeaders.length + 2} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>검색 결과가 없습니다.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {!isLoading && items.length > 0 && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.8em', color: '#94a3b8', textAlign: 'right' }}>
                    💡 더블클릭하거나 ✏️ 버튼으로 수정 · 출고수량은 일반 + 위탁 합산 표시 · 출고 시 실재고 자동 차감
                </div>
            )}
        </div>
    )
}


// ─── 구매 입고 내역 탭 ──────────────────────────────────────────
const PurchaseTab = ({ months }) => {
    const queryClient = useQueryClient()
    const [showForm, setShowForm] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [filterMonth, setFilterMonth] = useState('')
    const today = new Date().toISOString().slice(0, 10)
    const emptyForm = {
        date: today,
        item_name: '',
        quantity: '',
        unit_price: '',
        vendor: '',
        purchase_url: '',
        staff: '',
        note: '',
        update_master: true
    }
    const [formData, setFormData] = useState(emptyForm)

    // 품목 목록 (드롭다운용)
    const { data: allItems } = useQuery({
        queryKey: ['consumables-items', 'cumulative', null],
        queryFn: async () => { const { data } = await axios.get('/api/consumables/items?dispatch_mode=cumulative'); return data },
        staleTime: 60000,
    })
    const itemNames = useMemo(() => {
        if (!allItems) return []
        return [...new Set(allItems.map(it => it.item_name).filter(Boolean))].sort()
    }, [allItems])

    // 구매 입고 내역 조회
    const { data: history, isLoading } = useQuery({
        queryKey: ['purchase-history'],
        queryFn: async () => { const { data } = await axios.get('/api/consumables/purchase-history'); return data },
    })

    // 등록 mutation
    const addMutation = useMutation({
        mutationFn: async (d) => axios.post('/api/consumables/purchase-history', d),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchase-history'] })
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
            setFormData(emptyForm)
            setShowForm(false)
            alert("구매 입고가 등록되었습니다.")
        },
        onError: (e) => alert(`등록 실패: ${e?.response?.data?.detail || e.message}`)
    })

    // 삭제 mutation
    const deleteMutation = useMutation({
        mutationFn: async (row_index) => axios.delete(`/api/consumables/purchase-history/${row_index}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['purchase-history'] })
            queryClient.invalidateQueries({ queryKey: ['consumables-items'] })
            alert("삭제되었습니다.")
        },
        onError: () => alert("삭제 중 오류가 발생했습니다.")
    })

    const handleItemChange = (selectedName) => {
        const found = allItems?.find(it => it.item_name === selectedName)
        setFormData(prev => ({
            ...prev,
            item_name: selectedName,
            unit_price: found?.price || prev.unit_price,
            purchase_url: found?.purchase_url || prev.purchase_url,
        }))
    }

    const handleSubmit = (e) => {
        e.preventDefault()
        if (!formData.item_name || !formData.date || !formData.quantity) {
            alert("날짜, 품목명, 수량은 필수입니다.")
            return
        }
        addMutation.mutate({ ...formData, quantity: Number(formData.quantity) })
    }

    // 필터링
    const filtered = useMemo(() => {
        if (!history) return []
        return history.filter(h => {
            const matchSearch = !searchTerm || h.item_name.toLowerCase().includes(searchTerm.toLowerCase()) || (h.vendor || '').toLowerCase().includes(searchTerm.toLowerCase())
            const matchMonth = !filterMonth || h.date.startsWith(filterMonth)
            return matchSearch && matchMonth
        })
    }, [history, searchTerm, filterMonth])

    // 월별 집계
    const monthSummary = useMemo(() => {
        if (!history) return {}
        const agg = {}
        history.forEach(h => {
            const ym = h.date.slice(0, 7)
            if (!agg[ym]) agg[ym] = { count: 0, total_qty: 0 }
            agg[ym].count++
            agg[ym].total_qty += Number(h.quantity) || 0
        })
        return agg
    }, [history])

    const totalQty = filtered.reduce((s, h) => s + (Number(h.quantity) || 0), 0)

    const formatPrice = (val) => {
        if (val === null || val === undefined || val === '') return '-'
        const num = Number(String(val).replace(/,/g, ''))
        return isNaN(num) ? String(val) : num.toLocaleString() + '원'
    }

    return (
        <div className="card">
            {/* 헤더 */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '8px' }}>
                <h3 style={{ margin: 0 }}>🛒 구매 입고 내역</h3>
                <div style={{ display: 'flex', gap: '8px' }}>
                    <ExportButton
                        onClick={async () => {
                        const rows = filtered.map(r => ({
                            '구매일자': r.date, '품목명': r.item_name,
                            '수량': r.quantity, '구매단가': r.unit_price || '',
                            '구매처': r.vendor || '', '구매사이트': r.purchase_url || '',
                            '담당자': r.staff || '', '비고': r.note || r.memo || '',
                        }))
                        await exportToXLSX({ filename: `구매입고내역_${todayStr()}`,
                            columns: [
                                {key:'구매일자',label:'구매일자'},{key:'품목명',label:'품목명'},
                                {key:'수량',label:'수량'},{key:'구매단가',label:'구매단가'},
                                {key:'구매처',label:'구매처'},{key:'구매사이트',label:'구매사이트'},
                                {key:'담당자',label:'담당자'},{key:'비고',label:'비고'}
                            ],
                            rows })
                    }}
                        disabled={!filtered.length}
                    />
                    <button className="btn btn-primary" onClick={() => setShowForm(v => !v)}>
                        {showForm ? '닫기' : '+ 구매 등록'}
                    </button>
                </div>
            </div>

            {/* 등록 폼 */}
            {showForm && (
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'flex-end', padding: '16px', background: '#f0fdf4', borderRadius: '8px', border: '1px solid #bbf7d0', marginBottom: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85em', marginBottom: '4px', fontWeight: 'bold', color: '#166534' }}>날짜 *</label>
                        <input type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })}
                            style={{ padding: '7px 10px', border: '1px solid #86efac', borderRadius: '6px' }} required />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85em', marginBottom: '4px', fontWeight: 'bold', color: '#166534' }}>품목명 *</label>
                        <select value={formData.item_name} onChange={e => handleItemChange(e.target.value)}
                            style={{ padding: '7px 10px', border: '1px solid #86efac', borderRadius: '6px', minWidth: '180px' }} required>
                            <option value="">-- 품목 선택 --</option>
                            {itemNames.map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85em', marginBottom: '4px', fontWeight: 'bold', color: '#166534' }}>수량 *</label>
                        <input type="number" min="1" placeholder="0" value={formData.quantity} onChange={e => setFormData({ ...formData, quantity: e.target.value })}
                            style={{ padding: '7px 10px', border: '1px solid #86efac', borderRadius: '6px', width: '80px' }} required />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85em', marginBottom: '4px', fontWeight: 'bold', color: '#166534' }}>구매단가 (원)</label>
                        <input type="text" placeholder="예: 15,000" value={formData.unit_price} onChange={e => setFormData({ ...formData, unit_price: e.target.value })}
                            style={{ padding: '7px 10px', border: '1px solid #86efac', borderRadius: '6px', width: '110px' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85em', marginBottom: '4px', color: '#555' }}>구매처</label>
                        <input type="text" placeholder="예: 쿠팡, 한누리" value={formData.vendor} onChange={e => setFormData({ ...formData, vendor: e.target.value })}
                            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', width: '130px' }} />
                    </div>
                    <div style={{ flex: '1 1 200px' }}>
                        <label style={{ display: 'block', fontSize: '0.85em', marginBottom: '4px', color: '#0369a1', fontWeight: 'bold' }}>구매 사이트 (URL)</label>
                        <input type="text" placeholder="https://..." value={formData.purchase_url} onChange={e => setFormData({ ...formData, purchase_url: e.target.value })}
                            style={{ padding: '7px 10px', border: '1px solid #7dd3fc', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                        <label style={{ display: 'block', fontSize: '0.85em', marginBottom: '4px', color: '#555' }}>담당자</label>
                        <input type="text" placeholder="이름" value={formData.staff} onChange={e => setFormData({ ...formData, staff: e.target.value })}
                            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', width: '100px' }} />
                    </div>
                    <div style={{ flex: '1 1 150px' }}>
                        <label style={{ display: 'block', fontSize: '0.85em', marginBottom: '4px', color: '#555' }}>비고</label>
                        <input type="text" placeholder="메모" value={formData.note} onChange={e => setFormData({ ...formData, note: e.target.value })}
                            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px', width: '100%', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px', flexWrap: 'wrap', gap: '8px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.83em', color: '#166534', cursor: 'pointer', fontWeight: 'bold' }}>
                            <input
                                type="checkbox"
                                checked={formData.update_master}
                                onChange={e => setFormData({ ...formData, update_master: e.target.checked })}
                                style={{ cursor: 'pointer' }}
                            />
                            💡 마스터 리스트의 기준 단가와 구매 사이트도 이 값으로 자동 갱신
                        </label>
                        <button type="submit" className="btn btn-primary" disabled={addMutation.isPending}>
                            {addMutation.isPending ? '저장 중...' : '등록'}
                        </button>
                    </div>
                </form>
            )}

            {/* 검색 & 필터 */}
            <div style={{ display: 'flex', gap: '10px', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                    type="text" placeholder="🔍 품목명 또는 구매처 검색..."
                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px', minWidth: '220px' }}
                />
                <input
                    type="month" value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                    style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                    title="월별 필터"
                />
                {(searchTerm || filterMonth) && (
                    <button className="btn btn-secondary" style={{ fontSize: '0.85em' }} onClick={() => { setSearchTerm(''); setFilterMonth('') }}>초기화</button>
                )}
                <span style={{ marginLeft: 'auto', fontSize: '0.88em', color: '#64748b', fontWeight: 'bold' }}>
                    {filtered.length}건 · 총 {totalQty.toLocaleString()}개
                </span>
            </div>

            {/* 월별 집계 요약 */}
            {Object.keys(monthSummary).length > 0 && !filterMonth && !searchTerm && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '1rem' }}>
                    {Object.entries(monthSummary).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6).map(([ym, s]) => (
                        <div key={ym} onClick={() => setFilterMonth(ym)} style={{ padding: '6px 14px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '20px', cursor: 'pointer', fontSize: '0.83em', fontWeight: 'bold', color: '#1d4ed8' }}>
                            {ym} · {s.count}건 / {s.total_qty}개
                        </div>
                    ))}
                </div>
            )}

            {/* 테이블 */}
            {isLoading ? <LoadingModal isOpen message="구매 입고 내역을 불러오는 중..." /> : (
                <div className="table-wrapper">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>날짜</th>
                                <th style={{ fontWeight: 'bold' }}>품목명</th>
                                <th style={{ textAlign: 'center', color: '#166534' }}>수량</th>
                                <th style={{ textAlign: 'right' }}>구매단가</th>
                                <th>구매처</th>
                                <th style={{ textAlign: 'center' }}>구매 사이트</th>
                                <th>담당자</th>
                                <th>비고</th>
                                <th style={{ textAlign: 'center' }}>삭제</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.length > 0 ? filtered.map((h, idx) => {
                                const hUrl = (h.purchase_url || '').trim()
                                const hFormattedUrl = hUrl ? (hUrl.startsWith('http://') || hUrl.startsWith('https://') ? hUrl : `https://${hUrl}`) : ''

                                return (
                                    <tr key={idx}>
                                        <td style={{ color: '#475569' }}>{h.date}</td>
                                        <td style={{ fontWeight: 'bold' }}>{h.item_name}</td>
                                        <td style={{ textAlign: 'center', color: '#166534', fontWeight: 'bold' }}>{Number(h.quantity).toLocaleString()}</td>
                                        <td style={{ textAlign: 'right', fontWeight: 'bold', color: '#0f172a' }}>{formatPrice(h.unit_price)}</td>
                                        <td>{h.vendor || '-'}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            {hFormattedUrl ? (
                                                <a
                                                    href={hFormattedUrl}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    style={{
                                                        display: 'inline-flex',
                                                        alignItems: 'center',
                                                        gap: '2px',
                                                        padding: '3px 8px',
                                                        backgroundColor: '#f0f9ff',
                                                        color: '#0284c7',
                                                        border: '1px solid #bae6fd',
                                                        borderRadius: '4px',
                                                        fontSize: '0.82em',
                                                        fontWeight: 'bold',
                                                        textDecoration: 'none'
                                                    }}
                                                    title={hFormattedUrl}
                                                >
                                                    링크 ↗
                                                </a>
                                            ) : (
                                                <span style={{ color: '#cbd5e1' }}>-</span>
                                            )}
                                        </td>
                                        <td>{h.staff || '-'}</td>
                                        <td style={{ color: '#64748b', fontSize: '0.9em' }}>{h.note || ''}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                className="btn btn-danger"
                                                style={{ padding: '2px 8px', fontSize: '0.8em' }}
                                                onClick={() => {
                                                    if (window.confirm(`"${h.item_name}" 입고 기록을 삭제하시겠습니까?`))
                                                        deleteMutation.mutate(h.row_index)
                                                }}
                                                disabled={deleteMutation.isPending}
                                            >🗑️</button>
                                        </td>
                                    </tr>
                                )
                            }) : (
                                <tr><td colSpan="9" style={{ textAlign: 'center', color: '#999', padding: '2rem' }}>
                                    구매 입고 내역이 없습니다.
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}


// ─── 입출고 현황 탭 ────────────────────────────────────────────
const InventoryTab = () => {
    const queryClient = useQueryClient()

    // ── 입고 등록 폼 상태
    const [form, setForm] = useState({ date: '', item_name: '', quantity: '', memo: '' })
    const [showForm, setShowForm] = useState(false)

    // ── 뷰 전환: 'report' | 'inbound'
    const [view, setView] = useState('report')

    // ── 리포트 필터
    const [reportFilter, setReportFilter] = useState('month') // 'month' | 'item'
    const [selectedYM, setSelectedYM] = useState('')

    // ── 품목 목록 (입고 등록 셀렉트용)
    const { data: allItems } = useQuery({
        queryKey: ['consumables-items'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/items')
            return data
        }
    })
    const itemOptions = allItems?.map(it => ({ label: it.item_name, value: it.item_name })) || []

    // ── 입고 이력 조회
    const { data: inboundList = [], isLoading: inboundLoading } = useQuery({
        queryKey: ['inbound-history'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/inbound')
            return data
        }
    })

    // ── 입출고 리포트 조회
    const { data: report, isLoading: reportLoading } = useQuery({
        queryKey: ['inventory-report'],
        queryFn: async () => {
            const { data } = await axios.get('/api/consumables/inventory-report')
            return data
        }
    })

    // ── 입고 등록 mutation
    const addMutation = useMutation({
        mutationFn: async (data) => axios.post('/api/consumables/inbound', data),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inbound-history'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-report'] })
            setForm({ date: '', item_name: '', quantity: '', memo: '' })
            setShowForm(false)
            alert('입고 기록이 등록되었습니다.')
        },
        onError: (err) => {
            alert('입고 등록 실패: ' + (err.response?.data?.detail || err.message))
        }
    })

    // ── 입고 삭제 mutation
    const deleteMutation = useMutation({
        mutationFn: async ({ row_index, item_name }) =>
            axios.delete(`/api/consumables/inbound?row_index=${row_index}&item_name=${encodeURIComponent(item_name)}`),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['inbound-history'] })
            queryClient.invalidateQueries({ queryKey: ['inventory-report'] })
        },
        onError: (err) => {
            alert('삭제 실패: ' + (err.response?.data?.detail || err.message))
        }
    })

    const handleAddSubmit = (e) => {
        e.preventDefault()
        if (!form.date || !form.item_name || !form.quantity) {
            alert('날짜, 품목명, 수량은 필수입니다.')
            return
        }
        addMutation.mutate({ ...form, quantity: parseInt(form.quantity) })
    }

    const handleDelete = (rec) => {
        if (!window.confirm(`입고 기록을 삭제하시겠습니까?\n[${rec.date}] ${rec.item_name} ${rec.quantity}개`)) return
        deleteMutation.mutate({ row_index: rec.row_index, item_name: rec.item_name })
    }

    // ── 리포트 데이터 가공
    const byMonth = report?.by_month || {}
    const byItem = report?.by_item || {}
    const allYMs = Object.keys(byMonth).sort().reverse()

    // 월별 뷰에서 선택된 월의 데이터
    const selectedMonthData = selectedYM ? byMonth[selectedYM] : null

    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', flexWrap: 'wrap', gap: '0.5rem' }}>
                <h3 style={{ margin: 0 }}>📊 입출고 현황 관리</h3>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                        className={`btn ${view === 'report' ? 'btn-primary' : ''}`}
                        onClick={() => setView('report')}
                        style={{ fontSize: '0.9em' }}
                    >📈 입출고 리포트</button>
                    <button
                        className={`btn ${view === 'inbound' ? 'btn-primary' : ''}`}
                        onClick={() => setView('inbound')}
                        style={{ fontSize: '0.9em' }}
                    >📥 입고 이력</button>
                    <button
                        className="btn"
                        onClick={() => setShowForm(v => !v)}
                        style={{ backgroundColor: '#f0fdf4', border: '1px solid #22c55e', color: '#15803d', fontSize: '0.9em' }}
                    >➕ 입고 등록</button>
                </div>
            </div>

            {/* ── 입고 등록 폼 */}
            {showForm && (
                <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '8px', padding: '1rem', marginBottom: '1.2rem' }}>
                    <h4 style={{ margin: '0 0 0.8rem', color: '#15803d' }}>📥 입고 등록</h4>
                    <form onSubmit={handleAddSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'flex-end' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.8em', color: '#666' }}>입고 날짜 *</label>
                            <input
                                type="date"
                                value={form.date}
                                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                                required
                                style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '200px' }}>
                            <label style={{ fontSize: '0.8em', color: '#666' }}>품목명 *</label>
                            <SearchableSelect
                                options={itemOptions}
                                value={form.item_name}
                                onChange={val => setForm(f => ({ ...f, item_name: val }))}
                                placeholder="품목 선택 또는 입력"
                                displayField="label"
                                valueField="value"
                                searchFields={["label"]}
                                width="200px"
                                allowCustom={true}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <label style={{ fontSize: '0.8em', color: '#666' }}>수량 *</label>
                            <input
                                type="number"
                                min="1"
                                value={form.quantity}
                                onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))}
                                required
                                placeholder="수량"
                                style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px', width: '80px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', flex: 1, minWidth: '150px' }}>
                            <label style={{ fontSize: '0.8em', color: '#666' }}>비고</label>
                            <input
                                type="text"
                                value={form.memo}
                                onChange={e => setForm(f => ({ ...f, memo: e.target.value }))}
                                placeholder="비고 (선택)"
                                style={{ padding: '6px 10px', border: '1px solid #ccc', borderRadius: '4px' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button type="submit" className="btn btn-primary" disabled={addMutation.isPending}>
                                {addMutation.isPending ? '저장 중...' : '저장'}
                            </button>
                            <button type="button" className="btn" onClick={() => setShowForm(false)}>취소</button>
                        </div>
                    </form>
                </div>
            )}

            {/* ── 입출고 리포트 뷰 */}
            {view === 'report' && (
                <div>
                    <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                            className={`btn ${reportFilter === 'month' ? 'btn-primary' : ''}`}
                            onClick={() => setReportFilter('month')}
                            style={{ fontSize: '0.85em' }}
                        >📅 월별 현황</button>
                        <button
                            className={`btn ${reportFilter === 'item' ? 'btn-primary' : ''}`}
                            onClick={() => setReportFilter('item')}
                            style={{ fontSize: '0.85em' }}
                        >📦 품목별 현황</button>
                    </div>

                    {reportLoading && <div style={{ color: '#94a3b8', padding: '1rem' }}>리포트 로딩 중...</div>}

                    {/* 월별 현황 */}
                    {!reportLoading && reportFilter === 'month' && (
                        <div>
                            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
                                <button
                                    className={`btn ${!selectedYM ? 'btn-primary' : ''}`}
                                    onClick={() => setSelectedYM('')}
                                    style={{ fontSize: '0.8em' }}
                                >전체 요약</button>
                                {allYMs.map(ym => (
                                    <button
                                        key={ym}
                                        className={`btn ${selectedYM === ym ? 'btn-primary' : ''}`}
                                        onClick={() => setSelectedYM(ym)}
                                        style={{ fontSize: '0.8em' }}
                                    >{ym}</button>
                                ))}
                            </div>

                            {/* 전체 요약 테이블 */}
                            {!selectedYM && (
                                <table className="data-table">
                                    <thead>
                                        <tr>
                                            <th>년월</th>
                                            <th style={{ textAlign: 'center', color: '#15803d' }}>총 입고</th>
                                            <th style={{ textAlign: 'center', color: '#dc2626' }}>총 출고</th>
                                            <th style={{ textAlign: 'center', color: '#2563eb' }}>차이 (입고-출고)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {allYMs.length === 0 ? (
                                            <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>데이터 없음</td></tr>
                                        ) : allYMs.map(ym => {
                                            const d = byMonth[ym]
                                            const diff = d.total_in - d.total_out
                                            return (
                                                <tr key={ym} style={{ cursor: 'pointer' }} onClick={() => setSelectedYM(ym)}>
                                                    <td><strong>{ym}</strong></td>
                                                    <td style={{ textAlign: 'center', color: '#15803d', fontWeight: 'bold' }}>+{d.total_in.toLocaleString()}</td>
                                                    <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 'bold' }}>-{d.total_out.toLocaleString()}</td>
                                                    <td style={{ textAlign: 'center', fontWeight: 'bold', color: diff >= 0 ? '#2563eb' : '#dc2626' }}>
                                                        {diff >= 0 ? '+' : ''}{diff.toLocaleString()}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            )}

                            {/* 특정 월 상세 */}
                            {selectedYM && selectedMonthData && (
                                <div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                        <h4 style={{ margin: 0, color: '#334155' }}>📅 {selectedYM} 품목별 입출고 상세</h4>
                                        <button className="btn" onClick={() => setSelectedYM('')} style={{ fontSize: '0.8em' }}>← 전체 요약</button>
                                    </div>
                                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.9em' }}>
                                        <span style={{ color: '#15803d', fontWeight: 'bold' }}>총 입고: {selectedMonthData.total_in.toLocaleString()}</span>
                                        <span style={{ color: '#dc2626', fontWeight: 'bold' }}>총 출고: {selectedMonthData.total_out.toLocaleString()}</span>
                                        <span style={{ color: '#2563eb', fontWeight: 'bold' }}>차이: {(selectedMonthData.total_in - selectedMonthData.total_out).toLocaleString()}</span>
                                    </div>
                                    <table className="data-table">
                                        <thead>
                                            <tr>
                                                <th>품목명</th>
                                                <th style={{ textAlign: 'center', color: '#15803d' }}>입고</th>
                                                <th style={{ textAlign: 'center', color: '#dc2626' }}>출고</th>
                                                <th style={{ textAlign: 'center', color: '#2563eb' }}>차이</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {Object.entries(selectedMonthData.items)
                                                .sort((a, b) => (b[1].in + b[1].out) - (a[1].in + a[1].out))
                                                .map(([name, d]) => {
                                                    const diff = d.in - d.out
                                                    return (
                                                        <tr key={name}>
                                                            <td>{name}</td>
                                                            <td style={{ textAlign: 'center', color: '#15803d' }}>{d.in > 0 ? `+${d.in}` : '-'}</td>
                                                            <td style={{ textAlign: 'center', color: '#dc2626' }}>{d.out > 0 ? `-${d.out}` : '-'}</td>
                                                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: diff >= 0 ? '#2563eb' : '#dc2626' }}>
                                                                {diff > 0 ? '+' : ''}{diff !== 0 ? diff : '-'}
                                                            </td>
                                                        </tr>
                                                    )
                                                })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}

                    {/* 품목별 현황 */}
                    {!reportLoading && reportFilter === 'item' && (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>품목명</th>
                                    <th style={{ textAlign: 'center', color: '#15803d' }}>총 입고</th>
                                    <th style={{ textAlign: 'center', color: '#dc2626' }}>총 출고</th>
                                    <th style={{ textAlign: 'center', color: '#2563eb' }}>현재 잔고</th>
                                    <th style={{ textAlign: 'center' }}>상태</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.keys(byItem).length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '1rem' }}>데이터 없음</td></tr>
                                ) : Object.entries(byItem)
                                    .sort((a, b) => b[1].total_out - a[1].total_out)
                                    .map(([name, d]) => (
                                        <tr key={name}>
                                            <td><strong>{name}</strong></td>
                                            <td style={{ textAlign: 'center', color: '#15803d', fontWeight: 'bold' }}>+{d.total_in.toLocaleString()}</td>
                                            <td style={{ textAlign: 'center', color: '#dc2626', fontWeight: 'bold' }}>-{d.total_out.toLocaleString()}</td>
                                            <td style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '1.05em', color: d.balance >= 0 ? '#2563eb' : '#dc2626' }}>
                                                {d.balance.toLocaleString()}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {d.total_in === 0
                                                    ? <span style={{ color: '#94a3b8', fontSize: '0.85em' }}>입고기록없음</span>
                                                    : d.balance < 0
                                                        ? <span style={{ color: '#dc2626' }}>🚨 초과출고</span>
                                                        : d.balance === 0
                                                            ? <span style={{ color: '#f59e0b' }}>⚠️ 재고없음</span>
                                                            : <span style={{ color: '#15803d' }}>✅ 정상</span>
                                                }
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}

            {/* ── 입고 이력 뷰 */}
            {view === 'inbound' && (
                <div>
                    {inboundLoading && <div style={{ color: '#94a3b8', padding: '1rem' }}>입고 이력 로딩 중...</div>}
                    {!inboundLoading && (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>날짜</th>
                                    <th>품목명</th>
                                    <th style={{ textAlign: 'center' }}>수량</th>
                                    <th>비고</th>
                                    <th style={{ textAlign: 'center', width: '60px' }}>삭제</th>
                                </tr>
                            </thead>
                            <tbody>
                                {inboundList.length === 0 ? (
                                    <tr><td colSpan={5} style={{ textAlign: 'center', color: '#94a3b8', padding: '1.5rem' }}>
                                        입고 기록이 없습니다. ➕ 입고 등록 버튼으로 추가하세요.
                                    </td></tr>
                                ) : [...inboundList].reverse().map(rec => (
                                    <tr key={rec.row_index}>
                                        <td>{rec.date}</td>
                                        <td><strong>{rec.item_name}</strong></td>
                                        <td style={{ textAlign: 'center', color: '#15803d', fontWeight: 'bold' }}>+{Number(rec.quantity).toLocaleString()}</td>
                                        <td style={{ color: '#64748b', fontSize: '0.9em' }}>{rec.memo || '-'}</td>
                                        <td style={{ textAlign: 'center' }}>
                                            <button
                                                className="btn"
                                                onClick={() => handleDelete(rec)}
                                                disabled={deleteMutation.isPending}
                                                style={{ padding: '2px 8px', fontSize: '0.8em', color: '#dc2626', border: '1px solid #fca5a5', backgroundColor: '#fff1f2' }}
                                            >🗑️</button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            )}
        </div>
    )
}

export default Consumables

import { useState, useRef, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useToast } from '../components/Toast'
import SearchableSelect from '../components/SearchableSelect'
import { exportToXLSX, todayStr } from '../utils/exportUtils'

const AssetList = () => {
    const { type } = useParams()
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const [selectedRows, setSelectedRows] = useState(new Set())
    const [activeTab, setActiveTab] = useState('list')
    const [showDuplicateSummary, setShowDuplicateSummary] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const fileInputRef = useRef(null)
    
    // 년, 월 필터 상태 추가 (filterYears, filterMonths: 다중 선택 배열)
    const [filterYears, setFilterYears] = useState([])
    const [filterMonths, setFilterMonths] = useState([])
    const [filterYear, setFilterYear] = useState('')   // Lease/NewHire/Resign 단일선택 유지
    const [filterMonth, setFilterMonth] = useState('') // Lease/NewHire/Resign 단일선택 유지
    const [yearDropdownOpen, setYearDropdownOpen] = useState(false)
    const [monthDropdownOpen, setMonthDropdownOpen] = useState(false)
    const yearDropdownRef = useRef(null)
    const monthDropdownRef = useRef(null)
    const [filterBU, setFilterBU] = useState('')
    const [filterModel, setFilterModel] = useState('')
    const [filterUser, setFilterUser] = useState('')
    const [excludeQuery, setExcludeQuery] = useState('')
    const [onlyWithEmail, setOnlyWithEmail] = useState(false)

    // 상세 수정 모달 상태
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [editingRowIdx, setEditingRowIdx] = useState(null)
    const [modalData, setModalData] = useState({})
    const [isSaving, setIsSaving] = useState(false)

    // 기존 사용자 검색 상태
    const [isUserSearchOpen, setIsUserSearchOpen] = useState(false)
    const [userSearchQuery, setUserSearchQuery] = useState('')

    // type(경로 파라미터)가 변경될 때 필터 상태 초기화
    useEffect(() => {
        setFilterYears([])
        setFilterMonths([])
        setFilterYear('')
        setFilterMonth('')
        setFilterBU('')
        setFilterModel('')
        setFilterUser('')
        setSearchQuery('')
        setExcludeQuery('')
        setOnlyWithEmail(false)
        setSelectedRows(new Set())
        setShowDuplicateSummary(false)
        setYearDropdownOpen(false)
        setMonthDropdownOpen(false)
        setIsUserSearchOpen(false)
        setUserSearchQuery('')
    }, [type])

    // 연도 및 월 드롭다운 외부 클릭 시 닫기
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target)) {
                setYearDropdownOpen(false)
            }
            if (monthDropdownRef.current && !monthDropdownRef.current.contains(e.target)) {
                setMonthDropdownOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    const { data: assets, isLoading } = useQuery({
        queryKey: ['assets', type],
        queryFn: async () => {
            const { data } = await axios.get(`/api/assets/${type}`)
            return data
        },
        enabled: !!type
    })

    const { data: dashboardData, isLoading: isDashboardLoading } = useQuery({
        queryKey: ['dashboard_integrated'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/dashboard/integrated')
            return data
        },
        enabled: isUserSearchOpen
    })

    const assetsWithIdx = assets?.map((row, idx) => ({ ...row, _originalIdx: idx })) || []

    const columns = assets?.length > 0 ? Object.keys(assets[0]) : []

    // ── 연도/월 추출 및 데이터 필터링 ──
    const getYear = (row) => {
        if (type !== 'Lease' && type !== 'iPad' && (row['년'] || row['년도'])) return String(row['년'] || row['년도'])
        const ld = row['Lease Date'] || row['Date']
        if (!ld) return ''
        const dateStr = String(ld)
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/')
            if (parts.length === 3) {
                const yy = parts[2].trim()
                return yy.length === 2 ? '20' + yy : yy
            }
        }
        if (dateStr.includes('-')) {
            const parts = dateStr.split('-')
            if (parts[0].length === 4) return parts[0]
        }
        return ''
    }

    const getMonth = (row) => {
        if (type !== 'Lease' && type !== 'iPad' && row['월']) return String(row['월'])
        const ld = row['Lease Date'] || row['Date']
        if (!ld) return ''
        const dateStr = String(ld)
        if (dateStr.includes('/')) {
            const parts = dateStr.split('/')
            if (parts.length >= 1) return String(parseInt(parts[0]))
        }
        if (dateStr.includes('-')) {
            const parts = dateStr.split('-')
            if (parts.length >= 2) return String(parseInt(parts[1]))
        }
        return ''
    }

    const uniqueYears = Array.from(new Set(assets?.map(getYear).filter(v => v !== '' && v !== 'null' && v !== 'undefined'))).sort((a,b) => b.localeCompare(a))

    // iPad: 다중 연도 선택 토글
    const toggleYear = (year) => {
        setFilterYears(prev =>
            prev.includes(year) ? prev.filter(y => y !== year) : [...prev, year]
        )
        setFilterMonths([])
    }
    const clearYears = () => { setFilterYears([]); setFilterMonths([]) }

    // iPad: 다중 월 선택 토글
    const toggleMonth = (month) => {
        setFilterMonths(prev =>
            prev.includes(month) ? prev.filter(m => m !== month) : [...prev, month]
        )
    }
    const clearMonths = () => { setFilterMonths([]) }

    // 단일 연도 변경 시 단일 월 필터 유효성 검사
    useEffect(() => {
        if (filterYear && filterMonth) {
            const yearFilteredAssets = assets?.filter(row => getYear(row) === filterYear)
            const availableMonths = new Set(yearFilteredAssets?.map(getMonth))
            if (!availableMonths.has(filterMonth)) setFilterMonth('')
        }
    }, [filterYear])

    // 다중 연도 변경 시 다중 월 필터 유효성 검사
    useEffect(() => {
        if (filterYears.length > 0 && filterMonths.length > 0) {
            const yearFilteredAssets = assets?.filter(row => filterYears.includes(getYear(row)))
            const availableMonths = new Set(yearFilteredAssets?.map(getMonth))
            setFilterMonths(prev => prev.filter(m => availableMonths.has(m)))
        }
    }, [filterYears])

    // 월 목록: iPad는 선택된 연도들 기준, 나머지는 단일 filterYear 기준
    const activeYearFilter = type === 'iPad' ? filterYears : (filterYear ? [filterYear] : [])
    const uniqueMonths = Array.from(new Set(
        (activeYearFilter.length > 0
            ? assets?.filter(row => activeYearFilter.includes(getYear(row)))
            : assets)
            ?.map(getMonth)
            .filter(v => v !== '' && v !== 'null' && v !== 'undefined')
    )).sort((a,b) => parseInt(a) - parseInt(b))

    const getModel = (row) => row['MODEL'] || row['Model'] || row['기종'] || ''
    const getBU = (row) => row['BU'] || row['소속'] || ''
    const getUser = (row) => row['USER'] || row['User'] || row['이름'] || row['NAME'] || ''

    const uniqueBUs = Array.from(new Set(assets?.map(getBU).filter(v => v && v !== 'null' && v !== 'undefined' && v !== '-'))).sort()
    const uniqueModels = Array.from(new Set(assets?.map(getModel).filter(v => v && v !== 'null' && v !== 'undefined' && v !== '-'))).sort()
    const uniqueUsers = Array.from(new Set(assets?.map(getUser).filter(v => v && v !== 'null' && v !== 'undefined' && v !== '-'))).sort((a,b) => String(a).localeCompare(String(b)))

    // STOCK 개수 파악
    const getIsStock = (row) => {
        const u = String(row['USER'] || row['User'] || row['이름'] || '').toUpperCase()
        return u.includes('STOCK')
    }
    const stockCount = assets?.filter(getIsStock).length || 0

    let displayedAssets = assetsWithIdx
    // iPad: 다중 연도/월 필터 / 나머지: 단일 연도/월 필터
    if (type === 'iPad') {
        if (filterYears.length > 0) displayedAssets = displayedAssets?.filter(row => filterYears.includes(getYear(row)))
        if (filterMonths.length > 0) displayedAssets = displayedAssets?.filter(row => filterMonths.includes(getMonth(row)))
    } else {
        if (filterYear) displayedAssets = displayedAssets?.filter(row => getYear(row) === filterYear)
        if (filterMonth) displayedAssets = displayedAssets?.filter(row => getMonth(row) === filterMonth)
    }
    if (filterBU) displayedAssets = displayedAssets?.filter(row => getBU(row) === filterBU)

    if (filterModel) displayedAssets = displayedAssets?.filter(row => getModel(row) === filterModel)
    if (filterUser) {
        if (filterUser === 'STOCK') {
            displayedAssets = displayedAssets?.filter(getIsStock)
        } else {
            displayedAssets = displayedAssets?.filter(row => getUser(row) === filterUser)
        }
    }

    const buOptions = [
        { label: '전체 BU', value: '' },
        ...uniqueBUs.map(bu => ({ label: bu, value: bu }))
    ]

    const userOptions = [
        { label: '전체 User', value: '' },
        { label: '📦 재고 (STOCK)', value: 'STOCK' },
        ...uniqueUsers.filter(u => u.toUpperCase() !== 'STOCK').map(u => ({ label: u, value: u }))
    ]

    // ── 검색 필터링 ──
    if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim()
        displayedAssets = displayedAssets?.filter(row => {
            return Object.values(row).some(val => 
                val !== null && String(val).toLowerCase().includes(q)
            )
        })
    }

    // ── 제외 검색 필터링 ──
    if (excludeQuery.trim()) {
        const terms = excludeQuery.split(',').map(t => t.trim().toLowerCase()).filter(t => t !== '')
        if (terms.length > 0) {
            displayedAssets = displayedAssets?.filter(row => {
                return !Object.values(row).some(val => {
                    if (val === null) return false
                    const valStr = String(val).toLowerCase()
                    return terms.some(term => valStr.includes(term))
                })
            })
        }
    }

    // ── 이메일 등록됨 필터링 ──
    if (onlyWithEmail) {
        displayedAssets = displayedAssets?.filter(row => {
            const email = row['email'] || row['EMAIL'] || row['이메일'] || ''
            return email && email.trim() !== '' && email.toLowerCase() !== 'missing' && email.includes('@')
        })
    }

    // ── 중복 이메일 체크 및 그룹화 ──
    const emailToRows = {}
    if (displayedAssets) {
        displayedAssets.forEach((row) => {
            const email = row['email'] || row['EMAIL']
            if (email && email.trim() !== '' && email.toLowerCase() !== 'missing') {
                const normEmail = email.trim().toLowerCase()
                if (!emailToRows[normEmail]) emailToRows[normEmail] = []
                emailToRows[normEmail].push({ ...row })
            }
        })
    }
    const duplicateGroups = Object.keys(emailToRows)
        .filter(email => emailToRows[email].length > 1)
        .reduce((acc, email) => {
            acc[email] = emailToRows[email]
            return acc
        }, {})
    
    const duplicateEmails = Object.keys(duplicateGroups)

    // ── 상세 수정 모달 로직 ──
    const openEditModal = (row) => {
        setEditingRowIdx(row._originalIdx)
        const cleanRow = { ...row }
        delete cleanRow._originalIdx // backend doesn't need this
        setModalData(cleanRow)
        setIsModalOpen(true)
    }

    const handleModalSave = async () => {
        setIsSaving(true)
        try {
            await axios.put('/api/assets/row/update', {
                asset_type: type,
                row_index: editingRowIdx,
                updates: modalData
            })
            queryClient.invalidateQueries(['assets', type])
            addToast('상세 수정 완료', 'success')
            alert('상세 수정이 완료되었습니다.')
            setIsModalOpen(false)
        } catch (err) {
            addToast('수정 실패: ' + err.message, 'error')
            alert('수정 실패: ' + err.message)
        } finally {
            setIsSaving(false)
        }
    }

    // ── Row delete ──
    const handleDeleteSelected = async () => {
        if (selectedRows.size === 0) return
        if (!confirm(`${selectedRows.size}개 행을 삭제하시겠습니까?`)) return
        try {
            await axios.delete('/api/assets/row/delete', {
                data: { asset_type: type, row_indices: Array.from(selectedRows) }
            })
            setSelectedRows(new Set())
            queryClient.invalidateQueries(['assets', type])
            addToast(`${selectedRows.size}개 행 삭제 완료`, 'success')
        } catch (err) {
            addToast('삭제 실패', 'error')
        }
    }

    const handleDownload = async () => {
        // 현재 필터가 적용된 결과 내보내기
        const rows = (displayedAssets || []).map(row => {
            const { _originalIdx, ...rest } = row
            return rest
        })
        if (!rows.length) return
        const columns = Object.keys(rows[0]).map(k => ({ key: k, label: k }))
        await exportToXLSX({ filename: `${type}_${todayStr()}`, columns, rows })
    }

    const handleDownloadAll = () => {
        window.open(`/api/assets/${type}/download`, '_blank')
    }

    const handleFileUpload = async (e) => {
        const file = e.target.files[0]
        if (!file) return
        const formData = new FormData()
        formData.append('file', file)
        try {
            await axios.post(`/api/assets/${type}/replace`, formData)
            queryClient.invalidateQueries(['assets', type])
            addToast('파일 업로드 완료', 'success')
        } catch (err) {
            addToast('업로드 실패', 'error')
        }
    }

    const toggleSelectAll = () => {
        if (selectedRows.size === displayedAssets?.length) {
            setSelectedRows(new Set())
        } else {
            setSelectedRows(new Set(displayedAssets?.map(r => r._originalIdx)))
        }
    }

    if (isLoading) return <div className="loading"><div className="spinner" /> 데이터 로딩중...</div>
    
    if (!assets) return (
        <div className="card alert alert-danger">
            ⚠️ 데이터를 불러올 수 없습니다. 서버 연결을 확인해 주세요.
            <button className="btn btn-sm mt-2" onClick={() => queryClient.invalidateQueries(['assets', type])}>다시 시도</button>
        </div>
    )

    // ── 기존 사용자 정보 복사 로직 ──
    const filteredSearchUsers = (dashboardData || []).filter(u => {
        if (!userSearchQuery.trim()) return false
        const q = userSearchQuery.toLowerCase().trim()
        
        // 검색 대상 필드 추출
        const name = String(u['이름'] || u['NAME'] || u['USER'] || '').toLowerCase()
        const email = String(u['email'] || u['EMAIL'] || '').toLowerCase()
        const leaseList = String(u['Lease_List'] || '').toLowerCase()
        const ipadList = String(u['Ipad_List'] || '').toLowerCase()
        const printer = String(u['Printer'] || '').toLowerCase()
        const monitor = String(u['Monitor'] || '').toLowerCase()
        const teams = String(u['TeamsNum'] || '').toLowerCase()
        
        // 검색어 포함 여부 확인
        return name.includes(q) || 
               email.includes(q) || 
               leaseList.includes(q) || 
               ipadList.includes(q) || 
               printer.includes(q) || 
               monitor.includes(q) || 
               teams.includes(q)
    }).slice(0, 50) // 성능을 위해 최대 50개까지만 표시

    const handleCopyUserInfo = (user) => {
        const userName = user['이름'] || user['NAME'] || user['email']
        if (!confirm(`'${userName}' 님의 정보를 현재 입력 폼에 덮어씌우시겠습니까?`)) return
        
        const newModalData = { ...modalData }
        const colNames = Object.keys(newModalData)
        
        const mapping = {
            name: ['User', 'USER', '이름', 'NAME', '사용자'],
            email: ['email', 'EMAIL', '이메일'],
            bu: ['BU', '소속', '부서', '본부'],
            role: ['직급', '직함', 'ROLE', 'Role']
        }
        
        for (const targetField of ['name', 'email', 'bu', 'role']) {
            // 대소문자 무시하고 완벽 일치 찾기 위한 로직 (옵션)
            const matchedCol = colNames.find(c => mapping[targetField].some(m => m.toLowerCase() === c.toLowerCase()))
            if (matchedCol) {
                let val = ''
                if (targetField === 'name') val = user['이름'] || user['NAME'] || user['USER'] || ''
                if (targetField === 'email') val = user['email'] || user['EMAIL'] || user['이메일'] || ''
                if (targetField === 'bu') val = user['BU'] || user['소속'] || user['부서'] || ''
                if (targetField === 'role') val = user['ROLE'] || user['직함'] || user['직급'] || ''
                
                newModalData[matchedCol] = val
            }
        }
        
        setModalData(newModalData)
        addToast('사용자 정보가 폼에 복사되었습니다.', 'success')
        setIsUserSearchOpen(false)
        setUserSearchQuery('')
    }

    const titleMap = {
        'Lease': '💻 PC/노트북 (Lease) 관리',
        'iPad': '📱 아이패드 (iPad) 관리',
        'Monitor': '🖥 모니터 (Monitor) 관리',
        'Printer': '🖨 프린터 (Printer) 관리',
        'Teams': '📞 Teams 번호 관리',
        'All_User': '👥 전체 사용자 관리',
        'Resign': '퇴사자 관리',
        'NewHire': '신규 입사자 관리',
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-2 dashboard-header-action">
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h1 style={{ margin: 0 }}>{titleMap[type] || `${type} Management`}</h1>
                    {['Lease', 'iPad', 'Monitor'].includes(type) && (
                        <div style={{ display: 'flex', gap: '8px' }}>
                            <div style={{ backgroundColor: '#f0fdf4', color: '#166534', padding: '4px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.9rem', border: '1px solid #bbf7d0', whiteSpace: 'nowrap' }}>
                                📦 재고(STOCK): {stockCount}건
                            </div>
                            <div style={{ backgroundColor: '#eff6ff', color: '#1e3a8a', padding: '4px 12px', borderRadius: '20px', fontWeight: 'bold', fontSize: '0.9rem', border: '1px solid #bfdbfe', whiteSpace: 'nowrap' }}>
                                📋 조회된 총 수량: {displayedAssets?.length || 0}건
                            </div>
                        </div>
                    )}
                </div>
                <div className="flex gap-1" style={{ alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
                    {/* 공통 검색/제외/이메일 필터 */}
                    <div style={{ display: 'flex', gap: '5px', marginRight: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <span style={{ position: 'absolute', left: '10px', color: '#9ca3af' }}>🔍</span>
                            <input
                                className="form-input"
                                style={{ padding: '4px 10px 4px 30px', width: '130px' }}
                                placeholder="전체 검색..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                            <span style={{ position: 'absolute', left: '10px', color: '#f87171' }}>🚫</span>
                            <input
                                className="form-input"
                                style={{ padding: '4px 10px 4px 30px', width: '130px', borderColor: '#fca5a5' }}
                                placeholder="제외 검색 (쉼표로 여러 개 가능)"
                                value={excludeQuery}
                                onChange={e => setExcludeQuery(e.target.value)}
                            />
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.85rem', cursor: 'pointer', userSelect: 'none', marginLeft: '5px', whiteSpace: 'nowrap' }}>
                            <input
                                type="checkbox"
                                checked={onlyWithEmail}
                                onChange={e => setOnlyWithEmail(e.target.checked)}
                                style={{ cursor: 'pointer' }}
                            />
                            이메일 있음
                        </label>
                    </div>

                    {(type === 'NewHire' || type === 'Resign' || type === 'Lease' || type === 'iPad') && (
                        <div style={{ display: 'flex', gap: '5px', marginRight: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {/* 연도 필터: iPad는 다중 선택, 나머지는 단일 선택 */}
                            {type === 'iPad' ? (
                                <div ref={yearDropdownRef} style={{ position: 'relative' }}>
                                    <button
                                        className="form-input"
                                        onClick={() => setYearDropdownOpen(o => !o)}
                                        style={{
                                            width: 'auto', minWidth: '110px', padding: '4px 28px 4px 10px',
                                            textAlign: 'left', cursor: 'pointer', position: 'relative',
                                            background: filterYears.length > 0 ? '#eff6ff' : '',
                                            color: filterYears.length > 0 ? '#1d4ed8' : '',
                                            fontWeight: filterYears.length > 0 ? 'bold' : 'normal',
                                            borderColor: filterYears.length > 0 ? '#93c5fd' : '',
                                        }}
                                    >
                                        {filterYears.length === 0
                                            ? '전체 연도'
                                            : filterYears.length === 1
                                                ? `${filterYears[0]}년`
                                                : `${filterYears.length}개 연도`}
                                        <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: '#6b7280' }}>
                                            {yearDropdownOpen ? '▲' : '▼'}
                                        </span>
                                    </button>
                                    {yearDropdownOpen && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, zIndex: 1000,
                                            background: 'white', border: '1px solid #e5e7eb',
                                            borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                                            minWidth: '140px', padding: '6px 0', marginTop: '4px',
                                        }}>
                                            {/* 전체 선택 해제 */}
                                            <div
                                                onClick={clearYears}
                                                style={{
                                                    padding: '6px 14px', cursor: 'pointer', fontSize: '0.85em',
                                                    color: filterYears.length === 0 ? '#1d4ed8' : '#6b7280',
                                                    fontWeight: filterYears.length === 0 ? 'bold' : 'normal',
                                                    borderBottom: '1px solid #f3f4f6',
                                                    display: 'flex', alignItems: 'center', gap: '8px',
                                                }}
                                            >
                                                <span style={{
                                                    width: '14px', height: '14px', borderRadius: '3px', border: '1.5px solid #d1d5db',
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                    background: filterYears.length === 0 ? '#1d4ed8' : 'white',
                                                }}>
                                                    {filterYears.length === 0 && <span style={{ color: 'white', fontSize: '10px', lineHeight: 1 }}>✓</span>}
                                                </span>
                                                전체 연도
                                            </div>
                                            {uniqueYears.map(y => {
                                                const checked = filterYears.includes(y)
                                                return (
                                                    <div
                                                        key={y}
                                                        onClick={() => toggleYear(y)}
                                                        style={{
                                                            padding: '6px 14px', cursor: 'pointer', fontSize: '0.85em',
                                                            color: checked ? '#1d4ed8' : '#374151',
                                                            background: checked ? '#eff6ff' : 'transparent',
                                                            display: 'flex', alignItems: 'center', gap: '8px',
                                                        }}
                                                        onMouseEnter={e => { if (!checked) e.currentTarget.style.background = '#f9fafb' }}
                                                        onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent' }}
                                                    >
                                                        <span style={{
                                                            width: '14px', height: '14px', borderRadius: '3px', border: `1.5px solid ${checked ? '#1d4ed8' : '#d1d5db'}`,
                                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                            background: checked ? '#1d4ed8' : 'white',
                                                        }}>
                                                            {checked && <span style={{ color: 'white', fontSize: '10px', lineHeight: 1 }}>✓</span>}
                                                        </span>
                                                        {y}년
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <select className="form-input" style={{ width: 'auto', padding: '4px 8px' }} value={filterYear} onChange={e => setFilterYear(e.target.value)}>
                                    <option value="">전체 연도</option>
                                    {uniqueYears.map(y => <option key={y} value={y}>{y}년</option>)}
                                </select>
                            )}

                            {/* 월 필터: iPad는 다중 선택, 나머지는 단일 선택 */}
                            {type === 'iPad' ? (
                                <div ref={monthDropdownRef} style={{ position: 'relative' }}>
                                    <button
                                        className="form-input"
                                        onClick={() => setMonthDropdownOpen(o => !o)}
                                        style={{
                                            width: 'auto', minWidth: '100px', padding: '4px 28px 4px 10px',
                                            textAlign: 'left', cursor: 'pointer', position: 'relative',
                                            background: filterMonths.length > 0 ? '#eff6ff' : '',
                                            color: filterMonths.length > 0 ? '#1d4ed8' : '',
                                            fontWeight: filterMonths.length > 0 ? 'bold' : 'normal',
                                            borderColor: filterMonths.length > 0 ? '#93c5fd' : '',
                                        }}
                                    >
                                        {filterMonths.length === 0
                                            ? '전체 월'
                                            : filterMonths.length === 1
                                                ? `${filterMonths[0]}월`
                                                : `${filterMonths.length}개 월`}
                                        <span style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', fontSize: '10px', color: '#6b7280' }}>
                                            {monthDropdownOpen ? '▲' : '▼'}
                                        </span>
                                    </button>
                                    {monthDropdownOpen && (
                                        <div style={{
                                            position: 'absolute', top: '100%', left: 0, zIndex: 1000,
                                            background: 'white', border: '1px solid #e5e7eb',
                                            borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                                            minWidth: '130px', padding: '6px 0', marginTop: '4px',
                                        }}>
                                            {/* 전체 선택 해제 */}
                                            <div
                                                onClick={clearMonths}
                                                style={{
                                                    padding: '6px 14px', cursor: 'pointer', fontSize: '0.85em',
                                                    color: filterMonths.length === 0 ? '#1d4ed8' : '#6b7280',
                                                    fontWeight: filterMonths.length === 0 ? 'bold' : 'normal',
                                                    borderBottom: '1px solid #f3f4f6',
                                                    display: 'flex', alignItems: 'center', gap: '8px',
                                                }}
                                            >
                                                <span style={{
                                                    width: '14px', height: '14px', borderRadius: '3px', border: '1.5px solid #d1d5db',
                                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                    background: filterMonths.length === 0 ? '#1d4ed8' : 'white',
                                                }}>
                                                    {filterMonths.length === 0 && <span style={{ color: 'white', fontSize: '10px', lineHeight: 1 }}>✓</span>}
                                                </span>
                                                전체 월
                                            </div>
                                            {uniqueMonths.map(m => {
                                                const checked = filterMonths.includes(m)
                                                return (
                                                    <div
                                                        key={m}
                                                        onClick={() => toggleMonth(m)}
                                                        style={{
                                                            padding: '6px 14px', cursor: 'pointer', fontSize: '0.85em',
                                                            color: checked ? '#1d4ed8' : '#374151',
                                                            background: checked ? '#eff6ff' : 'transparent',
                                                            display: 'flex', alignItems: 'center', gap: '8px',
                                                        }}
                                                        onMouseEnter={e => { if (!checked) e.currentTarget.style.background = '#f9fafb' }}
                                                        onMouseLeave={e => { if (!checked) e.currentTarget.style.background = 'transparent' }}
                                                    >
                                                        <span style={{
                                                            width: '14px', height: '14px', borderRadius: '3px', border: `1.5px solid ${checked ? '#1d4ed8' : '#d1d5db'}`,
                                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                                            background: checked ? '#1d4ed8' : 'white',
                                                        }}>
                                                            {checked && <span style={{ color: 'white', fontSize: '10px', lineHeight: 1 }}>✓</span>}
                                                        </span>
                                                        {m}월
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <select className="form-input" style={{ width: 'auto', padding: '4px 8px' }} value={filterMonth} onChange={e => setFilterMonth(e.target.value)}>
                                    <option value="">전체 월</option>
                                    {uniqueMonths.map(m => <option key={m} value={m}>{m}월</option>)}
                                </select>
                            )}

                            <div style={{ width: '160px' }}>
                                <SearchableSelect
                                    options={buOptions}
                                    value={filterBU}
                                    onChange={setFilterBU}
                                    placeholder="전체 BU"
                                    width="100%"
                                />
                            </div>
                            <div style={{ width: '160px' }}>
                                <SearchableSelect
                                    options={userOptions}
                                    value={filterUser}
                                    onChange={setFilterUser}
                                    placeholder="전체 User"
                                    width="100%"
                                />
                            </div>
                            <select className="form-input" style={{ width: 'auto', maxWidth: '140px', padding: '4px 8px' }} value={filterModel} onChange={e => setFilterModel(e.target.value)}>
                                <option value="">전체 Model</option>
                                {uniqueModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    )}
                    {/* Printer: Model 필터 */}
                    {type === 'Printer' && (
                        <div style={{ display: 'flex', gap: '5px', marginRight: '10px', alignItems: 'center' }}>
                            <select className="form-input" style={{ width: 'auto', maxWidth: '160px', padding: '4px 8px' }} value={filterModel} onChange={e => setFilterModel(e.target.value)}>
                                <option value="">전체 Model</option>
                                {uniqueModels.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                    )}
                    {selectedRows.size > 0 && (
                        <button className="btn btn-danger btn-sm" onClick={handleDeleteSelected}>
                            🗑 {selectedRows.size}개 삭제
                        </button>
                    )}
                    <button className="btn btn-sm" onClick={handleDownload} style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #86efac', fontWeight: '600' }}>📥 필터 결과 내보내기</button>
                    <button className="btn btn-sm" onClick={handleDownloadAll}>📋 전체 다운로드</button>
                    <button className="btn btn-sm" onClick={() => queryClient.invalidateQueries(['assets', type])}>🔄 새로고침</button>
                </div>
            </div>

            <div className="tabs">
                <button className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>
                    📋 {type === 'Lease' ? '리스 목록' : type === 'iPad' ? '아이패드 목록' : '리스트 편집'}
                </button>
                {type !== 'Lease' && type !== 'iPad' && <button className={`tab-btn ${activeTab === 'upload' ? 'active' : ''}`} onClick={() => setActiveTab('upload')}>📂 파일 등록</button>}
            </div>

            {activeTab === 'list' && (
                <div className="card" style={{ padding: 0 }}>
                    {duplicateEmails.length > 0 && (
                        <div className="alert alert-danger" style={{ margin: '1rem', borderRadius: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>🚨 <strong>중복 이메일 감지</strong>: 현재 리스트에 {duplicateEmails.length}개의 중복된 이메일 주소가 있습니다.</div>
                            <button className="btn btn-danger btn-sm" onClick={() => setShowDuplicateSummary(!showDuplicateSummary)}>
                                {showDuplicateSummary ? '요약 닫기' : '중복 내역 보기'}
                            </button>
                        </div>
                    )}

                    {showDuplicateSummary && duplicateEmails.length > 0 && (
                        <div style={{ margin: '0 1rem 1rem', padding: '1rem', backgroundColor: '#fff5f5', border: '1px solid #feb2b2', borderRadius: '0.5rem' }}>
                            <h4 style={{ margin: '0 0 0.5rem', color: '#c53030' }}>📍 중복 할당 상세 내역</h4>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '10px' }}>
                                {duplicateEmails.map(email => (
                                    <div key={email} style={{ padding: '8px', backgroundColor: 'white', border: '1px solid #fed7d7', borderRadius: '4px' }}>
                                        <div style={{ fontWeight: 'bold', borderBottom: '1px solid #eee', marginBottom: '4px', paddingBottom: '2px', color: '#e53e3e' }}>{email}</div>
                                        {duplicateGroups[email].map((r, i) => (
                                            <div key={i} style={{ fontSize: '0.85rem', color: '#4a5568', padding: '4px 0', borderTop: i > 0 ? '1px dashed #edf2f7' : 'none' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: '500' }}>
                                                    <span>• {r['S/N'] || r['Model'] || 'ID 미상'}</span>
                                                    <span style={{ color: '#2d3748' }}>{r['User'] || r['USER'] || r['이름'] || '-'}</span>
                                                </div>
                                                {(r['Additional Information'] || r['참고']) && (
                                                    <div style={{ paddingLeft: '12px', fontSize: '0.75rem', color: '#718096', fontStyle: 'italic' }}>
                                                        💬 {r['Additional Information'] || r['참고']}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {displayedAssets?.length > 0 ? (
                        <div className="table-wrapper" style={{ maxHeight: '65vh', overflow: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: '40px' }}>
                                            <input type="checkbox" onChange={toggleSelectAll} checked={selectedRows.size === displayedAssets?.length && displayedAssets?.length > 0} />
                                        </th>
                                        <th style={{ width: '80px' }}>관리</th>
                                        {columns.map(col => <th key={col}>{col}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {displayedAssets.map((row, idx) => (
                                        <tr key={idx}>
                                            <td className="checkbox-cell">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedRows.has(row._originalIdx)}
                                                    onChange={(e) => {
                                                        const newSet = new Set(selectedRows)
                                                        e.target.checked ? newSet.add(row._originalIdx) : newSet.delete(row._originalIdx)
                                                        setSelectedRows(newSet)
                                                    }}
                                                />
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                <button className="btn btn-secondary" style={{ padding: '2px 8px', fontSize: '0.8em' }} onClick={() => openEditModal(row)}>상세 수정</button>
                                            </td>
                                            {columns.map(col => {
                                                const val = row[col] !== null ? String(row[col]) : '-'
                                                const isEmailCol = col.toLowerCase() === 'email'
                                                const isDuplicate = isEmailCol && val !== '-' && duplicateEmails.includes(val.trim().toLowerCase())
                                                
                                                return (
                                                    <td
                                                        key={col}
                                                        style={{ 
                                                            padding: '8px',
                                                            backgroundColor: isDuplicate ? '#fee2e2' : '',
                                                            color: isDuplicate ? '#dc2626' : '',
                                                            fontWeight: isDuplicate ? 'bold' : 'normal'
                                                        }}
                                                    >
                                                        <span>{val}</span>
                                                    </td>
                                                )
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div style={{ padding: '2rem', textAlign: 'center', color: '#6b7280' }}>데이터가 없습니다.</div>
                    )}
                </div>
            )}

            {activeTab === 'upload' && type !== 'Lease' && (
                <div className="card">
                    <h3>📂 파일 업로드로 테이블 교체</h3>
                    <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
                        CSV 또는 Excel 파일을 업로드하면 현재 {type} 테이블의 데이터가 교체됩니다.
                    </p>
                    <div
                        className="upload-area"
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <p style={{ fontSize: '2rem', margin: '0 0 0.5rem' }}>📁</p>
                        <p style={{ fontWeight: 500 }}>클릭하여 파일 선택</p>
                        <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>CSV, XLSX 파일 지원</p>
                        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileUpload} />
                    </div>
                </div>
            )}

            {isModalOpen && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
                    <div className="card modal" style={{ width: '90%', maxWidth: '800px', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: '#fff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', padding: '1rem', borderBottom: '1px solid #eee' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <h3 style={{ margin: 0 }}>📍 상세 정보 수정</h3>
                                <button className="btn btn-sm" onClick={() => setIsUserSearchOpen(!isUserSearchOpen)} style={{ backgroundColor: isUserSearchOpen ? '#eff6ff' : '#f3f4f6', color: isUserSearchOpen ? '#1d4ed8' : '#374151', border: `1px solid ${isUserSearchOpen ? '#bfdbfe' : '#d1d5db'}` }}>
                                    🔍 {isUserSearchOpen ? '사용자/기기 검색 닫기' : '기존 사용자 정보 불러오기'}
                                </button>
                            </div>
                            <button className="btn btn-secondary" onClick={() => { setIsModalOpen(false); setIsUserSearchOpen(false); }}>✖</button>
                        </div>
                        
                        {isUserSearchOpen && (
                            <div style={{ padding: '0 1.5rem 1rem 1.5rem', borderBottom: '1px solid #eee', backgroundColor: '#f8fafc' }}>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="이름, 이메일, 기존 기기 S/N 등을 검색하세요..."
                                        value={userSearchQuery}
                                        onChange={(e) => setUserSearchQuery(e.target.value)}
                                        style={{ flex: 1 }}
                                    />
                                </div>
                                {isDashboardLoading ? (
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>데이터를 불러오는 중입니다...</div>
                                ) : filteredSearchUsers.length > 0 ? (
                                    <div style={{ maxHeight: '200px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '6px', backgroundColor: '#fff' }}>
                                        {filteredSearchUsers.map((u, idx) => (
                                            <div 
                                                key={idx}
                                                style={{ padding: '10px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                                onClick={() => handleCopyUserInfo(u)}
                                            >
                                                <div>
                                                    <div style={{ fontWeight: 'bold', fontSize: '0.9rem' }}>{u['이름'] || u['NAME'] || u['USER'] || '-'} <span style={{ fontSize: '0.8rem', color: '#64748b', fontWeight: 'normal' }}>({u['email'] || u['EMAIL'] || '-'})</span></div>
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px' }}>
                                                        {u['BU'] || u['소속'] || '-'} | 노트북: {u['Lease_List'] || '-'} | 아이패드: {u['Ipad_List'] || '-'}
                                                    </div>
                                                </div>
                                                <button className="btn btn-sm" style={{ backgroundColor: '#e0e7ff', color: '#4338ca', border: 'none', padding: '4px 10px', fontSize: '0.8rem', borderRadius: '4px' }} onClick={(e) => { e.stopPropagation(); handleCopyUserInfo(u); }}>
                                                    복사
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                ) : userSearchQuery.trim() ? (
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>검색 결과가 없습니다.</div>
                                ) : (
                                    <div style={{ fontSize: '0.85rem', color: '#64748b' }}>검색어를 입력하시면 기존 등록된 사용자와 기기 목록이 표시됩니다.</div>
                                )}
                            </div>
                        )}

                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.5rem' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                                {columns.map(col => (
                                    <div key={col} className="form-group">
                                        <label className="form-label">{col}</label>
                                        <input 
                                            className="form-input"
                                            value={modalData[col] !== null ? String(modalData[col]) : ''} 
                                            onChange={e => setModalData({ ...modalData, [col]: e.target.value })}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div style={{ padding: '1rem', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)} disabled={isSaving}>취소</button>
                            <button className="btn btn-primary" onClick={handleModalSave} disabled={isSaving}>
                                {isSaving ? '⏳ 저장 중...' : '💾 모든 변경사항 저장'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default AssetList

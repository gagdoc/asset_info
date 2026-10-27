import { useState, useRef, useEffect, useMemo } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useToast } from '../components/Toast'
import SearchableSelect from '../components/SearchableSelect'
import { exportToXLSX, todayStr } from '../utils/exportUtils'

// 날짜 파싱 헬퍼 (YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD, MM/DD/YY, MM/DD/YYYY, YYYYMMDD 지원)
export const parseFlexibleDate = (dateStr) => {
    if (!dateStr) return null
    const s = String(dateStr).trim()
    if (!s || s === '-' || s.toLowerCase() === 'nan' || s.toLowerCase() === 'none') return null

    // 1) YYYY-MM-DD or YYYY.MM.DD or YYYY/MM/DD
    const ymdMatch = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})/)
    if (ymdMatch) {
        return new Date(parseInt(ymdMatch[1]), parseInt(ymdMatch[2]) - 1, parseInt(ymdMatch[3]))
    }

    // 2) MM/DD/YY or MM/DD/YYYY
    const mdyMatch = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/)
    if (mdyMatch) {
        let yr = parseInt(mdyMatch[3])
        if (yr < 100) yr += 2000
        return new Date(yr, parseInt(mdyMatch[1]) - 1, parseInt(mdyMatch[2]))
    }

    // 3) YYYYMMDD (8자리 숫자)
    if (/^\d{8}$/.test(s)) {
        const yr = parseInt(s.substring(0, 4))
        const mo = parseInt(s.substring(4, 6)) - 1
        const da = parseInt(s.substring(6, 8))
        return new Date(yr, mo, da)
    }

    const parsed = new Date(s)
    return isNaN(parsed.getTime()) ? null : parsed
}

// 리스 / 약정 종료 상태 판정 헬퍼 (노트북 리스 및 아이패드 통신 약정 공통)
export const getLeaseStatus = (endDateStr) => {
    if (!endDateStr || String(endDateStr).trim() === '' || String(endDateStr).trim() === '-') {
        return { status: 'none', label: '미등록', dDay: null, color: '#94a3b8', bg: '#f1f5f9' }
    }
    const trimmed = String(endDateStr).trim()
    if (trimmed === '약정미가입상태' || trimmed === '미가입') {
        return { status: 'unregistered', label: '미가입', dDay: null, color: '#64748b', bg: '#f1f5f9' }
    }
    if (trimmed === '찾지 못함' || trimmed === '확인불가') {
        return { status: 'not_found', label: '확인불가', dDay: null, color: '#64748b', bg: '#f1f5f9' }
    }
    const targetDate = parseFlexibleDate(endDateStr)
    if (!targetDate) {
        return { status: 'invalid', label: trimmed, dDay: null, color: '#64748b', bg: '#f8fafc' }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    targetDate.setHours(0, 0, 0, 0)

    const diffTime = targetDate.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays < 0) {
        return { status: 'expired', label: `만료 (D+${Math.abs(diffDays)})`, dDay: diffDays, color: '#dc2626', bg: '#fee2e2' }
    } else if (diffDays <= 30) {
        return { status: 'd30', label: `30일내 (D-${diffDays})`, dDay: diffDays, color: '#ea580c', bg: '#ffedd5' }
    } else if (diffDays <= 60) {
        return { status: 'd60', label: `60일내 (D-${diffDays})`, dDay: diffDays, color: '#ca8a04', bg: '#fef9c3' }
    } else if (diffDays <= 90) {
        return { status: 'd90', label: `90일내 (D-${diffDays})`, dDay: diffDays, color: '#ca8a04', bg: '#fef9c3' }
    } else {
        return { status: 'normal', label: `정상 (D-${diffDays})`, dDay: diffDays, color: '#16a34a', bg: '#dcfce7' }
    }
}

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
    const [filterContract, setFilterContract] = useState('')
    const [filterModel, setFilterModel] = useState('')
    const [filterUser, setFilterUser] = useState('')
    const [excludeQuery, setExcludeQuery] = useState('')
    const [onlyWithEmail, setOnlyWithEmail] = useState(false)
    const [filterLeaseStatus, setFilterLeaseStatus] = useState('') // '' | 'd90'

    // 열(컬럼) 숨김/표시 상태 (type별 로컬 스토리지 유지)
    const [hiddenColumns, setHiddenColumns] = useState(() => {
        try {
            const saved = localStorage.getItem(`hidden_columns_${type}`)
            return saved ? JSON.parse(saved) : []
        } catch {
            return []
        }
    })
    const [colDropdownOpen, setColDropdownOpen] = useState(false)
    const colDropdownRef = useRef(null)

    // 상세 수정/신규 추가 모달 상태
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isCreateMode, setIsCreateMode] = useState(false)
    const [editingRowIdx, setEditingRowIdx] = useState(null)
    const [modalData, setModalData] = useState({})
    const [isSaving, setIsSaving] = useState(false)

    // 기존 사용자 검색 상태
    const [isUserSearchOpen, setIsUserSearchOpen] = useState(false)
    const [userSearchQuery, setUserSearchQuery] = useState('')

    // 자산 변경 이력 조회 모달 상태
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false)
    const [assetHistories, setAssetHistories] = useState([])
    const [isLoadingHistory, setIsLoadingHistory] = useState(false)

    // ServiceNow Chrome Extension 브릿지 상태
    const [isBridgeReady, setIsBridgeReady] = useState(false)
    const [isSnowSyncing, setIsSnowSyncing] = useState(false)
    const [snowSyncStatus, setSnowSyncStatus] = useState(null)

    useEffect(() => {
        const handleMsg = (e) => {
            if (e.data?.type === 'SNOW_BRIDGE_AVAILABLE') {
                setIsBridgeReady(true)
            }
        }
        window.addEventListener('message', handleMsg)
        return () => window.removeEventListener('message', handleMsg)
    }, [])

    // type(경로 파라미터)가 변경될 때 필터 상태 초기화 및 해당 type의 열 설정 로드
    useEffect(() => {
        setFilterYears([])
        setFilterMonths([])
        setFilterYear('')
        setFilterMonth('')
        setFilterContract('')
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
        setFilterLeaseStatus('')
        setColDropdownOpen(false)
        try {
            const saved = localStorage.getItem(`hidden_columns_${type}`)
            setHiddenColumns(saved ? JSON.parse(saved) : [])
        } catch {
            setHiddenColumns([])
        }
    }, [type])

    const updateHiddenColumns = (newHidden) => {
        setHiddenColumns(newHidden)
        try {
            localStorage.setItem(`hidden_columns_${type}`, JSON.stringify(newHidden))
        } catch {}
    }

    // 연도, 월 및 열 선택 드롭다운 외부 클릭 시 닫기
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (yearDropdownRef.current && !yearDropdownRef.current.contains(e.target)) {
                setYearDropdownOpen(false)
            }
            if (monthDropdownRef.current && !monthDropdownRef.current.contains(e.target)) {
                setMonthDropdownOpen(false)
            }
            if (colDropdownRef.current && !colDropdownRef.current.contains(e.target)) {
                setColDropdownOpen(false)
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
        queryKey: ['dashboard_search_candidates'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/dashboard/search-candidates')
            return data
        },
        enabled: isUserSearchOpen || isModalOpen,
        staleTime: 60000 // Cache for 1 minute
    })

    const assetsWithIdx = assets?.map((row, idx) => ({ ...row, _originalIdx: idx })) || []

    // iPad 60일(2달) 이내 만료 예정 단말 수 계산
    const ipadExpiringCount = useMemo(() => {
        if (type !== 'iPad' || !assets) return 0
        return assets.filter(row => {
            const endVal = row['약정만료일'] || ''
            const st = getLeaseStatus(endVal)
            return st.dDay !== null && st.dDay >= 0 && st.dDay <= 60
        }).length
    }, [type, assets])

    const PRINTER_HIDDEN_COLS_LOWER = ['date', '카트리지 사용 내역']

    const columns = assets?.length > 0
        ? Object.keys(assets[0]).filter(col => {
            const trimmed = col.trim()
            if (/^unnamed[\s_:.\-]*\d*$/i.test(trimmed)) return false
            if (type === 'Printer' && PRINTER_HIDDEN_COLS_LOWER.includes(trimmed.toLowerCase())) return false
            return true
        })
        : []

    // 사용자가 숨김 설정한 열을 제외한 실제 표시할 열 목록
    const visibleColumns = columns.filter(col => !hiddenColumns.includes(col))

    // ── 연도/월 추출 및 데이터 필터링 ──
    const getYear = (row) => {
        if (type !== 'Lease' && type !== 'iPad' && (row['년'] || row['년도'])) return String(row['년'] || row['년도'])
        const ld = row['Lease Date'] || row['Date'] || row['약정시작일']
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
        const ld = row['Lease Date'] || row['Date'] || row['약정시작일']
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
    const getUser = (row) => row['USER'] || row['User'] || row['이름'] || row['NAME'] || ''
    const getLeaseContractNo = (row) => row['리스계번호'] || row['리스계약번호'] || row['계약번호'] || row['Lease Contract No'] || ''

    const uniqueContracts = Array.from(new Set(
        assets?.map(getLeaseContractNo).filter(v => v && v !== 'null' && v !== 'undefined' && v !== '-')
    )).sort()
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

    if (filterContract) displayedAssets = displayedAssets?.filter(row => getLeaseContractNo(row) === filterContract)

    if (filterModel) displayedAssets = displayedAssets?.filter(row => getModel(row) === filterModel)
    if (filterUser) {
        if (filterUser === 'STOCK') {
            displayedAssets = displayedAssets?.filter(getIsStock)
        } else {
            displayedAssets = displayedAssets?.filter(row => getUser(row) === filterUser)
        }
    }

    if (type === 'Lease' && filterLeaseStatus) {
        displayedAssets = displayedAssets?.filter(row => {
            const endVal = row['리스 종료 일자'] || row['리스 종료일'] || row['Lease End Date'] || ''
            const st = getLeaseStatus(endVal)
            if (filterLeaseStatus === 'd90') {
                return st.dDay !== null && st.dDay >= 0 && st.dDay <= 90
            }
            return st.status === filterLeaseStatus
        })
    }

    if (type === 'iPad' && filterLeaseStatus) {
        displayedAssets = displayedAssets?.filter(row => {
            const endVal = row['약정만료일'] || ''
            const st = getLeaseStatus(endVal)
            if (filterLeaseStatus === 'd60') {
                return st.dDay !== null && st.dDay >= 0 && st.dDay <= 60
            } else if (filterLeaseStatus === 'd30') {
                return st.dDay !== null && st.dDay >= 0 && st.dDay <= 30
            } else if (filterLeaseStatus === 'expired') {
                return st.status === 'expired'
            } else if (filterLeaseStatus === 'unregistered') {
                return st.status === 'unregistered' || st.status === 'not_found' || st.status === 'none'
            }
            return st.status === filterLeaseStatus
        })
    }

    const contractOptions = [
        { label: '전체 계약번호', value: '' },
        ...uniqueContracts.map(c => ({ label: c, value: c }))
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

    const syncToServiceNowPromise = (payload) => {
        return new Promise((resolve) => {
            const timeoutId = setTimeout(() => {
                window.removeEventListener('message', responseHandler)
                resolve({ success: false, error: 'ServiceNow 응답 시간 초과 (15초). 확장이 설치되어 있고 ServiceNow 탭이 열려있는지 확인하세요.' })
            }, 15000)

            const responseHandler = (e) => {
                if (e.data?.type === 'SNOW_SYNC_RESPONSE') {
                    clearTimeout(timeoutId)
                    window.removeEventListener('message', responseHandler)
                    resolve(e.data.result)
                }
            }
            window.addEventListener('message', responseHandler)
            window.postMessage({ type: 'SNOW_SYNC_REQUEST', payload }, '*')
        })
    }

    const handleOpenServiceNowPage = (sn, customData = null) => {
        if (!sn) {
            alert('시리얼 번호(S/N)가 입력되지 않았습니다.')
            return
        }
        const cleanSn = String(sn).trim()
        const targetUrl = `https://strykercorp.service-now.com/now/nav/ui/classic/params/target/alm_hardware.do%3Fsysparm_query%3Dserial_number%3D${encodeURIComponent(cleanSn)}`
        
        const autoFill = customData || {
            serial_number: cleanSn,
            state: modalData['State'] || 'In use',
            substate: modalData['Substate'] || '-- None --',
            email: modalData['email'] || modalData['EMAIL'] || '',
            user: modalData['User'] || modalData['NAME'] || modalData['이름'] || '',
            stockroom: modalData['Stockroom'] || 'Korea Stock Room',
            location: modalData['Location'] || '',
            department: modalData['Department'] || modalData['BU'] || '',
            company: modalData['Company'] || 'Asia Pacific'
        }

        // 확장 프로그램이 준비되어 있으면 열려있는 ServiceNow 탭을 해당 페이지로 즉시 이동하고 폼 자동채우기 예약
        if (isBridgeReady) {
            window.postMessage({
                type: 'SNOW_NAVIGATE_REQUEST',
                payload: { url: targetUrl, autoFill }
            }, '*')
            addToast(`🌐 ServiceNow '${cleanSn}' 페이지로 이동하며 사용자/정보를 자동 입력합니다.`, 'info')
        } else {
            // 확장이 없으면 브라우저 새 탭으로 열기
            window.open(targetUrl, '_blank')
        }
    }

    // ── 상세 수정 / 신규 추가 모달 로직 ──
    const openEditModal = (row) => {
        setIsCreateMode(false)
        setEditingRowIdx(row._originalIdx)
        const cleanRow = { ...row }
        delete cleanRow._originalIdx // backend doesn't need this
        if (type === 'Lease') {
            if (!cleanRow['State']) cleanRow['State'] = cleanRow['install_status'] || 'In use'
            if (!cleanRow['Substate']) cleanRow['Substate'] = cleanRow['substatus'] || '-- None --'
            if (!cleanRow['Stockroom']) cleanRow['Stockroom'] = cleanRow['stockroom'] || 'Korea Stock Room'
            if (!cleanRow['Location']) cleanRow['Location'] = cleanRow['location'] || 'Seoul, Seoul 517 Yeongdong-daero, 6th Floor, ASEM Tower - SALES'
            if (!cleanRow['Department']) cleanRow['Department'] = cleanRow['department'] || cleanRow['BU'] || ''
            if (!cleanRow['Company']) cleanRow['Company'] = cleanRow['company'] || 'Asia Pacific'
        }
        setModalData(cleanRow)
        setSnowSyncStatus(null)
        setIsModalOpen(true)
    }

    const openAddModal = () => {
        setIsCreateMode(true)
        setEditingRowIdx(null)
        const initialData = {}
        columns.forEach(col => {
            initialData[col] = ''
        })
        if (type === 'Lease') {
            initialData['State'] = 'In use'
            initialData['Substate'] = '-- None --'
            initialData['Stockroom'] = 'Korea Stock Room'
            initialData['Location'] = 'Seoul, Seoul 517 Yeongdong-daero, 6th Floor, ASEM Tower - SALES'
            initialData['Department'] = ''
            initialData['Company'] = 'Asia Pacific'
        }
        setModalData(initialData)
        setSnowSyncStatus(null)
        setIsModalOpen(true)
    }

    const handleStateChange = (newState) => {
        const updated = { ...modalData, State: newState }
        if (newState === 'In stock') {
            if (!updated['Stockroom']) updated['Stockroom'] = 'Korea Stock Room'
            updated['User'] = 'STOCK'
            if (updated.hasOwnProperty('NAME')) updated['NAME'] = 'STOCK'
            if (updated.hasOwnProperty('이름')) updated['이름'] = 'STOCK'
            updated['Substate'] = '-- None --'
        } else if (newState === 'In use') {
            if (updated['User'] === 'STOCK') {
                updated['User'] = ''
            }
            if (!updated['Substate'] || updated['Substate'] === '-- None --') {
                updated['Substate'] = 'Staff'
            }
        }
        setModalData(updated)
    }

    const handleModalSave = async (syncToSnow = false) => {
        setIsSaving(true)
        try {
            if (isCreateMode) {
                await axios.post('/api/assets/row/add', {
                    asset_type: type,
                    row_data: modalData
                })
                queryClient.invalidateQueries(['assets', type])
                addToast('신규 항목 추가 완료', 'success')
            } else {
                await axios.put('/api/assets/row/update', {
                    asset_type: type,
                    row_index: editingRowIdx,
                    updates: modalData
                })
                queryClient.invalidateQueries(['assets', type])
                addToast('구글 시트 저장 완료', 'success')
            }

            // ServiceNow 실시간 동기화 요청 (syncToSnow=true 인 경우)
            if (syncToSnow && type === 'Lease') {
                const sn = modalData['S/N'] || modalData['Serial'] || modalData['일련번호']
                if (!sn) {
                    alert('시리얼 번호(S/N)가 입력되지 않아 ServiceNow에 동기화할 수 없습니다.')
                } else if (!isBridgeReady) {
                    alert('⚠️ ServiceNow Bridge 확장 프로그램이 준비되지 않았습니다.\n1) Chrome 확장 프로그램이 로드되어 있는지 확인하세요.\n2) 새 탭에서 Stryker ServiceNow(strykercorp.service-now.com)에 로그인해 두어야 합니다.')
                } else {
                    setIsSnowSyncing(true)
                    addToast('🌐 ServiceNow로 데이터 전송 중...', 'info')
                    const isStock = (modalData['State'] || '').toLowerCase() === 'in stock'
                    const userOrEmail = modalData['email'] || modalData['EMAIL'] || modalData['User'] || modalData['NAME'] || modalData['이름'] || ''
                    const snowPayload = {
                        serial_number: String(sn).trim(),
                        updates: {
                            install_status: modalData['State'] || 'In use',
                            substatus: modalData['Substate'] === '-- None --' ? '' : (modalData['Substate'] || ''),
                            assigned_to: isStock ? '' : userOrEmail,
                            stockroom: isStock ? (modalData['Stockroom'] || 'Korea Stock Room') : '',
                            location: modalData['Location'] || '',
                            department: modalData['Department'] || modalData['BU'] || '',
                            company: modalData['Company'] || 'Asia Pacific'
                        }
                    }

                    const snowRes = await syncToServiceNowPromise(snowPayload)
                    setIsSnowSyncing(false)
                    if (snowRes && snowRes.success) {
                        setSnowSyncStatus('success')
                        addToast(`✅ ${snowRes.message || 'ServiceNow 자산 자동 반영 성공!'}`, 'success')
                        const targetInfo = isStock ? `Stockroom: ${snowPayload.updates.stockroom}` : `Assigned to: ${userOrEmail}`
                        alert(`🎉 구글 시트 저장 완료!\n- S/N: ${sn}\n- State: ${modalData['State']}\n- ${targetInfo}\n- Location: ${modalData['Location']}\n\nServiceNow 화면으로 이동하여 정보가 자동 입력됩니다.\n화면의 내용을 확인하신 후 상단 [Save / Update]를 눌러주세요!`)
                    } else {
                        setSnowSyncStatus('error')
                        const errMsg = snowRes?.error || '알 수 없는 오류'
                        addToast(`⚠️ ServiceNow 동기화 실패: ${errMsg}`, 'error')
                        alert(`⚠️ 구글 시트에는 저장되었으나 ServiceNow 반영 실패:\n${errMsg}`)
                    }
                }
            }

            setIsModalOpen(false)
        } catch (err) {
            const actionStr = isCreateMode ? '추가' : '수정'
            addToast(`${actionStr} 실패: ` + (err.response?.data?.detail || err.message), 'error')
            alert(`${actionStr} 실패: ` + (err.response?.data?.detail || err.message))
        } finally {
            setIsSaving(false)
            setIsSnowSyncing(false)
        }
    }

    const handleReturnAsset = () => {
        if (!confirm('반납 처리하시겠습니까? (BU/Role이 IT로, 사용자 이름이 STOCK으로 변경되며, Additional Information에 반납 기록이 남습니다.)')) return;

        const today = new Date();
        const yyyy = today.getFullYear();
        const mm = String(today.getMonth() + 1).padStart(2, '0');
        const dd = String(today.getDate()).padStart(2, '0');
        const todayStr = `${yyyy}${mm}${dd}`;

        const email = modalData.email || modalData.EMAIL || '';
        let name = "Unknown";
        if (email) {
            name = email.split('@')[0].split('.').map(n => n.charAt(0).toUpperCase() + n.slice(1)).join(' ');
        } else if (modalData.USER || modalData.NAME || modalData['이름']) {
            name = modalData.USER || modalData.NAME || modalData['이름'];
        }

        const updates = { ...modalData };
        if (updates.hasOwnProperty('BU')) updates['BU'] = 'IT';
        if (updates.hasOwnProperty('Role')) updates['Role'] = 'IT';
        if (updates.hasOwnProperty('ROLE')) updates['ROLE'] = 'IT';
        
        if (updates.hasOwnProperty('USER')) updates['USER'] = 'STOCK';
        if (updates.hasOwnProperty('User')) updates['User'] = 'STOCK';
        if (updates.hasOwnProperty('NAME')) updates['NAME'] = 'STOCK';
        if (updates.hasOwnProperty('이름')) updates['이름'] = 'STOCK';
        
        if (updates.hasOwnProperty('email')) updates['email'] = '';
        if (updates.hasOwnProperty('EMAIL')) updates['EMAIL'] = '';
        if (updates.hasOwnProperty('상태')) updates['상태'] = 'STOCK';
        
        const returnText = `${todayStr} / ${name} 반납`;
        if (updates.hasOwnProperty('Additional Information')) {
            updates['Additional Information'] = returnText;
        } else if (updates.hasOwnProperty('참고')) {
            updates['참고'] = returnText;
        } else if (updates.hasOwnProperty('비고')) {
            updates['비고'] = returnText;
        }

        setModalData(updates);
    }

    // ── 자산별 변경 이력 조회 ──
    const handleViewAssetHistory = async () => {
        setIsLoadingHistory(true);
        setIsHistoryModalOpen(true);
        try {
            // 현재 자산의 식별자(S/N 등) 및 이메일 추출
            let sn = '';
            for (const key of ['카드번호', 'Card No', 'Card_No', 'S/N', 'Serial', 'Number', 'TeamsNumber', 'Model', 'SNOW Tag']) {
                if (modalData[key] && String(modalData[key]).trim() && String(modalData[key]).trim() !== '-') {
                    sn = String(modalData[key]).trim();
                    break;
                }
            }
            const email = String(modalData.email || modalData.EMAIL || '').trim();
            const userName = String(modalData.User || modalData.USER || modalData.NAME || modalData['이름'] || '').trim();

            const { data } = await axios.get('/api/assets/history', {
                params: {
                    sn: sn || undefined,
                    email: email || undefined,
                    search: (!sn && !email) ? userName : undefined,
                    limit: 50,
                }
            });
            setAssetHistories(data || []);
        } catch (err) {
            console.error('히스토리 조회 오류:', err);
            addToast('히스토리 조회 실패', 'error');
        } finally {
            setIsLoadingHistory(false);
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
        const cardList = String(u['Card_List'] || '').toLowerCase()
        
        // 이름과 이메일은 공통 검색
        if (name.includes(q) || email.includes(q)) return true
        
        // 현재 선택된 자산(type)에 해당하는 기기 정보만 추가 검색 허용
        if (type === 'Lease' && leaseList.includes(q)) return true
        if (type === 'iPad' && ipadList.includes(q)) return true
        if (type === 'Monitor' && monitor.includes(q)) return true
        if (type === 'Printer' && printer.includes(q)) return true
        if (type === 'TeamsNum' && teams.includes(q)) return true
        if (type === 'Card' && cardList.includes(q)) return true
        
        return false
    }).slice(0, 50) // 성능을 위해 최대 50개까지만 표시

    const handleCopyUserInfo = (user, skipConfirm = false) => {
        const userName = user['이름'] || user['NAME'] || user['email']
        const userEmail = user['email'] || user['EMAIL'] || ''
        if (!skipConfirm && !confirm(`'${userName}' (${userEmail || '이메일 미등록'}) 님의 정보를 현재 입력 폼에 할당하시겠습니까?`)) return
        
        const newModalData = { ...modalData }
        const colNames = Object.keys(newModalData)
        
        const mapping = {
            name: ['User', 'USER', '이름', 'NAME', '사용자'],
            email: ['email', 'EMAIL', '이메일'],
            bu: ['BU', '소속', '부서', '본부'],
            role: ['직급', '직함', 'ROLE', 'Role']
        }
        
        for (const targetField of ['name', 'email', 'bu', 'role']) {
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

        if (newModalData.hasOwnProperty('상태')) {
            newModalData['상태'] = '사용중'
        }
        if (newModalData.hasOwnProperty('발급일') && !newModalData['발급일']) {
            newModalData['발급일'] = new Date().toISOString().slice(0, 10)
        }
        
        setModalData(newModalData)
        addToast(`'${userName}' 사용자 정보가 입력폼에 할당되었습니다.`, 'success')
        setIsUserSearchOpen(false)
        setUserSearchQuery('')
    }

    // 이메일 주소로 사용자 정보 즉시 조회 및 채우기
    const handleLookupByEmail = async (targetEmail) => {
        const cleanEmail = String(targetEmail || modalData.email || '').trim().toLowerCase()
        if (!cleanEmail) {
            addToast('조회할 이메일을 입력하세요.', 'warning')
            return
        }

        // 1. 캐시된 dashboardData에서 우선 검색
        if (dashboardData && dashboardData.length > 0) {
            const match = dashboardData.find(u => String(u.email || '').trim().toLowerCase() === cleanEmail)
            if (match) {
                handleCopyUserInfo(match, true)
                return
            }
        }

        // 2. 백엔드 Lookup API 호출
        try {
            const { data } = await axios.get(`/api/assets/user/lookup/${encodeURIComponent(cleanEmail)}`)
            if (data) {
                const newModalData = { ...modalData }
                const colNames = Object.keys(newModalData)
                const nameCol = colNames.find(c => ['User', 'USER', '이름', 'NAME', '사용자'].includes(c))
                const buCol = colNames.find(c => ['BU', '소속', '부서'].includes(c))
                const roleCol = colNames.find(c => ['ROLE', 'Role', '직급', '직함'].includes(c))
                const emailCol = colNames.find(c => ['email', 'EMAIL', '이메일'].includes(c))

                if (emailCol) newModalData[emailCol] = cleanEmail
                if (nameCol) newModalData[nameCol] = data.NAME || data.korean_name || ''
                if (buCol) newModalData[buCol] = data.BU || ''
                if (roleCol) newModalData[roleCol] = data.ROLE || ''
                if (newModalData.hasOwnProperty('상태')) newModalData['상태'] = '사용중'
                if (newModalData.hasOwnProperty('발급일') && !newModalData['발급일']) {
                    newModalData['발급일'] = new Date().toISOString().slice(0, 10)
                }

                setModalData(newModalData)
                addToast(`'${data.NAME || data.korean_name}' 사용자 정보를 찾았습니다.`, 'success')
            }
        } catch (err) {
            addToast(`'${cleanEmail}'에 해당하는 사용자를 All_User에서 찾을 수 없습니다.`, 'warning')
        }
    }

    const titleMap = {
        'Lease': '💻 PC/노트북 (Lease) 관리',
        'iPad': '📱 아이패드 (iPad) 관리',
        'Monitor': '🖥 모니터 (Monitor) 관리',
        'Printer': '🖨 프린터 (Printer) 관리',
        'Teams': '📞 Teams 번호 관리',
        'Card': '🪪 출입 카드 (Card) 관리',
        'All_User': '👥 전체 사용자 관리',
        'Resign': '퇴사자 관리',
        'NewHire': '신규 입사자 관리',
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-2 dashboard-header-action">
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <h1 style={{ margin: 0 }}>{titleMap[type] || `${type} Management`}</h1>
                    {['Lease', 'iPad', 'Monitor', 'Card'].includes(type) && (
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

                            {(type === 'Lease' || uniqueContracts.length > 0) && (
                                <div style={{ width: '160px' }}>
                                    <SearchableSelect
                                        options={contractOptions}
                                        value={filterContract}
                                        onChange={setFilterContract}
                                        placeholder="전체 계약번호"
                                        width="100%"
                                    />
                                </div>
                            )}
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
                            {type === 'Lease' && (
                                <select
                                    className="form-input"
                                    style={{
                                        width: 'auto',
                                        maxWidth: '175px',
                                        padding: '4px 8px',
                                        borderColor: filterLeaseStatus ? '#f59e0b' : '#cbd5e1',
                                        fontWeight: filterLeaseStatus ? 'bold' : 'normal',
                                        backgroundColor: filterLeaseStatus ? '#fffbeb' : '#fff'
                                    }}
                                    value={filterLeaseStatus}
                                    onChange={e => setFilterLeaseStatus(e.target.value)}
                                >
                                    <option value="">전체 보기</option>
                                    <option value="d90">90일 이내 만료일</option>
                                </select>
                            )}
                            {type === 'iPad' && (
                                <select
                                    className="form-input"
                                    style={{
                                        width: 'auto',
                                        maxWidth: '190px',
                                        padding: '4px 8px',
                                        borderColor: filterLeaseStatus ? '#f59e0b' : '#cbd5e1',
                                        fontWeight: filterLeaseStatus ? 'bold' : 'normal',
                                        backgroundColor: filterLeaseStatus ? '#fffbeb' : '#fff'
                                    }}
                                    value={filterLeaseStatus}
                                    onChange={e => setFilterLeaseStatus(e.target.value)}
                                >
                                    <option value="">약정 상태 전체 보기</option>
                                    <option value="d60">⏰ 60일(2달)내 만료 예정</option>
                                    <option value="d30">⚠️ 30일(1달)내 만료 임박</option>
                                    <option value="expired">🚨 이미 만료됨</option>
                                    <option value="unregistered">➖ 약정 미가입/확인불가</option>
                                </select>
                            )}
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
                    <button 
                        className="btn btn-primary btn-sm" 
                        onClick={openAddModal} 
                        style={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}
                    >
                        ➕ {type === 'Printer' ? '프린터 신규 등록' : '신규 추가'}
                    </button>
                    {selectedRows.size > 0 && (
                        <button className="btn btn-danger btn-sm" onClick={handleDeleteSelected}>
                            🗑 {selectedRows.size}개 삭제
                        </button>
                    )}
                    <button className="btn btn-sm" onClick={handleDownload} style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #86efac', fontWeight: '600' }}>📥 필터 결과 내보내기</button>
                    <button className="btn btn-sm" onClick={handleDownloadAll}>📋 전체 다운로드</button>

                    {/* 열 숨기기 / 표시 드롭다운 */}
                    <div ref={colDropdownRef} style={{ position: 'relative' }}>
                        <button
                            type="button"
                            className="btn btn-sm"
                            onClick={() => setColDropdownOpen(!colDropdownOpen)}
                            style={{
                                backgroundColor: hiddenColumns.length > 0 ? '#eff6ff' : '#fff',
                                color: hiddenColumns.length > 0 ? '#1d4ed8' : '#374151',
                                border: `1px solid ${hiddenColumns.length > 0 ? '#93c5fd' : '#cbd5e1'}`,
                                fontWeight: hiddenColumns.length > 0 ? '600' : 'normal',
                                display: 'flex', alignItems: 'center', gap: '5px'
                            }}
                            title="화면에서 숨기거나 표시할 열을 선택합니다"
                        >
                            <span>👁️ 열 숨기기/표시</span>
                            {hiddenColumns.length > 0 && (
                                <span style={{
                                    backgroundColor: '#2563eb', color: '#fff', fontSize: '0.7rem',
                                    padding: '1px 6px', borderRadius: '10px', fontWeight: 'bold'
                                }}>
                                    {hiddenColumns.length}개 숨김
                                </span>
                            )}
                        </button>
                        {colDropdownOpen && (
                            <div style={{
                                position: 'absolute', top: '100%', right: 0, zIndex: 1100,
                                background: 'white', border: '1px solid #cbd5e1', borderRadius: '8px',
                                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.15)', minWidth: '200px',
                                maxHeight: '380px', overflowY: 'auto', padding: '10px', marginTop: '6px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f1f5f9', paddingBottom: '6px', marginBottom: '8px' }}>
                                    <span style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#1e293b' }}>열 표시 설정</span>
                                    {hiddenColumns.length > 0 && (
                                        <button
                                            type="button"
                                            onClick={() => updateHiddenColumns([])}
                                            style={{ background: 'none', border: 'none', color: '#4f46e5', fontSize: '0.75rem', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                                        >
                                            모두 표시
                                        </button>
                                    )}
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    {columns.map(col => {
                                        const isHidden = hiddenColumns.includes(col)
                                        return (
                                            <label
                                                key={col}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '8px',
                                                    padding: '5px 8px', fontSize: '0.83rem', cursor: 'pointer',
                                                    borderRadius: '4px', userSelect: 'none',
                                                    backgroundColor: isHidden ? '#f8fafc' : 'transparent',
                                                    color: isHidden ? '#94a3b8' : '#1e293b'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.backgroundColor = isHidden ? '#f1f5f9' : '#f8fafc'}
                                                onMouseLeave={e => e.currentTarget.style.backgroundColor = isHidden ? '#f8fafc' : 'transparent'}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={!isHidden}
                                                    onChange={() => {
                                                        if (isHidden) {
                                                            updateHiddenColumns(hiddenColumns.filter(c => c !== col))
                                                        } else {
                                                            if (columns.length - hiddenColumns.length <= 1) {
                                                                alert('최소 1개의 열은 표시되어야 합니다.')
                                                                return
                                                            }
                                                            updateHiddenColumns([...hiddenColumns, col])
                                                        }
                                                    }}
                                                    style={{ cursor: 'pointer' }}
                                                />
                                                <span style={{ textDecoration: isHidden ? 'line-through' : 'none' }}>{col}</span>
                                            </label>
                                        )
                                    })}
                                </div>
                            </div>
                        )}
                    </div>

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
                    {/* iPad 2달(60일) 이내 만료 예정 알림 배너 */}
                    {type === 'iPad' && ipadExpiringCount > 0 && (
                        <div style={{
                            margin: '1rem',
                            padding: '10px 16px',
                            backgroundColor: '#fffbeb',
                            border: '1px solid #fde68a',
                            borderRadius: '8px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '8px'
                        }}>
                            <div style={{ fontSize: '0.9rem', color: '#92400e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontSize: '1.2rem' }}>⏰</span>
                                <span>
                                    <strong>약정 만료 예정 알림</strong>: 향후 <strong>2달(60일) 이내</strong>에 약정이 만료되는 아이패드가 <strong>{ipadExpiringCount}대</strong> 있습니다.
                                </span>
                            </div>
                            <button
                                className="btn btn-sm"
                                onClick={() => setFilterLeaseStatus(filterLeaseStatus === 'd60' ? '' : 'd60')}
                                style={{
                                    backgroundColor: filterLeaseStatus === 'd60' ? '#d97706' : '#fef3c7',
                                    color: filterLeaseStatus === 'd60' ? '#fff' : '#b45309',
                                    border: '1px solid #f59e0b',
                                    fontWeight: 'bold',
                                    padding: '4px 12px',
                                    cursor: 'pointer'
                                }}
                            >
                                {filterLeaseStatus === 'd60' ? '전체 보기로 복귀 ↩' : `${ipadExpiringCount}대 만료 예정 단말만 모아보기 🔍`}
                            </button>
                        </div>
                    )}
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
                                        {visibleColumns.map(col => <th key={col}>{col}</th>)}
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
                                            {visibleColumns.map(col => {
                                                const val = row[col] !== null ? String(row[col]) : '-'
                                                const isEmailCol = col.toLowerCase() === 'email'
                                                const isDuplicate = isEmailCol && val !== '-' && duplicateEmails.includes(val.trim().toLowerCase())
                                                const isLeaseEndDateCol = col === '리스 종료 일자' || col === '리스 종료일' || (type === 'iPad' && col === '약정만료일')
                                                const isLeaseContractCol = col === '리스계번호' || col === '리스계약번호'
                                                const leaseStatus = isLeaseEndDateCol && val !== '-' && val !== '' ? getLeaseStatus(val) : null

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
                                                        {isLeaseEndDateCol && leaseStatus && leaseStatus.status !== 'none' ? (
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{ fontWeight: '500' }}>{val}</span>
                                                                <span style={{
                                                                    padding: '2px 6px',
                                                                    borderRadius: '4px',
                                                                    fontSize: '0.73rem',
                                                                    fontWeight: 'bold',
                                                                    backgroundColor: leaseStatus.bg,
                                                                    color: leaseStatus.color,
                                                                    whiteSpace: 'nowrap'
                                                                }}>
                                                                    {leaseStatus.label}
                                                                </span>
                                                            </div>
                                                        ) : isLeaseContractCol && val !== '-' && val !== '' ? (
                                                            <span
                                                                style={{
                                                                    fontFamily: 'monospace',
                                                                    fontWeight: 'bold',
                                                                    color: filterContract === val ? '#1d4ed8' : '#0369a1',
                                                                    backgroundColor: filterContract === val ? '#dbeafe' : 'transparent',
                                                                    padding: filterContract === val ? '2px 6px' : '0',
                                                                    borderRadius: '4px',
                                                                    letterSpacing: '0.3px',
                                                                    cursor: 'pointer',
                                                                    textDecoration: 'underline'
                                                                }}
                                                                title={`클릭하여 '${val}' 계약번호로 필터`}
                                                                onClick={() => setFilterContract(prev => prev === val ? '' : val)}
                                                            >
                                                                {val}
                                                            </span>
                                                        ) : (type === 'Lease' && (col === 'S/N' || col === 'Serial' || col === '일련번호') && val !== '-' && val !== '') ? (
                                                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                                <span style={{ fontWeight: '600' }}>{val}</span>
                                                                <button
                                                                    type="button"
                                                                    className="btn btn-sm"
                                                                    style={{
                                                                        padding: '1px 6px',
                                                                        fontSize: '0.7rem',
                                                                        backgroundColor: '#f0f9ff',
                                                                        color: '#0284c7',
                                                                        border: '1px solid #bae6fd',
                                                                        borderRadius: '4px',
                                                                        cursor: 'pointer',
                                                                        fontWeight: 'bold'
                                                                    }}
                                                                    title={`ServiceNow에서 시리얼번호 '${val}' 제품 열기`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation()
                                                                        handleOpenServiceNowPage(val, {
                                                                            serial_number: val,
                                                                            state: row['State'] || 'In use',
                                                                            substate: row['Substate'] || '-- None --',
                                                                            email: row['email'] || '',
                                                                            user: row['User'] || row['NAME'] || '',
                                                                            stockroom: row['Stockroom'] || 'Korea Stock Room',
                                                                            location: row['Location'] || 'Seoul, Seoul 517 Yeongdong-daero, 6th Floor, ASEM Tower - SALES',
                                                                            department: row['Department'] || row['BU'] || '',
                                                                            company: row['Company'] || 'Asia Pacific'
                                                                        })
                                                                    }}
                                                                >
                                                                    🔗 SNOW
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span>{val}</span>
                                                        )}
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
                                <h3 style={{ margin: 0 }}>
                                    {isCreateMode 
                                        ? (type === 'Card' ? '🪪 출입 카드 신규 등록' : type === 'Printer' ? '프린터 신규 등록' : '신규 추가') 
                                        : (type === 'Card' ? '🪪 출입 카드 상세 정보 수정 및 할당' : '📍 상세 정보 수정')}
                                </h3>
                                <button className="btn btn-sm" onClick={() => setIsUserSearchOpen(!isUserSearchOpen)} style={{ backgroundColor: isUserSearchOpen ? '#eff6ff' : '#f3f4f6', color: isUserSearchOpen ? '#1d4ed8' : '#374151', border: `1px solid ${isUserSearchOpen ? '#bfdbfe' : '#d1d5db'}`, fontWeight: '600' }}>
                                    🔍 {isUserSearchOpen ? '사용자 검색 닫기' : '이메일/사용자 검색으로 즉시 할당'}
                                </button>
                                {!isCreateMode && (
                                    <>
                                        <button className="btn btn-sm" onClick={handleViewAssetHistory} style={{ backgroundColor: '#f0fdf4', color: '#15803d', border: '1px solid #bbf7d0' }}>
                                            📜 변경 이력 조회
                                        </button>
                                        <button className="btn btn-sm" onClick={handleReturnAsset} style={{ backgroundColor: '#fff1f2', color: '#be123c', border: '1px solid #fecdd3' }}>
                                            🔄 반납 처리 (IT/STOCK)
                                        </button>
                                    </>
                                )}
                            </div>
                            <button className="btn btn-secondary" onClick={() => { setIsModalOpen(false); setIsUserSearchOpen(false); }}>✖</button>
                        </div>
                        
                        {isUserSearchOpen && (
                            <div style={{ padding: '0 1.5rem 1rem 1.5rem', borderBottom: '1px solid #eee', backgroundColor: '#f8fafc' }}>
                                <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
                                    <input
                                        type="text"
                                        className="form-input"
                                        placeholder="할당할 사용자의 이메일 또는 이름을 입력하여 검색하세요..."
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
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', wordBreak: 'break-all' }}>
                                                        {u['BU'] || u['소속'] || '-'}
                                                        {type === 'Lease' && u['Lease_List'] && u['Lease_List'] !== '-' && ` | 노트북: ${u['Lease_List']}`}
                                                        {type === 'iPad' && u['Ipad_List'] && u['Ipad_List'] !== '-' && ` | 아이패드: ${u['Ipad_List']}`}
                                                        {type === 'Monitor' && u['Monitor'] && u['Monitor'] !== '-' && ` | 모니터: ${u['Monitor']}`}
                                                        {type === 'Printer' && u['Printer'] && u['Printer'] !== '-' && ` | 프린터: ${u['Printer']}`}
                                                        {type === 'TeamsNum' && u['TeamsNum'] && u['TeamsNum'] !== '-' && ` | Teams: ${u['TeamsNum']}`}
                                                        {type === 'Card' && u['Card_List'] && u['Card_List'] !== '-' && ` | 출입카드: ${u['Card_List']}`}
                                                    </div>
                                                </div>
                                                <button className="btn btn-sm" style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '4px 12px', fontSize: '0.8rem', borderRadius: '4px', fontWeight: 'bold' }} onClick={(e) => { e.stopPropagation(); handleCopyUserInfo(u); }}>
                                                    할당
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
                                {columns.map(col => {
                                    let placeholder = ''
                                    let helperText = ''
                                    const isEmailCol = col.toLowerCase() === 'email' || col.toLowerCase() === '이메일'

                                    if (col === '리스계번호' || col === '리스계약번호') {
                                        placeholder = '예: LC-2024-001 (리스 계약 번호)'
                                    } else if (col === '리스 종료 일자' || col === '리스 종료일') {
                                        placeholder = 'YYYY-MM-DD 또는 MM/DD/YY (예: 2026-12-31)'
                                        helperText = '리스 계약 만료일 (만료 D-Day 자동 계산)'
                                    } else if (col === '약정만료일') {
                                        placeholder = 'YYYY-MM-DD (예: 2026-11-03)'
                                        helperText = '통신사 약정 만료일 (만료 D-Day 자동 계산, 2달 전부터 알림)'
                                    } else if (col === 'Lease Date') {
                                        placeholder = 'MM/DD/YY 또는 YYYY-MM-DD (리스 개시일)'
                                    } else if (col === '카드번호' || col === 'Card No' || col === 'CardNo') {
                                        placeholder = '예: CARD-2024-001 (출입 카드 고유 번호)'
                                        helperText = '출입 카드의 고유 번호 또는 일련번호'
                                    } else if (col === '종류' && type === 'Card') {
                                        placeholder = '예: 정규직, 파견, 방문증, 임시 등'
                                    } else if (col === '발급일') {
                                        placeholder = 'YYYY-MM-DD (예: 2026-10-26)'
                                        helperText = '카드 발급 일자'
                                    } else if (col === '상태') {
                                        placeholder = '예: 사용중, STOCK, 분실, 반납 등'
                                        helperText = '카드 보유/사용 상태'
                                    } else if (isEmailCol) {
                                        placeholder = '사용자 이메일 (예: gildong.hong@stryker.com)'
                                        helperText = '이메일 입력 또는 선택 시 사용자/부서 정보가 자동 연동됩니다.'
                                    }

                                    return (
                                        <div key={col} className="form-group">
                                            <label className="form-label">
                                                {col}
                                                {col === '리스계번호' && <span style={{ color: '#0284c7', fontSize: '0.8rem', marginLeft: '6px' }}>[계약번호]</span>}
                                                {col === '리스 종료 일자' && <span style={{ color: '#ea580c', fontSize: '0.8rem', marginLeft: '6px' }}>[만료일]</span>}
                                                {col === '약정만료일' && <span style={{ color: '#ea580c', fontSize: '0.8rem', marginLeft: '6px' }}>[만료일]</span>}
                                                {col === '카드번호' && <span style={{ color: '#2563eb', fontSize: '0.8rem', marginLeft: '6px' }}>[식별번호]</span>}
                                                {isEmailCol && <span style={{ color: '#16a34a', fontSize: '0.8rem', marginLeft: '6px' }}>[이메일 검색/할당]</span>}
                                            </label>
                                            <input 
                                                className="form-input"
                                                list={isEmailCol ? "all-user-emails-datalist" : undefined}
                                                placeholder={placeholder}
                                                value={modalData[col] !== null ? String(modalData[col]) : ''} 
                                                onChange={e => {
                                                    const val = e.target.value
                                                    setModalData({ ...modalData, [col]: val })
                                                    if (isEmailCol && val && dashboardData && dashboardData.length > 0) {
                                                        const match = dashboardData.find(u => String(u.email || '').trim().toLowerCase() === val.trim().toLowerCase())
                                                        if (match) {
                                                            handleCopyUserInfo(match, true)
                                                        }
                                                    }
                                                }}
                                            />
                                            {isEmailCol && (
                                                <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm"
                                                        style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', fontSize: '0.76rem', padding: '3px 8px' }}
                                                        onClick={() => handleLookupByEmail(modalData[col])}
                                                    >
                                                        🔍 이메일로 정보 자동 채우기
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="btn btn-sm"
                                                        style={{ backgroundColor: '#f8fafc', color: '#475569', border: '1px solid #cbd5e1', fontSize: '0.76rem', padding: '3px 8px' }}
                                                        onClick={() => { setIsUserSearchOpen(true); setUserSearchQuery(modalData[col] || ''); }}
                                                    >
                                                        👥 사용자 검색 목록 열기
                                                    </button>
                                                </div>
                                            )}
                                            {helperText && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '3px' }}>{helperText}</div>}
                                        </div>
                                    )
                                })}
                            </div>

                            {type === 'Lease' && (
                                <div style={{ marginTop: '1.5rem', padding: '1.2rem', backgroundColor: '#f0f9ff', borderRadius: '10px', border: '1px solid #bae6fd' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                                        <h4 style={{ margin: 0, color: '#0369a1', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1rem' }}>
                                            <span>🌐 ServiceNow (Stryker) 자산 연동 설정</span>
                                        </h4>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <button
                                                type="button"
                                                className="btn btn-sm"
                                                style={{
                                                    backgroundColor: '#0284c7',
                                                    color: '#fff',
                                                    border: 'none',
                                                    fontSize: '0.8rem',
                                                    padding: '5px 12px',
                                                    borderRadius: '6px',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '5px',
                                                    fontWeight: 'bold',
                                                    cursor: 'pointer'
                                                }}
                                                onClick={() => handleOpenServiceNowPage(modalData['S/N'] || modalData['Serial'] || modalData['일련번호'])}
                                            >
                                                🔍 ServiceNow에서 이 제품 열기
                                            </button>
                                            {isBridgeReady ? (
                                                <span style={{ fontSize: '0.75rem', backgroundColor: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '9999px', fontWeight: 'bold' }}>
                                                    🟢 Chrome Bridge 연동 준비됨
                                                </span>
                                            ) : (
                                                <span style={{ fontSize: '0.75rem', backgroundColor: '#fef3c7', color: '#92400e', padding: '3px 8px', borderRadius: '9999px', fontWeight: 'bold' }} title="Chrome 확장이 로드되어 있고 ServiceNow 탭이 열려있어야 합니다">
                                                    ⚠️ Chrome Bridge 미감지 (확장 로드 필요)
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                        <div className="form-group">
                                            <label className="form-label" style={{ fontWeight: '600', color: '#0f172a' }}>
                                                State (자산 상태) <span style={{ color: '#ef4444' }}>*</span>
                                            </label>
                                            <select 
                                                className="form-input"
                                                value={modalData['State'] || 'In use'}
                                                onChange={e => handleStateChange(e.target.value)}
                                            >
                                                <option value="On order">On order</option>
                                                <option value="In stock">In stock</option>
                                                <option value="In transit">In transit</option>
                                                <option value="In use">In use</option>
                                                <option value="Retired">Retired</option>
                                                <option value="Missing">Missing</option>
                                            </select>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>ServiceNow install_status 필드에 반영됩니다.</div>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label" style={{ fontWeight: '600', color: '#0f172a' }}>
                                                Substate (하위 상태)
                                            </label>
                                            <select 
                                                className="form-input"
                                                value={modalData['Substate'] || '-- None --'}
                                                onChange={e => setModalData({ ...modalData, Substate: e.target.value })}
                                            >
                                                <option value="-- None --">-- None --</option>
                                                <option value="Staff">Staff</option>
                                                <option value="Contractor">Contractor</option>
                                                <option value="Other">Other</option>
                                                <option value="Defective">Defective</option>
                                            </select>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>ServiceNow substatus 필드에 반영됩니다.</div>
                                        </div>

                                        {/* State가 In stock일 때: Stockroom 필드 노출 */}
                                        {modalData['State'] === 'In stock' && (
                                            <div className="form-group" style={{ gridColumn: 'span 2', backgroundColor: '#fefce8', padding: '12px', borderRadius: '8px', border: '1px solid #fef08a' }}>
                                                <label className="form-label" style={{ fontWeight: '600', color: '#854d0e', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span>🏬 Stockroom (보관 장소)</span> <span style={{ color: '#ef4444' }}>*</span>
                                                </label>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input 
                                                        className="form-input"
                                                        placeholder="예: Korea Stock Room"
                                                        value={modalData['Stockroom'] !== undefined ? String(modalData['Stockroom']) : 'Korea Stock Room'}
                                                        onChange={e => setModalData({ ...modalData, Stockroom: e.target.value })}
                                                        style={{ flex: 1, fontWeight: 'bold' }}
                                                    />
                                                    <button 
                                                        type="button" 
                                                        className="btn btn-sm"
                                                        style={{ backgroundColor: '#eab308', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', whiteSpace: 'nowrap', cursor: 'pointer' }}
                                                        onClick={() => setModalData({ ...modalData, Stockroom: 'Korea Stock Room' })}
                                                    >
                                                        📍 Korea Stock Room 선택
                                                    </button>
                                                </div>
                                                <div style={{ fontSize: '0.73rem', color: '#a16207', marginTop: '4px' }}>
                                                    State가 In stock일 때 ServiceNow 필수 Stockroom 필드에 반영됩니다. (사용자명은 자동으로 'STOCK'으로 설정됩니다)
                                                </div>
                                            </div>
                                        )}

                                        {/* State가 In use일 때: Assigned to (사용자/이메일 선택) 필드 노출 */}
                                        {modalData['State'] === 'In use' && (
                                            <div className="form-group" style={{ gridColumn: 'span 2', backgroundColor: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0' }}>
                                                <label className="form-label" style={{ fontWeight: '600', color: '#166534', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <span>👤 Assigned to (사용자 할당)</span> <span style={{ color: '#ef4444' }}>*</span>
                                                </label>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <input 
                                                        className="form-input"
                                                        list="servicenow-assigned-emails-datalist"
                                                        placeholder="이메일 주소 또는 사원명 검색/입력 (예: youmee.lee@stryker.com)"
                                                        value={modalData['email'] || modalData['User'] || ''}
                                                        onChange={e => {
                                                            const val = e.target.value
                                                            const match = (dashboardData || []).find(u => 
                                                                String(u.email || '').trim().toLowerCase() === val.trim().toLowerCase() ||
                                                                String(u['이름'] || u['NAME'] || u['USER'] || '').trim().toLowerCase() === val.trim().toLowerCase()
                                                            )
                                                            if (match) {
                                                                handleCopyUserInfo(match, true)
                                                            } else {
                                                                setModalData({ ...modalData, email: val, User: modalData['User'] || val })
                                                            }
                                                        }}
                                                        style={{ flex: 1 }}
                                                    />
                                                    <button 
                                                        type="button"
                                                        className="btn btn-sm"
                                                        style={{ backgroundColor: '#16a34a', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold', whiteSpace: 'nowrap', cursor: 'pointer' }}
                                                        onClick={() => { setIsUserSearchOpen(true); setUserSearchQuery(modalData['email'] || modalData['User'] || ''); }}
                                                    >
                                                        👥 사원 검색
                                                    </button>
                                                </div>
                                                <datalist id="servicenow-assigned-emails-datalist">
                                                    {(dashboardData || []).filter(u => u.email).map((u, i) => (
                                                        <option key={i} value={u.email}>{`${u.이름 || u.NAME || ''} (${u.BU || ''})`}</option>
                                                    ))}
                                                </datalist>
                                                <div style={{ fontSize: '0.73rem', color: '#15803d', marginTop: '4px' }}>
                                                    현재 할당된 실사용자: <strong>{modalData['User'] || modalData['NAME'] || '미지정'}</strong> {modalData['email'] ? `(${modalData['email']})` : ''} | 부서: {modalData['Department'] || modalData['BU'] || '-'}
                                                </div>
                                            </div>
                                        )}

                                        <div className="form-group" style={{ gridColumn: 'span 2' }}>
                                            <label className="form-label" style={{ fontWeight: '600', color: '#0f172a' }}>
                                                Location (자산 위치)
                                            </label>
                                            <input 
                                                className="form-input"
                                                list="servicenow-location-datalist"
                                                placeholder="ServiceNow 자산 위치 선택 또는 입력"
                                                value={modalData['Location'] !== undefined ? String(modalData['Location']) : 'Seoul, Seoul 517 Yeongdong-daero, 6th Floor, ASEM Tower - SALES'}
                                                onChange={e => setModalData({ ...modalData, Location: e.target.value })}
                                            />
                                            <datalist id="servicenow-location-datalist">
                                                <option value="Seoul, Seoul 517 Yeongdong-daero, 6th Floor, ASEM Tower - SALES">Seoul, Seoul 517 Yeongdong-daero, 6th Floor, ASEM Tower - SALES</option>
                                                <option value="Seoul, Seoul 55, Songpa-daero, Songpa-gu - SHARED">Seoul, Seoul 55, Songpa-daero, Songpa-gu - SHARED</option>
                                                <option value="Seoul, Seoul 78, Arayuk-ro, Gochon-eup, Gimpo-si, Gyeonggi-do - DIST">Seoul, Seoul 78, Arayuk-ro, Gochon-eup, Gimpo-si, Gyeonggi-do - DIST</option>
                                            </datalist>
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                                                <button 
                                                    type="button" 
                                                    className="btn btn-sm" 
                                                    style={{ backgroundColor: '#f1f5f9', color: '#334155', fontSize: '0.73rem', padding: '3px 8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                                    onClick={() => setModalData({ ...modalData, Location: 'Seoul, Seoul 517 Yeongdong-daero, 6th Floor, ASEM Tower - SALES' })}
                                                >
                                                    📍 ASEM Tower - SALES
                                                </button>
                                                <button 
                                                    type="button" 
                                                    className="btn btn-sm" 
                                                    style={{ backgroundColor: '#f1f5f9', color: '#334155', fontSize: '0.73rem', padding: '3px 8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                                    onClick={() => setModalData({ ...modalData, Location: 'Seoul, Seoul 55, Songpa-daero, Songpa-gu - SHARED' })}
                                                >
                                                    📍 Songpa-daero - SHARED
                                                </button>
                                                <button 
                                                    type="button" 
                                                    className="btn btn-sm" 
                                                    style={{ backgroundColor: '#f1f5f9', color: '#334155', fontSize: '0.73rem', padding: '3px 8px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                                                    onClick={() => setModalData({ ...modalData, Location: 'Seoul, Seoul 78, Arayuk-ro, Gochon-eup, Gimpo-si, Gyeonggi-do - DIST' })}
                                                >
                                                    📍 Gimpo-si - DIST
                                                </button>
                                            </div>
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '4px' }}>ServiceNow location 필드에 반영됩니다. 위 버튼 클릭 시 즉시 입력됩니다.</div>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label" style={{ fontWeight: '600', color: '#0f172a' }}>
                                                Department (부서)
                                            </label>
                                            <input 
                                                className="form-input"
                                                placeholder="예: Accounting, IT, Sales 등"
                                                value={modalData['Department'] !== undefined ? String(modalData['Department']) : (modalData['BU'] || '')}
                                                onChange={e => setModalData({ ...modalData, Department: e.target.value })}
                                            />
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>ServiceNow department 필드에 반영됩니다.</div>
                                        </div>

                                        <div className="form-group">
                                            <label className="form-label" style={{ fontWeight: '600', color: '#0f172a' }}>
                                                Company (법인)
                                            </label>
                                            <input 
                                                className="form-input"
                                                placeholder="예: Asia Pacific"
                                                value={modalData['Company'] !== undefined ? String(modalData['Company']) : 'Asia Pacific'}
                                                onChange={e => setModalData({ ...modalData, Company: e.target.value })}
                                            />
                                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>ServiceNow company 필드에 반영됩니다.</div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        <datalist id="all-user-emails-datalist">
                            {(dashboardData || []).filter(u => u.email).map((u, i) => (
                                <option key={i} value={u.email}>{`${u.이름 || u.NAME || ''} (${u.BU || ''})`}</option>
                            ))}
                        </datalist>
                        <div style={{ padding: '1rem', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '10px' }}>
                            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)} disabled={isSaving || isSnowSyncing}>
                                취소
                            </button>
                            {type === 'Lease' ? (
                                <>
                                    <button 
                                        className="btn btn-secondary" 
                                        onClick={() => handleModalSave(false)} 
                                        disabled={isSaving || isSnowSyncing}
                                        style={{ backgroundColor: '#f1f5f9', color: '#334155' }}
                                    >
                                        {isSaving && !isSnowSyncing ? '⏳ 저장 중...' : '💾 구글 시트만 저장'}
                                    </button>
                                    <button 
                                        className="btn btn-primary" 
                                        onClick={() => handleModalSave(true)} 
                                        disabled={isSaving || isSnowSyncing}
                                        style={{ 
                                            backgroundColor: isBridgeReady ? '#0284c7' : '#0369a1', 
                                            boxShadow: '0 2px 4px rgba(2, 132, 199, 0.3)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                        }}
                                    >
                                        {isSnowSyncing ? '⏳ ServiceNow 반영 중...' : '🌐 구글 시트 + ServiceNow 동시 반영'}
                                    </button>
                                </>
                            ) : (
                                <button className="btn btn-primary" onClick={() => handleModalSave(false)} disabled={isSaving}>
                                    {isSaving ? '⏳ 저장 중...' : (isCreateMode ? '💾 신규 항목 저장' : '💾 모든 변경사항 저장')}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isHistoryModalOpen && (
                <div className="modal-overlay" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1100 }}>
                    <div className="card modal" style={{ width: '90%', maxWidth: '750px', maxHeight: '80vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', backgroundColor: '#fff', borderRadius: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1.2rem', borderBottom: '1px solid #e2e8f0' }}>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                    📜 해당 자산 변경 히스토리 이력
                                </h3>
                                <p style={{ margin: '0.25rem 0 0 0', color: '#64748b', fontSize: '0.82rem' }}>
                                    식별자: <strong>{modalData['카드번호'] || modalData['Card No'] || modalData['S/N'] || modalData.Model || modalData.Number || modalData.TeamsNumber || 'N/A'}</strong> | 현재 사용자: {modalData.User || modalData.NAME || modalData['이름'] || 'STOCK'} ({modalData.email || modalData.EMAIL || '-'})
                                </p>
                            </div>
                            <button className="btn btn-secondary" onClick={() => setIsHistoryModalOpen(false)}>✖</button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem' }}>
                            {isLoadingHistory ? (
                                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#64748b' }}>히스토리 조회 중...</div>
                            ) : assetHistories.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '2.5rem', color: '#94a3b8' }}>
                                    기록된 변경 히스토리가 없습니다. (최근 수정된 자산만 히스토리가 남습니다)
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                                            <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>일시</th>
                                            <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>작업구분</th>
                                            <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>대상자</th>
                                            <th style={{ padding: '8px 10px' }}>변경내용</th>
                                            <th style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>비고</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {assetHistories.map((h, i) => (
                                            <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{h['일시']}</td>
                                                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                                    <span style={{
                                                        padding: '2px 6px',
                                                        borderRadius: '4px',
                                                        fontSize: '0.75rem',
                                                        fontWeight: '600',
                                                        background: (h['작업구분'] || '').includes('반납') ? '#fef3c7' : '#e0e7ff',
                                                        color: (h['작업구분'] || '').includes('반납') ? '#d97706' : '#4338ca',
                                                    }}>
                                                        {h['작업구분']}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>{h['대상자'] || '-'}</td>
                                                <td style={{ padding: '8px 10px', color: '#334155' }}>{h['변경내용']}</td>
                                                <td style={{ padding: '8px 10px', color: '#64748b', fontSize: '0.8rem' }}>{h['비고'] || '-'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>

                        <div style={{ padding: '0.9rem 1.2rem', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <a
                                href="/history"
                                target="_blank"
                                rel="noreferrer"
                                style={{ fontSize: '0.82rem', color: '#4f46e5', textDecoration: 'none', fontWeight: '500' }}
                            >
                                🔗 전체 히스토리 로그 페이지 열기
                            </a>
                            <button className="btn btn-secondary" onClick={() => setIsHistoryModalOpen(false)}>닫기</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default AssetList

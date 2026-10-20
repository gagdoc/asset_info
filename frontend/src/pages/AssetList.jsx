import { useState, useRef, useEffect } from 'react'
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

// 리스 종료 상태 판정 헬퍼
export const getLeaseStatus = (endDateStr) => {
    if (!endDateStr || String(endDateStr).trim() === '' || String(endDateStr).trim() === '-') {
        return { status: 'none', label: '미등록', dDay: null, color: '#94a3b8', bg: '#f1f5f9' }
    }
    const targetDate = parseFlexibleDate(endDateStr)
    if (!targetDate) {
        return { status: 'invalid', label: String(endDateStr), dDay: null, color: '#64748b', bg: '#f8fafc' }
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

    // type(경로 파라미터)가 변경될 때 필터 상태 초기화
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
        queryKey: ['dashboard_search_candidates'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/dashboard/search-candidates')
            return data
        },
        enabled: isUserSearchOpen,
        staleTime: 60000 // Cache for 1 minute
    })

    const assetsWithIdx = assets?.map((row, idx) => ({ ...row, _originalIdx: idx })) || []

    const PRINTER_HIDDEN_COLS_LOWER = ['date', '카트리지 사용 내역']

    const columns = assets?.length > 0
        ? Object.keys(assets[0]).filter(col => {
            const trimmed = col.trim()
            if (/^unnamed[\s_:.\-]*\d*$/i.test(trimmed)) return false
            if (type === 'Printer' && PRINTER_HIDDEN_COLS_LOWER.includes(trimmed.toLowerCase())) return false
            return true
        })
        : []

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

    // ── 상세 수정 / 신규 추가 모달 로직 ──
    const openEditModal = (row) => {
        setIsCreateMode(false)
        setEditingRowIdx(row._originalIdx)
        const cleanRow = { ...row }
        delete cleanRow._originalIdx // backend doesn't need this
        setModalData(cleanRow)
        setIsModalOpen(true)
    }

    const openAddModal = () => {
        setIsCreateMode(true)
        setEditingRowIdx(null)
        const initialData = {}
        columns.forEach(col => {
            initialData[col] = ''
        })
        setModalData(initialData)
        setIsModalOpen(true)
    }

    const handleModalSave = async () => {
        setIsSaving(true)
        try {
            if (isCreateMode) {
                await axios.post('/api/assets/row/add', {
                    asset_type: type,
                    row_data: modalData
                })
                queryClient.invalidateQueries(['assets', type])
                addToast('신규 항목 추가 완료', 'success')
                alert('신규 항목이 추가되었습니다.')
            } else {
                await axios.put('/api/assets/row/update', {
                    asset_type: type,
                    row_index: editingRowIdx,
                    updates: modalData
                })
                queryClient.invalidateQueries(['assets', type])
                addToast('상세 수정 완료', 'success')
                alert('상세 수정이 완료되었습니다.')
            }
            setIsModalOpen(false)
        } catch (err) {
            const actionStr = isCreateMode ? '추가' : '수정'
            addToast(`${actionStr} 실패: ` + (err.response?.data?.detail || err.message), 'error')
            alert(`${actionStr} 실패: ` + (err.response?.data?.detail || err.message))
        } finally {
            setIsSaving(false)
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
        
        const returnText = `${todayStr} / ${name} 반납`;
        if (updates.hasOwnProperty('Additional Information')) {
            updates['Additional Information'] = returnText;
        } else if (updates.hasOwnProperty('참고')) {
            updates['참고'] = returnText;
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
            for (const key of ['S/N', 'Serial', 'Number', 'TeamsNumber', 'Model', 'SNOW Tag']) {
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
        
        // 이름과 이메일은 공통 검색
        if (name.includes(q) || email.includes(q)) return true
        
        // 현재 선택된 자산(type)에 해당하는 기기 정보만 추가 검색 허용
        if (type === 'Lease' && leaseList.includes(q)) return true
        if (type === 'iPad' && ipadList.includes(q)) return true
        if (type === 'Monitor' && monitor.includes(q)) return true
        if (type === 'Printer' && printer.includes(q)) return true
        if (type === 'TeamsNum' && teams.includes(q)) return true
        
        return false
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
                                                const isLeaseEndDateCol = col === '리스 종료 일자' || col === '리스 종료일'
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
                                    {isCreateMode ? `➕ ${type === 'Printer' ? '프린터 신규 등록' : '신규 추가'}` : '📍 상세 정보 수정'}
                                </h3>
                                <button className="btn btn-sm" onClick={() => setIsUserSearchOpen(!isUserSearchOpen)} style={{ backgroundColor: isUserSearchOpen ? '#eff6ff' : '#f3f4f6', color: isUserSearchOpen ? '#1d4ed8' : '#374151', border: `1px solid ${isUserSearchOpen ? '#bfdbfe' : '#d1d5db'}` }}>
                                    🔍 {isUserSearchOpen ? '사용자/기기 검색 닫기' : '기존 사용자 정보 불러오기'}
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
                                                    <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '2px', wordBreak: 'break-all' }}>
                                                        {u['BU'] || u['소속'] || '-'}
                                                        {type === 'Lease' && u['Lease_List'] && u['Lease_List'] !== '-' && ` | 노트북: ${u['Lease_List']}`}
                                                        {type === 'iPad' && u['Ipad_List'] && u['Ipad_List'] !== '-' && ` | 아이패드: ${u['Ipad_List']}`}
                                                        {type === 'Monitor' && u['Monitor'] && u['Monitor'] !== '-' && ` | 모니터: ${u['Monitor']}`}
                                                        {type === 'Printer' && u['Printer'] && u['Printer'] !== '-' && ` | 프린터: ${u['Printer']}`}
                                                        {type === 'TeamsNum' && u['TeamsNum'] && u['TeamsNum'] !== '-' && ` | Teams: ${u['TeamsNum']}`}
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
                                {columns.map(col => {
                                    let placeholder = ''
                                    let helperText = ''
                                    if (col === '리스계번호' || col === '리스계약번호') {
                                        placeholder = '예: LC-2024-001 (리스 계약 번호)'
                                    } else if (col === '리스 종료 일자' || col === '리스 종료일') {
                                        placeholder = 'YYYY-MM-DD 또는 MM/DD/YY (예: 2026-12-31)'
                                        helperText = '리스 계약 만료일 (만료 D-Day 자동 계산)'
                                    } else if (col === 'Lease Date') {
                                        placeholder = 'MM/DD/YY 또는 YYYY-MM-DD (리스 개시일)'
                                    }

                                    return (
                                        <div key={col} className="form-group">
                                            <label className="form-label">
                                                {col}
                                                {col === '리스계번호' && <span style={{ color: '#0284c7', fontSize: '0.8rem', marginLeft: '6px' }}>[계약번호]</span>}
                                                {col === '리스 종료 일자' && <span style={{ color: '#ea580c', fontSize: '0.8rem', marginLeft: '6px' }}>[만료일]</span>}
                                            </label>
                                            <input 
                                                className="form-input"
                                                placeholder={placeholder}
                                                value={modalData[col] !== null ? String(modalData[col]) : ''} 
                                                onChange={e => setModalData({ ...modalData, [col]: e.target.value })}
                                            />
                                            {helperText && <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '3px' }}>{helperText}</div>}
                                        </div>
                                    )
                                })}
                            </div>
                        </div>
                        <div style={{ padding: '1rem', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                            <button className="btn btn-secondary" onClick={() => setIsModalOpen(false)} disabled={isSaving}>취소</button>
                            <button className="btn btn-primary" onClick={handleModalSave} disabled={isSaving}>
                                {isSaving ? '⏳ 저장 중...' : (isCreateMode ? '💾 신규 항목 저장' : '💾 모든 변경사항 저장')}
                            </button>
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
                                    식별자: <strong>{modalData['S/N'] || modalData.Model || modalData.Number || modalData.TeamsNumber || 'N/A'}</strong> | 현재 사용자: {modalData.User || modalData.NAME || modalData['이름'] || 'STOCK'} ({modalData.email || modalData.EMAIL || '-'})
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

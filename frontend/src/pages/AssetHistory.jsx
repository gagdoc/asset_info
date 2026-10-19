import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import {
  FaHistory, FaSearch, FaSyncAlt, FaFileExcel, FaPlus,
  FaCheckCircle, FaLaptop, FaTabletAlt, FaDesktop, FaPrint, FaPhone, FaTimes
} from 'react-icons/fa'
import { useToast } from '../components/Toast'
import { exportToXLSX, todayStr } from '../utils/exportUtils'

const ACTION_COLORS = {
  '반납처리': { bg: '#fef3c7', text: '#d97706', border: '#f59e0b' },
  '정보수정': { bg: '#e0e7ff', text: '#4338ca', border: '#6366f1' },
  '신규추가': { bg: '#dcfce7', text: '#15803d', border: '#22c55e' },
  '행삭제':   { bg: '#fee2e2', text: '#b91c1c', border: '#ef4444' },
}

const TYPE_ICONS = {
  '노트북': <FaLaptop style={{ marginRight: '4px' }} />,
  '아이패드': <FaTabletAlt style={{ marginRight: '4px' }} />,
  '모니터': <FaDesktop style={{ marginRight: '4px' }} />,
  'Teams': <FaPhone style={{ marginRight: '4px' }} />,
  '복합기': <FaPrint style={{ marginRight: '4px' }} />,
}

export default function AssetHistory() {
  const queryClient = useQueryClient()
  const { addToast } = useToast()

  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterAction, setFilterAction] = useState('all')

  // 상세 보기 모달
  const [selectedLog, setSelectedLog] = useState(null)

  // 수동 로그 등록 모달
  const [isManualModalOpen, setIsManualModalOpen] = useState(false)
  const [manualForm, setManualForm] = useState({
    asset_type: '노트북',
    action: '반납처리',
    identifier: '',
    user_name: '',
    user_email: '',
    changes_summary: '',
    memo: '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 히스토리 목록 조회
  const { data: historyList = [], isLoading, isFetching } = useQuery({
    queryKey: ['asset_history', filterType, searchQuery],
    queryFn: async () => {
      const params = { limit: 500 }
      if (filterType !== 'all') params.asset_type = filterType
      if (searchQuery.trim()) params.search = searchQuery.trim()
      const { data } = await axios.get('/api/assets/history', { params })
      return data || []
    },
    staleTime: 10000,
  })

  // 클라이언트 측 작업구분 필터링
  const displayedHistory = useMemo(() => {
    if (filterAction === 'all') return historyList
    return historyList.filter(item => (item['작업구분'] || '').includes(filterAction))
  }, [historyList, filterAction])

  // 통계 계산
  const stats = useMemo(() => {
    let returnCount = 0
    let updateCount = 0
    let addCount = 0
    let deleteCount = 0

    historyList.forEach(item => {
      const action = item['작업구분'] || ''
      if (action.includes('반납')) returnCount++
      else if (action.includes('수정')) updateCount++
      else if (action.includes('추가')) addCount++
      else if (action.includes('삭제')) deleteCount++
    })

    return {
      total: historyList.length,
      returnCount,
      updateCount,
      addCount,
      deleteCount,
    }
  }, [historyList])

  // 엑셀 다운로드
  const handleExport = async () => {
    if (!displayedHistory.length) {
      addToast('다운로드할 데이터가 없습니다.', 'warning')
      return
    }
    const columns = [
      { key: '일시', label: '일시' },
      { key: '자산유형', label: '자산유형' },
      { key: '작업구분', label: '작업구분' },
      { key: '식별자', label: '식별자(S/N 등)' },
      { key: '대상자', label: '대상자' },
      { key: '이메일', label: '이메일' },
      { key: '변경내용', label: '변경내용' },
      { key: '비고', label: '비고' },
    ]
    await exportToXLSX({
      filename: `Asset_History_${todayStr()}`,
      columns,
      rows: displayedHistory,
    })
    addToast('엑셀 다운로드가 완료되었습니다.', 'success')
  }

  // 수동 로그 등록 핸들러
  const handleManualSubmit = async (e) => {
    e.preventDefault()
    if (!manualForm.changes_summary.trim()) {
      alert('변경 내용 또는 처리 사유를 입력해주세요.')
      return
    }
    setIsSubmitting(true)
    try {
      await axios.post('/api/assets/history/add', manualForm)
      addToast('수동 히스토리 로그가 등록되었습니다.', 'success')
      queryClient.invalidateQueries(['asset_history'])
      setIsManualModalOpen(false)
      setManualForm({
        asset_type: '노트북',
        action: '반납처리',
        identifier: '',
        user_name: '',
        user_email: '',
        changes_summary: '',
        memo: '',
      })
    } catch (err) {
      addToast('등록 실패: ' + (err.response?.data?.detail || err.message), 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // JSON 파싱 헬퍼
  const parseJsonSafe = (str) => {
    if (!str) return null
    try {
      return JSON.parse(str)
    } catch {
      return null
    }
  }

  return (
    <div style={{ padding: '1.5rem', maxWidth: '1400px', margin: '0 auto' }}>
      {/* ── 헤더 ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.5rem' }}>
        <div>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', margin: 0, fontSize: '1.7rem', color: '#1e293b' }}>
            <FaHistory style={{ color: '#4f46e5' }} /> 자산 정보 수정 히스토리 로그
          </h1>
          <p style={{ margin: '0.35rem 0 0 0', color: '#64748b', fontSize: '0.92rem' }}>
            노트북 2대 중 1대 반납, 사용자 변경, 정보 수정 등 모든 자산 변경 내역을 추적하고 검증합니다.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-secondary"
            onClick={() => queryClient.invalidateQueries(['asset_history'])}
            disabled={isFetching}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <FaSyncAlt className={isFetching ? 'fa-spin' : ''} /> 새로고침
          </button>
          <button
            className="btn btn-secondary"
            onClick={handleExport}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#16a34a' }}
          >
            <FaFileExcel /> 엑셀 다운로드
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setIsManualModalOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
          >
            <FaPlus /> 수동 로그/메모 등록
          </button>
        </div>
      </div>

      {/* ── 통계 카드 ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
        <div style={{ background: '#ffffff', borderRadius: '10px', padding: '1rem 1.25rem', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.82rem', color: '#64748b', fontWeight: '500' }}>총 히스토리 기록</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#0f172a', marginTop: '0.2rem' }}>{stats.total.toLocaleString()}건</div>
        </div>

        <div style={{ background: '#fffbeb', borderRadius: '10px', padding: '1rem 1.25rem', border: '1px solid #fde68a', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.82rem', color: '#b45309', fontWeight: '500' }}>반납 처리</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#d97706', marginTop: '0.2rem' }}>{stats.returnCount.toLocaleString()}건</div>
        </div>

        <div style={{ background: '#eef2ff', borderRadius: '10px', padding: '1rem 1.25rem', border: '1px solid #c7d2fe', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.82rem', color: '#4338ca', fontWeight: '500' }}>정보 수정</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#4f46e5', marginTop: '0.2rem' }}>{stats.updateCount.toLocaleString()}건</div>
        </div>

        <div style={{ background: '#f0fdf4', borderRadius: '10px', padding: '1rem 1.25rem', border: '1px solid #bbf7d0', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.82rem', color: '#15803d', fontWeight: '500' }}>신규 등록</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#16a34a', marginTop: '0.2rem' }}>{stats.addCount.toLocaleString()}건</div>
        </div>

        <div style={{ background: '#fef2f2', borderRadius: '10px', padding: '1rem 1.25rem', border: '1px solid #fecaca', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ fontSize: '0.82rem', color: '#b91c1c', fontWeight: '500' }}>행 삭제</div>
          <div style={{ fontSize: '1.5rem', fontWeight: '700', color: '#dc2626', marginTop: '0.2rem' }}>{stats.deleteCount.toLocaleString()}건</div>
        </div>
      </div>

      {/* ── 필터 바 ── */}
      <div style={{ background: '#ffffff', borderRadius: '10px', padding: '1.1rem', border: '1px solid #e2e8f0', marginBottom: '1.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.8rem', alignItems: 'center' }}>
        {/* 검색 인풋 */}
        <div style={{ position: 'relative', flex: '1 1 260px' }}>
          <FaSearch style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }} />
          <input
            type="text"
            className="form-control"
            placeholder="S/N, 사용자 이름, 이메일, 변경내용 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ paddingLeft: '36px', width: '100%' }}
          />
        </div>

        {/* 자산 유형 필터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>자산유형:</span>
          <select
            className="form-control"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ minWidth: '130px' }}
          >
            <option value="all">전체 자산</option>
            <option value="노트북">노트북 (Lease)</option>
            <option value="아이패드">아이패드 (iPad)</option>
            <option value="모니터">모니터 (Monitor)</option>
            <option value="Teams">Teams 번호</option>
            <option value="복합기">복합기 (Printer)</option>
            <option value="All_User">사용자 마스터</option>
          </select>
        </div>

        {/* 작업 구분 필터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: '500' }}>작업구분:</span>
          <select
            className="form-control"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            style={{ minWidth: '120px' }}
          >
            <option value="all">전체 작업</option>
            <option value="반납">반납처리</option>
            <option value="수정">정보수정</option>
            <option value="추가">신규추가</option>
            <option value="삭제">행삭제</option>
          </select>
        </div>

        {/* 필터 초기화 버튼 */}
        {(searchQuery || filterType !== 'all' || filterAction !== 'all') && (
          <button
            className="btn btn-secondary"
            onClick={() => {
              setSearchQuery('')
              setFilterType('all')
              setFilterAction('all')
            }}
            style={{ fontSize: '0.82rem', padding: '6px 12px' }}
          >
            필터 초기화
          </button>
        )}
      </div>

      {/* ── 테이블 ── */}
      <div style={{ background: '#ffffff', borderRadius: '10px', border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569', textAlign: 'left' }}>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>일시</th>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>자산유형</th>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>작업구분</th>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>식별자 (S/N 등)</th>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>대상자</th>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>이메일</th>
                <th style={{ padding: '12px 14px', minWidth: '240px' }}>변경내용 요약</th>
                <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>비고</th>
                <th style={{ padding: '12px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>상세</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                    <FaSyncAlt className="fa-spin" style={{ marginRight: '6px' }} /> 히스토리 데이터를 불러오는 중...
                  </td>
                </tr>
              ) : displayedHistory.length === 0 ? (
                <tr>
                  <td colSpan="9" style={{ textAlign: 'center', padding: '3rem', color: '#94a3b8' }}>
                    기록된 히스토리 로그가 없습니다.
                  </td>
                </tr>
              ) : (
                displayedHistory.map((row, idx) => {
                  const actionStyle = ACTION_COLORS[row['작업구분']] || { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' }
                  const typeIcon = TYPE_ICONS[row['자산유형']] || null

                  return (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #f1f5f9',
                        transition: 'background-color 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                      onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#64748b', fontSize: '0.82rem' }}>
                        {row['일시']}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', fontWeight: '500', color: '#334155' }}>
                          {typeIcon} {row['자산유형']}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          fontSize: '0.78rem',
                          fontWeight: '600',
                          background: actionStyle.bg,
                          color: actionStyle.text,
                          border: `1px solid ${actionStyle.border}`,
                        }}>
                          {row['작업구분']}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', fontWeight: '600', color: '#0f172a' }}>
                        {row['식별자'] || '-'}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#1e293b' }}>
                        {row['대상자'] || '-'}
                      </td>
                      <td style={{ padding: '10px 14px', whiteSpace: 'nowrap', color: '#64748b', fontSize: '0.82rem' }}>
                        {row['이메일'] || '-'}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#334155', lineHeight: 1.4 }}>
                        {row['변경내용']}
                      </td>
                      <td style={{ padding: '10px 14px', color: '#64748b', fontSize: '0.82rem' }}>
                        {row['비고'] || '-'}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <button
                          className="btn btn-secondary"
                          onClick={() => setSelectedLog(row)}
                          style={{ padding: '4px 10px', fontSize: '0.78rem' }}
                        >
                          상세보기
                        </button>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── 상세 비교 모달 ── */}
      {selectedLog && (
        <div className="modal-backdrop" onClick={() => setSelectedLog(null)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '800px', width: '90%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.8rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FaHistory style={{ color: '#4f46e5' }} /> 히스토리 상세 내역
              </h3>
              <button className="btn-icon" onClick={() => setSelectedLog(null)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <FaTimes size={18} />
              </button>
            </div>

            <div style={{ overflowY: 'auto', flex: 1, paddingRight: '4px' }}>
              {/* 기본 요약 정보 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '0.8rem', background: '#f8fafc', padding: '1rem', borderRadius: '8px', marginBottom: '1.2rem' }}>
                <div><strong>일시:</strong> {selectedLog['일시']}</div>
                <div><strong>자산유형:</strong> {selectedLog['자산유형']}</div>
                <div><strong>작업구분:</strong> {selectedLog['작업구분']}</div>
                <div><strong>식별자:</strong> {selectedLog['식별자'] || '-'}</div>
                <div><strong>대상자:</strong> {selectedLog['대상자'] || '-'}</div>
                <div><strong>이메일:</strong> {selectedLog['이메일'] || '-'}</div>
              </div>

              <div style={{ marginBottom: '1.2rem' }}>
                <h4 style={{ fontSize: '0.95rem', margin: '0 0 0.4rem 0', color: '#1e293b' }}>📌 변경내용 요약</h4>
                <div style={{ background: '#f1f5f9', padding: '0.8rem 1rem', borderRadius: '6px', fontSize: '0.9rem', color: '#334155', fontWeight: '500' }}>
                  {selectedLog['변경내용']}
                </div>
              </div>

              {selectedLog['비고'] && (
                <div style={{ marginBottom: '1.2rem' }}>
                  <h4 style={{ fontSize: '0.95rem', margin: '0 0 0.4rem 0', color: '#1e293b' }}>📝 비고 / 사유</h4>
                  <div style={{ background: '#f8fafc', padding: '0.8rem 1rem', borderRadius: '6px', fontSize: '0.88rem', color: '#64748b' }}>
                    {selectedLog['비고']}
                  </div>
                </div>
              )}

              {/* 변경 전 vs 변경 후 데이터 비교 */}
              {(() => {
                const beforeObj = parseJsonSafe(selectedLog['변경전'])
                const afterObj = parseJsonSafe(selectedLog['변경후'])

                if (!beforeObj && !afterObj) return null

                const allKeys = Array.from(new Set([
                  ...Object.keys(beforeObj || {}),
                  ...Object.keys(afterObj || {})
                ]))

                return (
                  <div>
                    <h4 style={{ fontSize: '0.95rem', margin: '0 0 0.6rem 0', color: '#1e293b' }}>🔄 상세 데이터 비교 (Before / After)</h4>
                    <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', overflow: 'hidden' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1' }}>
                            <th style={{ padding: '8px 12px', width: '25%', textAlign: 'left' }}>항목 (필드명)</th>
                            <th style={{ padding: '8px 12px', width: '37.5%', textAlign: 'left', color: '#dc2626' }}>변경 전 (Before)</th>
                            <th style={{ padding: '8px 12px', width: '37.5%', textAlign: 'left', color: '#16a34a' }}>변경 후 (After)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {allKeys.map(k => {
                            const bVal = beforeObj ? String(beforeObj[k] ?? '') : ''
                            const aVal = afterObj ? String(afterObj[k] ?? '') : ''
                            const isChanged = bVal !== aVal

                            return (
                              <tr
                                key={k}
                                style={{
                                  borderBottom: '1px solid #f1f5f9',
                                  background: isChanged ? '#fefce8' : 'transparent',
                                }}
                              >
                                <td style={{ padding: '8px 12px', fontWeight: isChanged ? '700' : '500', color: '#475569' }}>
                                  {k} {isChanged && <span style={{ color: '#d97706', fontSize: '0.75rem' }}>●</span>}
                                </td>
                                <td style={{ padding: '8px 12px', color: isChanged ? '#b91c1c' : '#64748b', wordBreak: 'break-all' }}>
                                  {bVal || '-'}
                                </td>
                                <td style={{ padding: '8px 12px', color: isChanged ? '#15803d' : '#64748b', fontWeight: isChanged ? '600' : 'normal', wordBreak: 'break-all' }}>
                                  {aVal || '-'}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.2rem', paddingTop: '0.8rem', borderTop: '1px solid #e2e8f0' }}>
              <button className="btn btn-secondary" onClick={() => setSelectedLog(null)}>
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── 수동 로그 등록 모달 ── */}
      {isManualModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsManualModalOpen(false)}>
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '600px', width: '90%' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.2rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.8rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FaPlus style={{ color: '#4f46e5' }} /> 수동 히스토리 / 확인 로그 등록
              </h3>
              <button className="btn-icon" onClick={() => setIsManualModalOpen(false)} style={{ border: 'none', background: 'transparent', cursor: 'pointer' }}>
                <FaTimes size={18} />
              </button>
            </div>

            <form onSubmit={handleManualSubmit}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.3rem' }}>
                    자산 유형 <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <select
                    className="form-control"
                    value={manualForm.asset_type}
                    onChange={(e) => setManualForm({ ...manualForm, asset_type: e.target.value })}
                    required
                  >
                    <option value="노트북">노트북 (Lease)</option>
                    <option value="아이패드">아이패드 (iPad)</option>
                    <option value="모니터">모니터 (Monitor)</option>
                    <option value="Teams">Teams 번호</option>
                    <option value="복합기">복합기 (Printer)</option>
                    <option value="사용자">사용자 마스터</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.3rem' }}>
                    작업 구분 <span style={{ color: '#dc2626' }}>*</span>
                  </label>
                  <select
                    className="form-control"
                    value={manualForm.action}
                    onChange={(e) => setManualForm({ ...manualForm, action: e.target.value })}
                    required
                  >
                    <option value="반납처리">반납처리 (확인)</option>
                    <option value="정보수정">정보수정</option>
                    <option value="신규추가">신규추가</option>
                    <option value="오프라인확인">오프라인 확인/조사</option>
                    <option value="기타">기타 메모</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.3rem' }}>
                  식별자 (S/N 또는 모델/전화번호)
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="예: C02F1234MD6R"
                  value={manualForm.identifier}
                  onChange={(e) => setManualForm({ ...manualForm, identifier: e.target.value })}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.3rem' }}>
                    대상자 이름
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="예: 홍길동"
                    value={manualForm.user_name}
                    onChange={(e) => setManualForm({ ...manualForm, user_name: e.target.value })}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.3rem' }}>
                    대상자 이메일
                  </label>
                  <input
                    type="email"
                    className="form-control"
                    placeholder="예: user@company.com"
                    value={manualForm.user_email}
                    onChange={(e) => setManualForm({ ...manualForm, user_email: e.target.value })}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.3rem' }}>
                  변경 내용 및 사유 <span style={{ color: '#dc2626' }}>*</span>
                </label>
                <textarea
                  className="form-control"
                  rows="3"
                  placeholder="예: 노트북 2대 중 1대(S/N: C02F1234MD6R) 오프라인 반납 완료 확인, IT STOCK으로 수동 정리 기록"
                  value={manualForm.changes_summary}
                  onChange={(e) => setManualForm({ ...manualForm, changes_summary: e.target.value })}
                  required
                />
              </div>

              <div style={{ marginBottom: '1.2rem' }}>
                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: '600', marginBottom: '0.3rem' }}>
                  추가 비고
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="추가 전달사항 또는 기록자 메모"
                  value={manualForm.memo}
                  onChange={(e) => setManualForm({ ...manualForm, memo: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem', borderTop: '1px solid #e2e8f0', paddingTop: '1rem' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsManualModalOpen(false)}
                  disabled={isSubmitting}
                >
                  취소
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? '저장 중...' : '히스토리 로그 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

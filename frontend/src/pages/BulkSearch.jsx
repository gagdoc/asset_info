import { useState, useMemo, useEffect } from 'react'
import axios from 'axios'
import { FaSearch, FaExclamationTriangle, FaCheckCircle, FaTrashAlt, FaSort, FaSortUp, FaSortDown } from 'react-icons/fa'
import { useToast } from '../components/Toast'
import LoadingModal from '../components/LoadingModal'
import { exportToCSV, todayStr, ExportButton } from '../utils/exportUtils'

const API_BASE = '/api'
const STORAGE_KEY = 'bulkSearch_state'

const readStorage = () => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}')
  } catch { return {} }
}

const TYPE_BADGE_COLOR = {
  '대시보드': '#4f46e5',
  '노트북': '#0ea5e9',
  '아이패드': '#8b5cf6',
  'Teams': '#06b6d4',
  '모니터': '#10b981',
  '복합기': '#f59e0b',
  '사용자(마스터)': '#6366f1',
}

export default function BulkSearch() {
  const [searchInput, setSearchInput] = useState(() => readStorage().searchInput ?? '')
  const [searchType, setSearchType] = useState(() => readStorage().searchType ?? 'all')
  const [searchTarget, setSearchTarget] = useState(() => readStorage().searchTarget ?? 'all')
  const [results, setResults] = useState(() => readStorage().results ?? null)
  const [isSearching, setIsSearching] = useState(false)

  // 결과 내 검색 & 정렬
  const [resultFilter, setResultFilter] = useState(() => readStorage().resultFilter ?? '')
  const [sortKey, setSortKey] = useState(() => readStorage().sortKey ?? null)
  const [sortDir, setSortDir] = useState(() => readStorage().sortDir ?? 'asc')

  const { showToast } = useToast()

  // 상태 변경 시 sessionStorage에 저장 (페이지 이동 후 복귀 시 유지)
  useEffect(() => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      searchInput, searchType, searchTarget, results, resultFilter, sortKey, sortDir
    }))
  }, [searchInput, searchType, searchTarget, results, resultFilter, sortKey, sortDir])

  const handleSearch = async () => {
    if (!searchInput.trim()) {
      showToast('검색어를 입력해주세요.', 'error')
      return
    }
    setIsSearching(true)
    setResultFilter('')
    setSortKey(null)
    try {
      const res = await axios.post(`${API_BASE}/assets/bulk-search`, {
        search_input: searchInput,
        search_type: searchType,
        search_target: searchTarget
      })
      setResults(res.data)
      showToast('검색이 완료되었습니다.', 'success')
    } catch (err) {
      console.error(err)
      showToast('검색 중 오류가 발생했습니다.', 'error')
    } finally {
      setIsSearching(false)
    }
  }

  const clearInput = () => {
    setSearchInput('')
    setResults(null)
    setResultFilter('')
    setSortKey(null)
    setSortDir('asc')
    setSearchType('all')
    setSearchTarget('all')
    sessionStorage.removeItem(STORAGE_KEY)
  }

  const getIdentifier = (data, type) => {
    if (type === '노트북') return data['S/N'] || data['SNOW Tag'] || '-'
    if (type === '아이패드') return data['S/N'] || data['전화 번호'] || '-'
    if (type === 'Teams') {
      // Teams 전화번호 우선 표시
      return data['TeamsNumber'] || data['Number'] || data['전화번호'] || '-'
    }
    if (type === '대시보드') return data['email'] || '-'
    if (type === '사용자(마스터)') return data['email'] || '-'
    return data['email'] || data['이름'] || '-'
  }

  const getName = (d) => d['이름'] || d['NAME'] || d['User'] || ''
  const getBU = (d) => d['BU'] || d['소속'] || ''

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const SortIcon = ({ col }) => {
    if (sortKey !== col) return <FaSort style={{ opacity: 0.3, marginLeft: '0.3rem' }} />
    return sortDir === 'asc'
      ? <FaSortUp style={{ marginLeft: '0.3rem', color: 'var(--primary-color)' }} />
      : <FaSortDown style={{ marginLeft: '0.3rem', color: 'var(--primary-color)' }} />
  }

  const filteredFound = useMemo(() => {
    if (!results?.found) return []
    let list = [...results.found]

    // 결과 내 텍스트 검색
    if (resultFilter.trim()) {
      const q = resultFilter.toLowerCase()
      list = list.filter(item => {
        const d = item.data
        return (
          getName(d).toLowerCase().includes(q) ||
          getBU(d).toLowerCase().includes(q) ||
          (d.email || '').toLowerCase().includes(q) ||
          item.type.toLowerCase().includes(q) ||
          (item.match_term || '').toLowerCase().includes(q)
        )
      })
    }

    // 정렬
    if (sortKey === 'name') {
      list.sort((a, b) => {
        const va = getName(a.data).toLowerCase()
        const vb = getName(b.data).toLowerCase()
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      })
    } else if (sortKey === 'bu') {
      list.sort((a, b) => {
        const va = getBU(a.data).toLowerCase()
        const vb = getBU(b.data).toLowerCase()
        return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va)
      })
    }

    return list
  }, [results, resultFilter, sortKey, sortDir])

  // 이메일 기준 중복 감지: 같은 email이 같은 table_key에 2건 이상 있는 경우
  const duplicateGroups = useMemo(() => {
    if (!results?.found) return []
    const counts = {}
    for (const item of results.found) {
      const email = (item.data?.email || '').toLowerCase().trim()
      if (!email || ['nan', 'none', 'null', ''].includes(email)) continue
      const key = `${email}::${item.table_key}`
      if (!counts[key]) counts[key] = { email, type: item.type, count: 0 }
      counts[key].count++
    }
    return Object.values(counts).filter(g => g.count > 1)
  }, [results])

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">🔍 대량 검색 (Bulk Search)</h1>
          <p className="page-subtitle">이메일, 시리얼 번호, 전화번호 등을 한꺼번에 입력하여 자산 정보를 찾습니다.</p>
        </div>
      </div>

      <div className="card" style={{ marginBottom: '2rem' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h3 style={{ margin: 0 }}>검색어 입력</h3>
          <button className="btn btn-outline" onClick={clearInput} style={{ padding: '0.4rem 0.8rem', fontSize: '0.85rem' }}>
             <FaTrashAlt style={{ marginRight: '0.4rem' }} /> 초기화
          </button>
        </div>
        <div className="card-body">
          <textarea
            className="input-field"
            style={{
              width: '100%',
              height: '150px',
              fontFamily: 'monospace',
              fontSize: '0.9rem',
              lineHeight: '1.5',
              padding: '1rem',
              borderRadius: '8px',
              border: '1px solid var(--border-color)',
              marginBottom: '1rem'
            }}
            placeholder={"이메일, 시리얼 번호 등을 줄바꿈(Enter)이나 쉼표(,)로 구분하여 입력하세요.\n예:\nuser@example.com\nSN123456789\n010-1234-5678"}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold' }}>검색어 입력 항목 지정</label>
              <select className="input-field" value={searchType} onChange={(e) => setSearchType(e.target.value)} style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)' }}>
                <option value="all">전체</option>
                <option value="email">이메일</option>
                <option value="serial_laptop">노트북 시리얼</option>
                <option value="serial_ipad">아이패드 시리얼</option>
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', fontWeight: 'bold' }}>대량 검색 옵션 지정 (대상)</label>
              <select className="input-field" value={searchTarget} onChange={(e) => setSearchTarget(e.target.value)} style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--card-bg)', color: 'var(--text-primary)' }}>
                <option value="all">전체 검색</option>
                <option value="dashboard">대시보드 (통합 정보)</option>
                <option value="laptop">노트북</option>
                <option value="ipad">아이패드</option>
              </select>
            </div>
          </div>
          <button
            className="btn btn-primary"
            style={{ width: '100%', padding: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}
            onClick={handleSearch}
            disabled={isSearching}
          >
            <FaSearch /> {isSearching ? '검색 중...' : '대량 검색 실행'}
          </button>
        </div>
      </div>

      {isSearching && <LoadingModal message="데이터를 검색 중입니다..." />}

      {results && (
        <div className="results-container">
          {/* 요약 카드 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', borderTop: '4px solid var(--primary-color)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>발견된 항목</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{results.found_count ?? results.found.length}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>고유 검색어 수</div>
            </div>
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', borderTop: '4px solid var(--danger-color)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>찾지 못한 항목</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--danger-color)' }}>{results.notFound.length}</div>
            </div>
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', borderTop: '4px solid #f59e0b' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>이메일 중복</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: '#f59e0b' }}>{duplicateGroups.length}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>그룹</div>
            </div>
          </div>

          {/* 찾지 못한 항목 */}
          {results.notFound.length > 0 && (
            <div className="card" style={{ marginBottom: '2rem', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
              <div className="card-header" style={{ backgroundColor: 'rgba(239, 68, 68, 0.05)', color: 'var(--danger-color)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FaExclamationTriangle /> <h3>찾지 못한 항목 리스트</h3>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {results.notFound.map((term, idx) => (
                    <span key={idx} style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      color: 'var(--danger-color)',
                      padding: '0.3rem 0.8rem',
                      borderRadius: '20px',
                      fontSize: '0.85rem',
                      border: '1px solid rgba(239, 68, 68, 0.2)'
                    }}>
                      {term}
                    </span>
                  ))}
                </div>
                <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  * 위 항목들은 모든 자산 테이블에서 검색 결과가 발견되지 않았습니다. 오타가 있는지 확인해 주세요.
                </p>
              </div>
            </div>
          )}

          {/* 이메일 중복 항목 */}
          {duplicateGroups.length > 0 && (
            <div className="card" style={{ marginBottom: '2rem', border: '1px solid rgba(245, 158, 11, 0.3)' }}>
              <div className="card-header" style={{ backgroundColor: 'rgba(245, 158, 11, 0.07)', color: '#b45309', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <FaExclamationTriangle /> <h3>이메일 중복 항목 리스트</h3>
              </div>
              <div className="card-body">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {duplicateGroups.map((g, idx) => (
                    <span key={idx} style={{
                      backgroundColor: 'rgba(245, 158, 11, 0.1)',
                      color: '#92400e',
                      padding: '0.3rem 0.8rem',
                      borderRadius: '20px',
                      fontSize: '0.85rem',
                      border: '1px solid rgba(245, 158, 11, 0.3)'
                    }}>
                      {g.email}
                      <span style={{ marginLeft: '6px', fontWeight: 'bold', color: '#b45309' }}>
                        ({g.type} {g.count}건)
                      </span>
                    </span>
                  ))}
                </div>
                <p style={{ marginTop: '1rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  * 위 이메일은 동일 테이블에 2건 이상 등록된 중복 데이터입니다. 자산 리스트에서 확인 후 정리해 주세요.
                </p>
              </div>
            </div>
          )}

          {/* 검색 결과 테이블 */}
          {results.found.length > 0 && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success-color)' }}>
                  <FaCheckCircle /> <h3 style={{ margin: 0 }}>검색 결과 ({filteredFound.length} / {results.found.length}행)</h3>
                </div>
                <ExportButton
                  onClick={() => {
                    const rows = filteredFound.map(item => ({
                      '검색어': item.match_term || '',
                      '자산유형': item.type || '',
                      ...item.data
                    }))
                    exportToCSV(rows, `대량검색결과_${todayStr()}`)
                  }}
                  disabled={filteredFound.length === 0}
                />
                {/* 결과 내 검색 */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                  <FaSearch style={{ position: 'absolute', left: '0.6rem', color: 'var(--text-secondary)', fontSize: '0.75rem' }} />
                  <input
                    type="text"
                    placeholder="결과 내 검색..."
                    value={resultFilter}
                    onChange={e => setResultFilter(e.target.value)}
                    style={{
                      padding: '0.4rem 0.8rem 0.4rem 1.8rem',
                      borderRadius: '6px',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--card-bg)',
                      color: 'var(--text-primary)',
                      fontSize: '0.85rem',
                      width: '180px'
                    }}
                  />
                </div>
              </div>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSort('name')}
                      >
                        사용자 <SortIcon col="name" />
                      </th>
                      <th
                        style={{ cursor: 'pointer', userSelect: 'none' }}
                        onClick={() => handleSort('bu')}
                      >
                        부서 <SortIcon col="bu" />
                      </th>
                      <th>식별 정보</th>
                      <th>모델 / 상세</th>
                      <th>매치된 필드</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredFound.map((item, idx) => {
                      const d = item.data
                      const badgeColor = TYPE_BADGE_COLOR[item.type] || '#6b7280'
                      // "전체 검색"에서 All_User 결과 → 구분을 "대시보드"로 표시
                      const displayType = item.type
                      return (
                        <tr key={idx}>
                          <td>
                            <span style={{
                              display: 'inline-block',
                              padding: '0.2rem 0.6rem',
                              borderRadius: '12px',
                              fontSize: '0.78rem',
                              fontWeight: '600',
                              color: '#fff',
                              backgroundColor: badgeColor,
                              whiteSpace: 'nowrap'
                            }}>
                              {displayType}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: '600' }}>{d['이름'] || d['NAME'] || d['User'] || '-'}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{d.email || '-'}</div>
                          </td>
                          <td>
                            <span style={{ fontSize: '0.85rem' }}>{d.BU || '-'}</span>
                            {d.ROLE && <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{d.ROLE}</div>}
                          </td>
                          <td>
                            <div style={{ fontWeight: '500', color: 'var(--primary-color)', fontFamily: 'monospace', fontSize: '0.85rem' }}>
                              {getIdentifier(d, item.type)}
                            </div>
                          </td>
                          <td>
                            {item.table_key === 'dashboard' ? (
                              <>
                                <div style={{ fontSize: '0.8rem', marginBottom: '2px' }}><span style={{ fontWeight: 'bold' }}>노트북:</span> {d.Lease_List && d.Lease_List !== '-' ? <span style={{ color: 'var(--primary-color)' }}>{d.Lease_List}</span> : '-'}</div>
                                <div style={{ fontSize: '0.8rem', marginBottom: '2px' }}><span style={{ fontWeight: 'bold' }}>아이패드:</span> {d.Ipad_List && d.Ipad_List !== '-' ? <span style={{ color: 'var(--primary-color)' }}>{d.Ipad_List}</span> : '-'}</div>
                                <div style={{ fontSize: '0.8rem' }}><span style={{ fontWeight: 'bold' }}>모니터:</span> {d.Monitor && d.Monitor !== '-' ? d.Monitor : '-'}</div>
                              </>
                            ) : (
                              <>
                                <div>{d.Model || d['History'] || d['프린터정보'] || '-'}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{d['SNOW Tag'] || d['Additional Information'] || ''}</div>
                              </>
                            )}
                          </td>
                          <td>
                            <div style={{ fontSize: '0.8rem' }}>
                              <span style={{ color: 'var(--text-secondary)' }}>검색어:</span> <strong>{item.match_term}</strong>
                              <br />
                              <span style={{ color: 'var(--text-secondary)' }}>필드:</span> {item.match_col}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {results.found.length === 0 && results.notFound.length === 0 && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-secondary)' }}>
              결과가 없습니다.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

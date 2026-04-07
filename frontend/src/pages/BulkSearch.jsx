import { useState } from 'react'
import axios from 'axios'
import { FaSearch, FaExclamationTriangle, FaCheckCircle, FaTrashAlt } from 'react-icons/fa'
import { useToast } from '../components/Toast'
import LoadingModal from '../components/LoadingModal'

const API_BASE = '/api'

export default function BulkSearch() {
  const [searchInput, setSearchInput] = useState('')
  const [searchType, setSearchType] = useState('all')
  const [searchTarget, setSearchTarget] = useState('all')
  const [results, setResults] = useState(null)
  const [isSearching, setIsSearching] = useState(false)
  const { showToast } = useToast()

  const handleSearch = async () => {
    if (!searchInput.trim()) {
      showToast('검색어를 입력해주세요.', 'error')
      return
    }

    setIsSearching(true)
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
  }

  const getIdentifier = (data, type) => {
    if (type === '노트북') return data['S/N'] || data['SNOW Tag'] || '-'
    if (type === '아이패드') return data['S/N'] || data['전화 번호'] || '-'
    if (type === 'Teams') return data['Number formated for Country'] || data['LineURI'] || '-'
    if (type === '대시보드') return data['email'] || '-'
    return data['email'] || data['이름'] || '-'
  }

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
            placeholder="이메일, 시리얼 번호 등을 줄바꿈(Enter)이나 쉼표(,)로 구분하여 입력하세요.&#10;예:&#10;user@example.com&#10;SN123456789&#10;010-1234-5678"
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
                <option value="all">전체</option>
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', borderTop: '4px solid var(--primary-color)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>발견된 항목</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary-color)' }}>{results.found.length}</div>
            </div>
            <div className="card" style={{ padding: '1.5rem', textAlign: 'center', borderTop: '4px solid var(--danger-color)' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>찾지 못한 항목</div>
              <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--danger-color)' }}>{results.notFound.length}</div>
            </div>
          </div>

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

          {results.found.length > 0 && (
            <div className="card">
              <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--success-color)' }}>
                <FaCheckCircle /> <h3>검색 결과 ({results.found.length}건)</h3>
              </div>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>구분</th>
                      <th>사용자 / 부서</th>
                      <th>식별 정보 (S/N 등)</th>
                      <th>모델 / 상세</th>
                      <th>매치된 필드</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.found.map((item, idx) => {
                      const d = item.data;
                      return (
                        <tr key={idx}>
                          <td>
                            <span className={`badge badge-${item.table_key === 'Lease' ? 'primary' : 'info'}`}>
                              {item.type}
                            </span>
                          </td>
                          <td>
                            <div style={{ fontWeight: '600' }}>{d.이름 || d.NAME || d.User || '-'}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{d.email || '-'}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{d.BU || '-'}</div>
                          </td>
                          <td>
                            <div style={{ fontWeight: '500', color: 'var(--primary-color)', fontFamily: 'monospace' }}>
                              {getIdentifier(d, item.type)}
                            </div>
                          </td>
                          <td>
                            {item.table_key === 'dashboard' ? (
                              <>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '2px' }}><span style={{fontWeight: 'bold'}}>노트북:</span> {d.Lease_List && d.Lease_List !== '-' ? <span style={{color:'var(--primary-color)'}}>{d.Lease_List}</span> : '-'}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '2px' }}><span style={{fontWeight: 'bold'}}>아이패드:</span> {d.Ipad_List && d.Ipad_List !== '-' ? <span style={{color:'var(--primary-color)'}}>{d.Ipad_List}</span> : '-'}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginBottom: '2px' }}><span style={{fontWeight: 'bold'}}>모니터:</span> {d.Monitor && d.Monitor !== '-' ? d.Monitor : '-'}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}><span style={{fontWeight: 'bold'}}>ROLE:</span> {d.ROLE || '-'}</div>
                              </>
                            ) : (
                              <>
                                <div>{d.Model || d['Business Title'] || d['프린터정보'] || '-'}</div>
                                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{d['SNOW Tag'] || d['Additional Information'] || ''}</div>
                              </>
                            )}
                          </td>
                          <td>
                            <div style={{ fontSize: '0.8rem' }}>
                               <span style={{ color: 'var(--text-secondary)' }}>검색어:</span> <strong>{item.match_term}</strong>
                               <br/>
                               <span style={{ color: 'var(--text-secondary)' }}>필드:</span> {item.match_col}
                            </div>
                          </td>
                        </tr>
                      );
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

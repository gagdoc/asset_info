import { useState, useCallback } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { FaBars } from 'react-icons/fa'
import { ToastProvider } from './components/Toast'
import ErrorBoundary from './components/ErrorBoundary'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import AssetList from './pages/AssetList'
import Consumables from './pages/Consumables'
import NewHire from './pages/NewHire'
import Resign from './pages/Resign'
import DeptConfig from './pages/DeptConfig'
import ExcelUpload from './pages/ExcelUpload'
import SelfOutbound from './pages/SelfOutbound'
import BulkSearch from './pages/BulkSearch'

// ── 전역 개발 환경 배너 ──────────────────────────────────────────
function DevEnvBanner() {
  const queryClient = useQueryClient()
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [showDetail, setShowDetail] = useState(false)

  const { data: envStatus } = useQuery({
    queryKey: ['admin-env-status'],
    queryFn: async () => {
      const { data } = await axios.get('/api/admin/env-status')
      return data
    },
    staleTime: Infinity,
    retry: false,
  })

  const handleSyncProdToTest = useCallback(async () => {
    if (!window.confirm(
      '운영 데이터를 테스트 시트에 복사합니다.\n' +
      '기존 테스트 데이터는 덮어씌워집니다. 진행하시겠습니까?'
    )) return

    setIsSyncing(true)
    setSyncResult(null)
    try {
      const { data } = await axios.post('/api/admin/sync-prod-to-test')
      setSyncResult(data)
      // 캐시 전체 초기화
      queryClient.invalidateQueries()
      alert(`✅ 동기화 완료!\n${data.summary?.total_tabs || 0}개 탭, ${(data.summary?.total_rows || 0).toLocaleString()}행 복사`)
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message
      setSyncResult({ success: false, error: msg })
      alert(`❌ 동기화 실패: ${msg}`)
    } finally {
      setIsSyncing(false)
    }
  }, [queryClient])

  // 운영 환경이거나 아직 응답 전이면 배너 미표시
  if (!envStatus || envStatus.is_production) return null

  const testConfigured = envStatus.test_sheets_configured
  const activeIds = envStatus.active_sheet_ids || {}

  return (
    <div style={{
      background: testConfigured ? '#fff7ed' : '#fef2f2',
      borderBottom: `3px solid ${testConfigured ? '#f97316' : '#ef4444'}`,
      padding: '8px 20px',
      display: 'flex', alignItems: 'center', gap: '12px',
      flexWrap: 'wrap', fontSize: '0.85rem', position: 'sticky', top: 0, zIndex: 1000,
    }}>
      {/* 환경 표시 */}
      <span style={{ fontSize: '1.1em' }}>🧪</span>
      <strong style={{ color: testConfigured ? '#c2410c' : '#dc2626' }}>
        {testConfigured ? '개발 모드 — 테스트 시트 연결됨' : '개발 모드 — ⚠️ 테스트 시트 미설정 (운영 시트 사용 중!)'}
      </strong>

      {/* 시트 상태 토글 */}
      <button
        onClick={() => setShowDetail(v => !v)}
        style={{ background: 'none', border: '1px solid #f97316', borderRadius: '4px', padding: '2px 8px', cursor: 'pointer', color: '#c2410c', fontSize: '0.8em' }}
      >
        {showDetail ? '▲ 시트 정보 숨기기' : '▼ 시트 정보 보기'}
      </button>

      {/* 운영→테스트 동기화 버튼 */}
      {testConfigured && (
        <button
          onClick={handleSyncProdToTest}
          disabled={isSyncing}
          style={{
            background: isSyncing ? '#fed7aa' : '#ea580c', color: 'white',
            border: 'none', borderRadius: '6px', padding: '5px 14px',
            cursor: isSyncing ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.85em',
          }}
        >
          {isSyncing ? '⏳ 동기화 중...' : '📥 실제 데이터 가져오기'}
        </button>
      )}

      {/* 미설정 시 안내 */}
      {!testConfigured && (
        <span style={{ color: '#dc2626', fontSize: '0.82em' }}>
          scripts/create_test_sheets.py 를 실행하고 .env.development에 ID를 설정하세요
        </span>
      )}

      {/* 시트 상세 정보 */}
      {showDetail && (
        <div style={{ width: '100%', marginTop: '6px', background: 'white', borderRadius: '6px', padding: '10px 14px', border: '1px solid #fed7aa', fontSize: '0.82em', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '4px' }}>
          {Object.entries(activeIds).map(([key, id]) => (
            <div key={key} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ color: '#64748b', minWidth: '160px' }}>{key}:</span>
              <a
                href={id ? `https://docs.google.com/spreadsheets/d/${id}` : '#'}
                target="_blank" rel="noreferrer"
                style={{ color: '#2563eb', textDecoration: 'none', fontFamily: 'monospace', fontSize: '0.9em' }}
              >
                {id ? `${id.slice(0, 20)}…` : '❌ 미설정'}
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const location = useLocation()
  const isRegisterPage = location.pathname === '/register'

  return (
    <ToastProvider>
      <div className={`app-container ${isRegisterPage ? 'centered-layout' : ''}`}>
        {!isRegisterPage && (
          <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
        )}

        <div className="main-wrapper">
          {/* 전역 개발 환경 배너 (운영에서는 자동 숨김) */}
          {!isRegisterPage && <DevEnvBanner />}

          {!isRegisterPage && (
            <div className="mobile-header">
              <button className="btn-icon" onClick={() => setIsMobileMenuOpen(true)}>
                <FaBars size={20} />
              </button>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>📦 Asset Manager</h2>
            </div>
          )}

          <main className="main-content">
            <ErrorBoundary>
            <Routes>
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/assets/:type" element={<AssetList />} />
              <Route path="/consumables" element={<Consumables />} />
              <Route path="/newhire" element={<NewHire />} />
              <Route path="/resign" element={<Resign />} />
              <Route path="/config" element={<DeptConfig />} />
              <Route path="/upload" element={<ExcelUpload />} />
              <Route path="/register" element={<SelfOutbound />} />
              <Route path="/bulk-search" element={<BulkSearch />} />
            </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}

export default App

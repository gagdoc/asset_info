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
import PublicConsumables from './pages/PublicConsumables'

// ── 전역 개발 환경 배너 ──────────────────────────────────────────
function DevEnvBanner() {
  const queryClient = useQueryClient()
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)

  const { data: envStatus } = useQuery({
    queryKey: ['admin-env-status'],
    queryFn: async () => {
      const { data } = await axios.get('/api/admin/env-status')
      return data
    },
    staleTime: Infinity,
    retry: false,
  })

  const handleDownload = useCallback(async () => {
    if (!window.confirm(
      '운영 데이터를 로컬로 다운로드합니다.\n' +
      '기존 로컬 데이터는 덮어씌워집니다. 진행하시겠습니까?'
    )) return

    setIsSyncing(true)
    setSyncResult(null)
    try {
      const { data } = await axios.post('/api/admin/sync-prod-to-local')
      setSyncResult(data)
      queryClient.invalidateQueries()
      alert(`✅ 다운로드 완료!\n${data.summary?.total_tabs || 0}개 탭, ${(data.summary?.total_rows || 0).toLocaleString()}행 저장`)
    } catch (e) {
      const msg = e?.response?.data?.detail || e.message
      setSyncResult({ success: false, error: msg })
      alert(`❌ 다운로드 실패: ${msg}`)
    } finally {
      setIsSyncing(false)
    }
  }, [queryClient])

  // 운영 환경이거나 아직 응답 전이면 배너 미표시
  if (!envStatus || envStatus.is_production) return null

  const localReady = envStatus.local_data_exists

  return (
    <div style={{
      background: localReady ? '#fff7ed' : '#fef2f2',
      borderBottom: `3px solid ${localReady ? '#f97316' : '#ef4444'}`,
      padding: '8px 20px',
      display: 'flex', alignItems: 'center', gap: '12px',
      flexWrap: 'wrap', fontSize: '0.85rem', position: 'sticky', top: 0, zIndex: 1000,
    }}>
      <span style={{ fontSize: '1.1em' }}>🧪</span>
      <strong style={{ color: localReady ? '#c2410c' : '#dc2626' }}>
        {localReady
          ? '개발 모드 — 로컬 데이터 사용 중 (운영 데이터 완전 격리)'
          : '개발 모드 — ⚠️ 로컬 데이터 없음 (운영 시트 직접 사용 중!)'}
      </strong>

      <button
        onClick={handleDownload}
        disabled={isSyncing}
        style={{
          background: isSyncing ? '#fed7aa' : '#ea580c', color: 'white',
          border: 'none', borderRadius: '6px', padding: '5px 14px',
          cursor: isSyncing ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '0.85em',
        }}
      >
        {isSyncing ? '⏳ 다운로드 중...' : '📥 실제 데이터 가져오기'}
      </button>

      {!localReady && (
        <span style={{ color: '#dc2626', fontSize: '0.82em' }}>
          "실제 데이터 가져오기" 버튼을 눌러 운영 데이터를 로컬에 저장하세요
        </span>
      )}
    </div>
  )
}

function App() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const location = useLocation()
  const isStandalonePage = location.pathname === '/register' || location.pathname === '/public-consumables'

  return (
    <ToastProvider>
      <div className={`app-container ${isStandalonePage ? 'centered-layout' : ''}`}>
        {!isStandalonePage && (
          <Sidebar isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />
        )}

        <div className="main-wrapper">
          {/* 전역 개발 환경 배너 (운영에서는 자동 숨김) */}
          {!isStandalonePage && <DevEnvBanner />}

          {!isStandalonePage && (
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
              <Route path="/public-consumables" element={<PublicConsumables />} />
            </Routes>
            </ErrorBoundary>
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}

export default App

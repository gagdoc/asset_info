import { useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { FaBars } from 'react-icons/fa'
import { ToastProvider } from './components/Toast'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import AssetList from './pages/AssetList'
import Consumables from './pages/Consumables'
import NewHire from './pages/NewHire'
import Resign from './pages/Resign'
import DeptConfig from './pages/DeptConfig'
import ExcelUpload from './pages/ExcelUpload'
import SelfOutbound from './pages/SelfOutbound'

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
          {!isRegisterPage && (
            <div className="mobile-header">
              <button className="btn-icon" onClick={() => setIsMobileMenuOpen(true)}>
                <FaBars size={20} />
              </button>
              <h2 style={{ margin: 0, fontSize: '1.2rem' }}>📦 Asset Manager</h2>
            </div>
          )}
          
          <main className="main-content">
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
            </Routes>
          </main>
        </div>
      </div>
    </ToastProvider>
  )
}

export default App

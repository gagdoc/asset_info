import { Routes, Route, Navigate } from 'react-router-dom'
import { ToastProvider } from './components/Toast'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import AssetList from './pages/AssetList'
import Consumables from './pages/Consumables'
import NewHire from './pages/NewHire'
import Resign from './pages/Resign'
import DeptConfig from './pages/DeptConfig'
import ExcelUpload from './pages/ExcelUpload'

function App() {
  return (
    <ToastProvider>
      <div className="app-container">
        <Sidebar />
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
          </Routes>
        </main>
      </div>
    </ToastProvider>
  )
}

export default App

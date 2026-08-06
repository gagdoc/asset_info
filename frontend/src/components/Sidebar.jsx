import { NavLink } from 'react-router-dom'
import { FaHome, FaSearch, FaLaptop, FaTabletAlt, FaPrint, FaDesktop, FaPhone, FaUserPlus, FaUserTimes, FaBoxOpen, FaCog, FaUpload, FaExternalLinkAlt, FaTimes, FaExchangeAlt } from 'react-icons/fa'

const Sidebar = ({ isOpen, onClose }) => {
    const assetItems = [
        { name: '대량 검색 (Bulk Search)', path: '/bulk-search', icon: <FaSearch /> },
        { name: '노트북 (Lease)', path: '/assets/Lease', icon: <FaLaptop /> },
        { name: '아이패드 (iPad)', path: '/assets/iPad', icon: <FaTabletAlt /> },
        { name: '모니터 (Monitor)', path: '/assets/Monitor', icon: <FaDesktop /> },
        { name: '프린터 (Printer)', path: '/assets/Printer', icon: <FaPrint /> },
        { name: 'Teams 번호', path: '/assets/Teams', icon: <FaPhone /> },
    ]

    const personItems = [
        { name: '신규 입사자', path: '/newhire', icon: <FaUserPlus /> },
        { name: '퇴사자 관리', path: '/resign', icon: <FaUserTimes /> },
    ]

    const systemItems = [
        { name: '소모품 관리', path: '/consumables', icon: <FaBoxOpen /> },
        { name: '대여 관리 (Rentals)', path: '/rentals', icon: <FaExchangeAlt /> },
        { name: 'BU/ROLE 설정', path: '/config', icon: <FaCog /> },
        { name: '엑셀 업로드', path: '/upload', icon: <FaUpload /> },
    ]

    return (
        <>
        {isOpen && <div className="sidebar-overlay" onClick={onClose}></div>}
        <aside className={`sidebar ${isOpen ? 'open' : ''}`}>
            <div className="sidebar-logo" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                    <h2>📦 Asset Manager</h2>
                    <small>사내 자산 & 소모품 관리</small>
                </div>
                <button className="btn-icon mobile-close-btn" onClick={onClose} style={{ color: 'white', display: 'none' }}>
                    <FaTimes size={20} />
                </button>
            </div>

            <NavLink to="/dashboard" onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <FaHome /> <span>대시보드</span>
            </NavLink>

            <div className="sidebar-section">자산 관리</div>
            {assetItems.map(item => (
                <NavLink key={item.path} to={item.path} onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    {item.icon} <span>{item.name}</span>
                </NavLink>
            ))}

            <div className="sidebar-section">인사 관리</div>
            {personItems.map(item => (
                <NavLink key={item.path} to={item.path} onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    {item.icon} <span>{item.name}</span>
                </NavLink>
            ))}

            <div className="sidebar-section">시스템</div>
            {systemItems.map(item => (
                <NavLink key={item.path} to={item.path} onClick={onClose} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    {item.icon} <span>{item.name}</span>
                </NavLink>
            ))}

            <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.08)' }}>
                <NavLink to="/register" onClick={onClose} className="nav-link" style={{ color: '#818cf8', fontWeight: '600' }}>
                    <FaExternalLinkAlt /> <span>출고 등록 (자가용)</span>
                </NavLink>
            </div>

            <div style={{ padding: '0.75rem 1rem 0.5rem', fontSize: '0.72rem', color: 'rgba(255,255,255,0.3)', textAlign: 'center', letterSpacing: '0.03em' }}>
                v2026.04.13
            </div>
        </aside>
        </>
    )
}

export default Sidebar

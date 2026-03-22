import { NavLink } from 'react-router-dom'
import { FaHome, FaLaptop, FaTabletAlt, FaPrint, FaDesktop, FaPhone, FaUserPlus, FaUserTimes, FaBoxOpen, FaCog, FaUpload } from 'react-icons/fa'

const Sidebar = () => {
    const assetItems = [
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
        { name: 'BU/ROLE 설정', path: '/config', icon: <FaCog /> },
        { name: '엑셀 업로드', path: '/upload', icon: <FaUpload /> },
    ]

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <h2>📦 Asset Manager</h2>
                <small>사내 자산 & 소모품 관리</small>
            </div>

            <NavLink to="/dashboard" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <FaHome /> <span>대시보드</span>
            </NavLink>

            <div className="sidebar-section">자산 관리</div>
            {assetItems.map(item => (
                <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    {item.icon} <span>{item.name}</span>
                </NavLink>
            ))}

            <div className="sidebar-section">인사 관리</div>
            {personItems.map(item => (
                <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    {item.icon} <span>{item.name}</span>
                </NavLink>
            ))}

            <div className="sidebar-section">시스템</div>
            {systemItems.map(item => (
                <NavLink key={item.path} to={item.path} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                    {item.icon} <span>{item.name}</span>
                </NavLink>
            ))}
        </aside>
    )
}

export default Sidebar

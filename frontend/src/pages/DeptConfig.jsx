import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { useToast } from '../components/Toast'

const DeptConfig = () => {
    const queryClient = useQueryClient()
    const { addToast } = useToast()

    const { data, isLoading } = useQuery({
        queryKey: ['deptConfig'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/config/dept')
            return data
        }
    })

    const [newBU, setNewBU] = useState('')
    const [selectedBU, setSelectedBU] = useState('')
    const [newRole, setNewRole] = useState('')

    const buList = data?.bu_list || []
    const allData = data?.data || []

    const roleList = allData
        .filter(d => d.BU === selectedBU && d.ROLE && d.ROLE.trim())
        .map(d => d.ROLE)
        .filter((v, i, a) => a.indexOf(v) === i)

    // Set default selected BU
    if (!selectedBU && buList.length > 0) {
        setSelectedBU(buList[0])
    }

    const addBU = async () => {
        if (!newBU.trim()) return
        try {
            await axios.post('/api/assets/config/dept/add', { BU: newBU.trim(), ROLE: '' })
            addToast(`✅ '${newBU}' BU 추가 완료`, 'success')
            setNewBU('')
            queryClient.invalidateQueries(['deptConfig'])
        } catch (err) {
            addToast('추가 실패', 'error')
        }
    }

    const deleteBU = async (bu) => {
        if (!confirm(`'${bu}' BU와 하위 모든 ROLE을 삭제하시겠습니까?`)) return
        try {
            await axios.post('/api/assets/config/dept/delete', { BU: bu, ROLE: '' })
            addToast(`✅ '${bu}' 삭제 완료`, 'success')
            queryClient.invalidateQueries(['deptConfig'])
            if (selectedBU === bu) setSelectedBU('')
        } catch (err) {
            addToast('삭제 실패', 'error')
        }
    }

    const addRole = async () => {
        if (!newRole.trim() || !selectedBU) return
        try {
            await axios.post('/api/assets/config/dept/add', { BU: selectedBU, ROLE: newRole.trim() })
            addToast(`✅ '${newRole}' ROLE 추가 완료`, 'success')
            setNewRole('')
            queryClient.invalidateQueries(['deptConfig'])
        } catch (err) {
            addToast('추가 실패', 'error')
        }
    }

    const deleteRole = async (role) => {
        try {
            await axios.post('/api/assets/config/dept/delete', { BU: selectedBU, ROLE: role })
            addToast(`✅ '${role}' 삭제 완료`, 'success')
            queryClient.invalidateQueries(['deptConfig'])
        } catch (err) {
            addToast('삭제 실패', 'error')
        }
    }

    if (isLoading) return <div className="loading"><div className="spinner" /> 로딩중...</div>

    return (
        <div>
            <h1>⚙️ BU/ROLE 카테고리 관리</h1>
            <div className="alert alert-info">
                1차 카테고리 BU를 생성하고, 각 BU 하위에 2차 카테고리 ROLE을 추가하세요.
            </div>

            {/* BU Management */}
            <div className="card">
                <h3>🏢 1차 카테고리 (BU) 관리</h3>
                <div className="flex gap-1 mb-2">
                    <input className="form-input" style={{ maxWidth: '300px' }} value={newBU} onChange={e => setNewBU(e.target.value)}
                        placeholder="새 BU 이름" onKeyDown={e => e.key === 'Enter' && addBU()} />
                    <button className="btn btn-primary btn-sm" onClick={addBU}>➕ BU 추가</button>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {buList.map(bu => (
                        <div key={bu} style={{
                            display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.75rem',
                            background: bu === selectedBU ? 'var(--primary-light)' : '#f3f4f6',
                            border: bu === selectedBU ? '1px solid var(--primary)' : '1px solid var(--border-color)',
                            borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem'
                        }}
                            onClick={() => setSelectedBU(bu)}
                        >
                            <span>{bu}</span>
                            <button className="btn-icon" style={{ color: '#ef4444', fontSize: '0.7rem' }} onClick={(e) => { e.stopPropagation(); deleteBU(bu) }}>✕</button>
                        </div>
                    ))}
                    {buList.length === 0 && <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>추가된 BU가 없습니다.</span>}
                </div>
            </div>

            {/* ROLE Management */}
            {selectedBU && (
                <div className="card">
                    <h3>📋 '{selectedBU}' 하위 ROLE 관리</h3>
                    <div className="flex gap-1 mb-2">
                        <input className="form-input" style={{ maxWidth: '300px' }} value={newRole} onChange={e => setNewRole(e.target.value)}
                            placeholder="새 ROLE 이름" onKeyDown={e => e.key === 'Enter' && addRole()} />
                        <button className="btn btn-primary btn-sm" onClick={addRole}>➕ ROLE 추가</button>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                        {roleList.map(role => (
                            <div key={role} style={{
                                display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.75rem',
                                background: '#f3f4f6', border: '1px solid var(--border-color)', borderRadius: '0.5rem', fontSize: '0.85rem'
                            }}>
                                <span>{role}</span>
                                <button className="btn-icon" style={{ color: '#ef4444', fontSize: '0.7rem' }} onClick={() => deleteRole(role)}>✕</button>
                            </div>
                        ))}
                        {roleList.length === 0 && <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>'{selectedBU}' 하위에 ROLE이 없습니다.</span>}
                    </div>
                </div>
            )}

            {/* Full table */}
            <div className="card">
                <h3>📊 전체 BU/ROLE 데이터</h3>
                {allData.length > 0 ? (
                    <div className="table-wrapper">
                        <table className="data-table">
                            <thead>
                                <tr><th>BU</th><th>ROLE</th></tr>
                            </thead>
                            <tbody>
                                {allData.filter(d => d.ROLE && d.ROLE.trim()).map((d, i) => (
                                    <tr key={i}><td>{d.BU}</td><td>{d.ROLE}</td></tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>등록된 BU/ROLE이 없습니다.</p>
                )}
            </div>
        </div>
    )
}

export default DeptConfig

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import axios from 'axios'
import { exportToCSV, todayStr } from '../utils/exportUtils'
import { useToast } from '../components/Toast'

const Resign = () => {
    const queryClient = useQueryClient()
    const { addToast } = useToast()
    const [activeTab, setActiveTab] = useState('list')

    const { data: resigns, isLoading } = useQuery({
        queryKey: ['assets', 'Resign'],
        queryFn: async () => {
            const { data } = await axios.get('/api/assets/Resign')
            return data
        }
    })

    return (
        <div>
            <h1>👋 퇴사자 관리</h1>
            <div className="alert alert-info">
                이메일을 입력하면 <strong>보유 중인 모든 자산 정보가 자동으로 채워집니다.</strong><br />
                반납 처리를 하려면 해당 행을 선택하고 버튼을 클릭하세요.
            </div>

            <div className="tabs">
                <button className={`tab-btn ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>📋 리스트 & 반납 처리</button>
                <button className={`tab-btn ${activeTab === 'register' ? 'active' : ''}`} onClick={() => setActiveTab('register')}>➕ 퇴사 예정자 등록</button>
            </div>

            {activeTab === 'register' && <RegisterTab queryClient={queryClient} addToast={addToast} />}
            {activeTab === 'list' && <ListTab resigns={resigns} isLoading={isLoading} queryClient={queryClient} addToast={addToast} />}
        </div>
    )
}

const RegisterTab = ({ queryClient, addToast }) => {
    const [email, setEmail] = useState('')
    const [resignDate, setResignDate] = useState('')
    const [submitting, setSubmitting] = useState(false)
    const [previewInfo, setPreviewInfo] = useState('')

    const handleEmailBlur = async () => {
        if (!email.trim() || !email.includes('@')) return;
        try {
            const { data } = await axios.get(`/api/assets/user/lookup/${encodeURIComponent(email.trim())}`);
            const name = data.korean_name ? `${data.korean_name}(${data.NAME})` : data.NAME;
            if (name) {
                setPreviewInfo(`✅ ${name} 님의 정보를 확인했습니다.`);
            }
        } catch (e) {
            setPreviewInfo('⚠️ 등록되지 않은 이메일입니다. 입력하신 정보로 신규 생성됩니다.');
        }
    }

    const handleSubmit = async (e) => {
        e.preventDefault()
        if (!email.trim()) {
            addToast('이메일을 입력해주세요.', 'error')
            return
        }
        setSubmitting(true)
        try {
            await axios.post('/api/assets/resign/register', {
                email: email.trim(),
                resign_date: resignDate,
            })
            addToast(`✅ ${email} 등록 및 자산 정보 연동 완료!`, 'success')
            setEmail('')
            setResignDate('')
            setPreviewInfo('')
            queryClient.invalidateQueries(['assets', 'Resign'])
        } catch (err) {
            addToast('등록 실패: ' + (err.response?.data?.detail || err.message), 'error')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <div className="card">
            <h3>➕ 새 퇴사 예정자 등록</h3>
            <form onSubmit={handleSubmit}>
                <div className="form-row">
                    <div className="form-group">
                        <label className="form-label">퇴사 예정일</label>
                        <input className="form-input" type="date" value={resignDate} onChange={e => setResignDate(e.target.value)} />
                    </div>
                    <div className="form-group">
                        <label className="form-label">이메일 주소 *</label>
                        <input className="form-input" type="email" value={email} onChange={e => {setEmail(e.target.value); setPreviewInfo('');}} onBlur={handleEmailBlur} placeholder="user@stryker.com" required />
                        {previewInfo && <div style={{ fontSize: '0.85em', marginTop: '5px', color: previewInfo.startsWith('✅') ? '#059669' : '#d97706' }}>{previewInfo}</div>}
                    </div>
                </div>
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                    {submitting ? '처리 중...' : '🚀 등록 및 자산 자동 채우기'}
                </button>
            </form>
        </div>
    )
}

const ListTab = ({ resigns, isLoading, queryClient, addToast }) => {

    if (isLoading) return <div className="loading"><div className="spinner" /> 로딩중...</div>

    const columns = resigns?.length > 0 ? Object.keys(resigns[0]) : []
    const priorityCols = ['년', 'F', '월', '날짜', 'NAME', 'email', '설명', 'BU', '노트북', '아이패드', '모니터', '복합기', 'Teams', '추가사항']
    const orderedCols = priorityCols.filter(c => columns.includes(c))
    const otherCols = columns.filter(c => !priorityCols.includes(c) && c !== '_is_deleted')
    const displayCols = [...orderedCols, ...otherCols]

    const assetCols = ['노트북', '아이패드', '모니터', '복합기', 'Teams']
    const checkHasAssets = (row) => {
        return assetCols.some(col => row[col] && String(row[col]).trim() !== '' && String(row[col]).trim() !== '-' && String(row[col]).trim() !== 'null' && String(row[col]).trim() !== 'undefined')
    }

    // ── Single Row Actions ──
    const handleSingleReturn = async (row, assetName, assetType) => {
        if (!row?.email) return
        if (!window.confirm(`[${assetName}] 자산을 반납 처리 하시겠습니까?\n확인 시 해당 자산이 즉각 반납 상태로 전환됩니다.`)) return;

        try {
            const { data } = await axios.post('/api/assets/resign/return', {
                email: row.email,
                name: row.NAME,
                bu: row.BU,
                asset_type: assetType
            })
            if (data.success) {
                addToast(`${row.email}: ${data.message}`, 'success')
            } else {
                addToast(`${row.email}: ${data.message}`, 'info')
            }
            queryClient.invalidateQueries(['assets', 'Resign'])
        } catch (err) {
            addToast(`${row.email}: 반납 처리 실패`, 'error')
        }
    }

    const handleSingleDelete = async (row) => {
        if (!row?.email) return
        if (!confirm(`'${row.NAME || row.email}' 님의 퇴사를 확정하고 마스터 DB에서 영구 삭제하시겠습니까?`)) return
        
        try {
            const { data } = await axios.post('/api/assets/resign/delete-master', { email: row.email, name: row.NAME })
            if (data.success) {
                addToast(`✅ ${row.NAME || row.email} 퇴사 확정 및 마스터 삭제 완료`, 'success')
            } else {
                addToast(`❌ ${row.NAME || row.email}: ${data.message}`, 'error')
            }
        } catch (err) {
            addToast(`퇴사 확정 실패: ${row.email}`, 'error')
        }
        queryClient.invalidateQueries(['assets', 'Resign'])
        queryClient.invalidateQueries(['dashboardSummary'])
    }

    return (
        <div>
            <div className="flex items-center justify-between mb-2">
                <div className="flex gap-1" style={{ visibility: 'hidden' }}>
                    {/* Placeholder for removed bulk buttons to maintain layout spacing */}
                    <button className="btn btn-sm">placeholder</button> 
                </div>
                <div className="flex gap-1">
                    <button
                        className="btn btn-sm"
                        style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #86efac', fontWeight: '600' }}
                        onClick={() => exportToCSV(resigns || [], `퇴사자_${todayStr()}`)}
                        disabled={!resigns || resigns.length === 0}
                    >📥 엑셀 내보내기</button>
                    <button className="btn btn-sm" onClick={() => queryClient.invalidateQueries(['assets', 'Resign'])}>🔄 새로고침</button>
                </div>
            </div>

            <div className="card" style={{ padding: 0 }}>
                {resigns?.length > 0 ? (
                    <div className="table-wrapper" style={{ maxHeight: '60vh', overflow: 'auto' }}>
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th style={{ width: '80px', textAlign: 'center' }}>상태</th>
                                    <th style={{ width: '100px', textAlign: 'center' }}>액션</th>
                                    {displayCols.map(col => <th key={col}>{col}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {resigns.map((row, idx) => {
                                    const hasAssets = checkHasAssets(row)
                                    const isDeleted = row._is_deleted === true
                                    
                                    let statusColor = hasAssets ? '#c53030' : '#166534'
                                    let statusText = hasAssets ? '🔴 보유중' : '🟢 반납 완료'
                                    let bgColor = hasAssets ? '#fff5f5' : '#f0fdf4'

                                    if (isDeleted) {
                                        statusColor = '#6b7280'
                                        statusText = '✔️ 처리 완료'
                                        bgColor = '#f9fafb'
                                    }

                                    return (
                                        <tr key={idx} style={{ backgroundColor: bgColor }}>
                                            <td style={{ textAlign: 'center', fontWeight: 'bold', color: statusColor }}>
                                                {statusText}
                                            </td>
                                            <td style={{ textAlign: 'center' }}>
                                                {isDeleted ? (
                                                    <span style={{ fontSize: '0.85rem', color: '#9ca3af', fontWeight: 'bold' }}>완료됨</span>
                                                ) : hasAssets ? (
                                                    <span style={{ fontSize: '0.85rem', color: '#6b7280' }}>자산 클릭하여 반납</span>
                                                ) : (
                                                    <button className="btn btn-danger btn-sm" onClick={() => handleSingleDelete(row)} style={{ padding: '2px 8px', fontSize: '0.8rem' }}>
                                                        🏃‍♂️ 퇴사 확정
                                                    </button>
                                                )}
                                            </td>
                                            {displayCols.map(col => {
                                                const val = row[col] !== null && row[col] !== undefined ? String(row[col]) : '-'
                                                const isValValid = val.trim() !== '' && val.trim() !== '-' && val.trim() !== 'null' && val.trim() !== 'undefined'
                                                
                                                let renderContent = val
                                                
                                                if (!isDeleted && isValValid) {
                                                    if (col === '노트북') {
                                                        renderContent = <span className="text-blue-600 hover:underline cursor-pointer font-bold" onClick={() => handleSingleReturn(row, '노트북', 'Lease')}>{val}</span>
                                                    } else if (col === '아이패드') {
                                                        renderContent = <span className="text-blue-600 hover:underline cursor-pointer font-bold" onClick={() => handleSingleReturn(row, '아이패드', 'iPad')}>{val}</span>
                                                    } else if (col === 'Teams') {
                                                        renderContent = <span className="text-blue-600 hover:underline cursor-pointer font-bold" onClick={() => handleSingleReturn(row, 'Teams', 'Teams')}>{val}</span>
                                                    } else if (col === '모니터') {
                                                        renderContent = <span className="text-blue-600 hover:underline cursor-pointer font-bold" onClick={() => handleSingleReturn(row, '모니터', 'Monitor')}>{val}</span>
                                                    } else if (col === '복합기') {
                                                        renderContent = <span className="text-blue-600 hover:underline cursor-pointer font-bold" onClick={() => handleSingleReturn(row, '복합기', 'Printer')}>{val}</span>
                                                    }
                                                }

                                                return <td key={col}>{renderContent}</td>
                                            })}
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p style={{ textAlign: 'center', color: '#6b7280', padding: '2rem' }}>퇴사 예정자가 없습니다.</p>
                )}
            </div>
        </div>
    )
}

export default Resign

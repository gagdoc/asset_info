import { useState, useRef } from 'react'
import axios from 'axios'
import { useToast } from '../components/Toast'

const ExcelUpload = () => {
    const { addToast } = useToast()
    const [uploading, setUploading] = useState(false)
    const [dragOver, setDragOver] = useState(false)
    const fileInputRef = useRef(null)

    const handleUpload = async (file) => {
        if (!file) return
        if (!file.name.match(/\.(xlsx|xls)$/)) {
            addToast('Excel 파일(.xlsx, .xls)만 업로드 가능합니다.', 'error')
            return
        }

        setUploading(true)
        const formData = new FormData()
        formData.append('file', file)

        try {
            const { data } = await axios.post('/api/assets/upload', formData)
            addToast(`✅ ${data.message}`, 'success')
        } catch (err) {
            addToast(`❌ 업로드 실패: ${err.response?.data?.detail || err.message}`, 'error')
        } finally {
            setUploading(false)
        }
    }

    const handleDrop = (e) => {
        e.preventDefault()
        setDragOver(false)
        const file = e.dataTransfer.files[0]
        handleUpload(file)
    }

    return (
        <div>
            <h1>📤 엑셀 파일 업로드</h1>

            <div className="alert alert-info">
                💡 <strong>ASSET_INFO.xlsx</strong> 파일을 업로드하면 모든 자산 테이블이 초기화/갱신됩니다.
            </div>

            <div className="card">
                <h3>엑셀 파일 업로드 (DB 초기화/갱신)</h3>
                <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                    엑셀 파일 내의 시트명을 기준으로 각 테이블에 데이터가 매핑됩니다:<br />
                    <code>All_User</code>, <code>Lease_List</code>, <code>Ipad_List</code>, <code>TeamsNumber</code>,
                    <code>Printer</code>, <code>Monitor</code>, <code>퇴사자</code>, <code>신규입사자</code>
                </p>

                <div
                    className={`upload-area ${dragOver ? 'dragover' : ''}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                >
                    {uploading ? (
                        <div className="loading">
                            <div className="spinner" />
                            업로드 및 처리 중...
                        </div>
                    ) : (
                        <>
                            <p style={{ fontSize: '3rem', margin: '0 0 0.5rem' }}>📊</p>
                            <p style={{ fontWeight: 600, fontSize: '1rem' }}>ASSET_INFO.xlsx 파일을 여기에 드래그하세요</p>
                            <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>또는 클릭하여 파일 선택</p>
                        </>
                    )}
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls"
                        onChange={(e) => handleUpload(e.target.files[0])}
                    />
                </div>
            </div>

            <div className="card">
                <h3>시트 매핑 정보</h3>
                <div className="table-wrapper">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>DB 테이블</th>
                                <th>엑셀 시트명</th>
                                <th>설명</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ['All_User', 'All_User', '전체 사용자 마스터 데이터'],
                                ['Lease', 'Lease_List', 'PC/노트북 지급 현황'],
                                ['iPad', 'Ipad_List', '아이패드 지급 현황'],
                                ['Teams', 'TeamsNumber', 'Teams 전화번호'],
                                ['Printer', 'Printer', '프린터/복합기 정보'],
                                ['Monitor', 'Monitor', '모니터 지급 현황'],
                                ['Resign', '퇴사자', '퇴사자 목록'],
                                ['NewHire', '신규입사자', '신규 입사자 목록'],
                            ].map(([db, sheet, desc]) => (
                                <tr key={db}>
                                    <td><code>{db}</code></td>
                                    <td>{sheet}</td>
                                    <td>{desc}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}

export default ExcelUpload

/**
 * exportToCSV: 배열 데이터를 Excel/Google Sheets 호환 CSV로 내보냅니다.
 * - UTF-8 BOM 포함 → Excel에서 한글 깨짐 없음
 * - Google Sheets: 파일 > 가져오기 또는 드래그&드롭으로 바로 사용 가능
 *
 * @param {object[]} rows       내보낼 객체 배열
 * @param {string}   filename   저장 파일명 (.csv 자동 추가)
 */
export function exportToCSV(rows, filename) {
    if (!rows || rows.length === 0) {
        alert('내보낼 데이터가 없습니다.')
        return
    }

    const headers = Object.keys(rows[0])
    const csvLines = [
        headers.join(','),
        ...rows.map(row =>
            headers.map(h => {
                const val = String(row[h] ?? '').replace(/"/g, '""').replace(/[\r\n]+/g, ' ')
                return `"${val}"`
            }).join(',')
        )
    ]

    // UTF-8 BOM (0xEF,0xBB,0xBF) → Excel이 한글을 올바르게 인식
    const blob = new Blob(['\uFEFF' + csvLines.join('\r\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
}

/**
 * 오늘 날짜를 YYYYMMDD 형태로 반환 (파일명 suffix용)
 */
export function todayStr() {
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}${m}${day}`
}

/**
 * ExportButton: 재사용 가능한 내보내기 버튼 컴포넌트
 */
export function ExportButton({ onClick, label = '📥 엑셀 내보내기', disabled = false, style = {} }) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 14px',
                fontSize: '0.88em',
                fontWeight: '600',
                color: disabled ? '#94a3b8' : '#166534',
                backgroundColor: disabled ? '#f1f5f9' : '#f0fdf4',
                border: `1px solid ${disabled ? '#cbd5e1' : '#86efac'}`,
                borderRadius: '6px',
                cursor: disabled ? 'not-allowed' : 'pointer',
                whiteSpace: 'nowrap',
                transition: 'all 0.15s',
                ...style
            }}
            onMouseOver={e => { if (!disabled) e.currentTarget.style.backgroundColor = '#dcfce7' }}
            onMouseOut={e => { if (!disabled) e.currentTarget.style.backgroundColor = '#f0fdf4' }}
        >
            {label}
        </button>
    )
}

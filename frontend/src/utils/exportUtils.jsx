/**
 * exportUtils.jsx
 * ================
 * 모든 페이지 공통 Excel 내보내기 유틸리티.
 * POST /api/export/xlsx 를 호출해 대시보드와 동일한 스타일의 .xlsx 파일을 생성합니다.
 *
 * 사용법 (단일 시트):
 *   await exportToXLSX({
 *     filename: "소모품리스트_20240429",
 *     columns: [
 *       { key: "item_name",     label: "품목명" },
 *       { key: "current_stock", label: "현재재고" },
 *     ],
 *     rows: filteredItems,
 *   })
 *
 * 멀티 시트:
 *   await exportToXLSX({
 *     filename: "재고현황_20240429",
 *     sheets: [
 *       { title: "일반 소모품", columns: [...], rows: [...] },
 *       { title: "토너",        columns: [...], rows: [...] },
 *     ],
 *   })
 */

import axios from 'axios'

/**
 * exportToXLSX - 스타일드 xlsx 파일 다운로드 (서버 렌더링)
 *
 * @param {object}   options
 * @param {string}   options.filename  저장 파일명 (.xlsx 자동 추가)
 * @param {object[]} [options.columns] 단일 시트용 컬럼 정의 [{key, label}]
 * @param {object[]} [options.rows]    단일 시트용 데이터 행 배열
 * @param {object[]} [options.sheets]  멀티 시트용 [{title, columns, rows}]
 */
export async function exportToXLSX({ filename, columns, rows, sheets }) {
  // 단일 시트 형태를 sheets 배열로 정규화
  const sheetList = sheets || [{ title: filename, columns: columns || [], rows: rows || [] }]

  if (sheetList.every(s => !s.rows || s.rows.length === 0)) {
    alert('내보낼 데이터가 없습니다.')
    return
  }

  try {
    const response = await axios.post(
      '/api/export/xlsx',
      { filename, sheets: sheetList },
      { responseType: 'blob' },
    )
    const url  = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href  = url
    link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (err) {
    const msg = err?.response?.data?.detail || err.message || '알 수 없는 오류'
    alert(`엑셀 내보내기 실패: ${msg}`)
  }
}

/**
 * 오늘 날짜를 YYYYMMDD 형태로 반환 (파일명 suffix용)
 */
export function todayStr() {
  const d   = new Date()
  const y   = d.getFullYear()
  const m   = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/**
 * ExportButton - 재사용 가능한 내보내기 버튼 컴포넌트
 */
export function ExportButton({ onClick, label = '엑셀 내보내기', disabled = false, style = {} }) {
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
        ...style,
      }}
      onMouseOver={e => { if (!disabled) e.currentTarget.style.backgroundColor = '#dcfce7' }}
      onMouseOut={e => { if (!disabled) e.currentTarget.style.backgroundColor = disabled ? '#f1f5f9' : '#f0fdf4' }}
    >
      {label}
    </button>
  )
}

import { useState, useRef, useEffect, useCallback } from 'react'
import { FaUpload, FaCrop, FaUndo, FaSearchPlus, FaCheck, FaTrash, FaTimes, FaCamera } from 'react-icons/fa'

/**
 * ImageCropModal
 * 소모품 제품 이미지를 업로드하고, 크롭(자르기), 확대(Zoom), 회전(Rotate), 리사이즈 후 Base64로 내보내는 모달 컴포넌트
 */
export default function ImageCropModal({
  isOpen,
  onClose,
  itemName,
  initialImage,
  onSave,
  onDelete,
}) {
  const [imageSrc, setImageSrc] = useState(null)
  const [zoom, setZoom] = useState(1)
  const [rotation, setRotation] = useState(0) // 0, 90, 180, 270
  const [aspectRatio, setAspectRatio] = useState('1:1') // '1:1' | '4:3' | 'free'
  const [outputSize, setOutputSize] = useState(300) // 200, 300, 400
  const [previewSizeKb, setPreviewSizeKb] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)

  // 크롭 박스 상태 (0 ~ 1 정규화 좌표)
  const [cropBox, setCropBox] = useState({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  const [dragMode, setDragMode] = useState(null) // 'move' | 'nw' | 'ne' | 'sw' | 'se'
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, box: { x: 0, y: 0, w: 0, h: 0 } })

  const canvasRef = useRef(null)
  const previewCanvasRef = useRef(null)
  const fileInputRef = useRef(null)
  const imageObjRef = useRef(null)

  // 초기화
  useEffect(() => {
    if (isOpen) {
      if (initialImage) {
        setImageSrc(initialImage)
      } else {
        setImageSrc(null)
      }
      setZoom(1)
      setRotation(0)
      setAspectRatio('1:1')
      setCropBox({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
    }
  }, [isOpen, initialImage])

  // 파일 선택 처리
  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('이미지 파일(JPG, PNG, WebP 등)만 업로드할 수 있습니다.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setImageSrc(reader.result)
      setZoom(1)
      setRotation(0)
      setCropBox({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
    }
    reader.readAsDataURL(file)
  }

  // 드래그 앤 드롭
  const handleDrop = (e) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = () => {
        setImageSrc(reader.result)
        setZoom(1)
        setRotation(0)
        setCropBox({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
      }
      reader.readAsDataURL(file)
    }
  }

  // 이미지 로드 시 imageObj 설정
  useEffect(() => {
    if (!imageSrc) {
      imageObjRef.current = null
      return
    }
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      imageObjRef.current = img
      drawSourceCanvas()
    }
    img.src = imageSrc
  }, [imageSrc, rotation, zoom])

  // 1. 소스 캔버스 그리기 (회전 & 줌 반영)
  const drawSourceCanvas = useCallback(() => {
    const img = imageObjRef.current
    const canvas = canvasRef.current
    if (!img || !canvas) return

    const ctx = canvas.getContext('2d')
    const displayW = 380
    const displayH = 380

    canvas.width = displayW
    canvas.height = displayH

    ctx.clearRect(0, 0, displayW, displayH)
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, displayW, displayH)

    ctx.save()
    ctx.translate(displayW / 2, displayH / 2)
    ctx.rotate((rotation * Math.PI) / 180)
    ctx.scale(zoom, zoom)

    // 원본 비율에 맞게 맞춤
    const scale = Math.min((displayW * 0.9) / img.width, (displayH * 0.9) / img.height)
    const drawW = img.width * scale
    const drawH = img.height * scale

    ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH)
    ctx.restore()

    updatePreview()
  }, [rotation, zoom])

  // 2. 크롭 결과 미리보기 캔버스 그리기 & 용량 산출
  const updatePreview = useCallback(() => {
    const srcCanvas = canvasRef.current
    const prevCanvas = previewCanvasRef.current
    if (!srcCanvas || !prevCanvas) return

    const prevCtx = prevCanvas.getContext('2d')
    prevCanvas.width = outputSize
    prevCanvas.height = outputSize

    const sx = cropBox.x * srcCanvas.width
    const sy = cropBox.y * srcCanvas.height
    const sw = cropBox.w * srcCanvas.width
    const sh = cropBox.h * srcCanvas.height

    prevCtx.fillStyle = '#ffffff'
    prevCtx.fillRect(0, 0, outputSize, outputSize)

    // 배경 흰색 채우기 후 그리기
    prevCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outputSize, outputSize)

    // 용량 계산
    try {
      const dataUrl = prevCanvas.toDataURL('image/jpeg', 0.82)
      const sizeBytes = Math.round((dataUrl.length * 3) / 4)
      setPreviewSizeKb((sizeBytes / 1024).toFixed(1))
    } catch {
      setPreviewSizeKb(null)
    }
  }, [cropBox, outputSize])

  useEffect(() => {
    if (imageObjRef.current) {
      drawSourceCanvas()
    }
  }, [drawSourceCanvas, cropBox])

  // 비율 변경 시 크롭 박스 재조정
  const handleAspectChange = (ratio) => {
    setAspectRatio(ratio)
    if (ratio === '1:1') {
      const size = Math.min(cropBox.w, cropBox.h)
      setCropBox((prev) => ({ ...prev, w: size, h: size }))
    } else if (ratio === '4:3') {
      const newH = cropBox.w * (3 / 4)
      setCropBox((prev) => ({ ...prev, h: Math.min(newH, 1 - prev.y) }))
    }
  }

  // 마우스 이벤트로 크롭 박스 드래그 & 리사이즈
  const handleMouseDown = (e, mode) => {
    e.stopPropagation()
    setDragMode(mode)
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      box: { ...cropBox },
    }
  }

  const handleMouseMove = useCallback(
    (e) => {
      if (!dragMode) return
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const deltaX = (e.clientX - dragStartRef.current.mouseX) / rect.width
      const deltaY = (e.clientY - dragStartRef.current.mouseY) / rect.height
      const initBox = dragStartRef.current.box

      let newBox = { ...initBox }

      if (dragMode === 'move') {
        newBox.x = Math.max(0, Math.min(1 - initBox.w, initBox.x + deltaX))
        newBox.y = Math.max(0, Math.min(1 - initBox.h, initBox.y + deltaY))
      } else if (dragMode === 'se') {
        let newW = Math.max(0.15, Math.min(1 - initBox.x, initBox.w + deltaX))
        let newH = Math.max(0.15, Math.min(1 - initBox.y, initBox.h + deltaY))
        if (aspectRatio === '1:1') {
          const s = Math.min(newW, newH)
          newW = s
          newH = s
        }
        newBox.w = newW
        newBox.h = newH
      } else if (dragMode === 'nw') {
        let newX = Math.max(0, Math.min(initBox.x + initBox.w - 0.15, initBox.x + deltaX))
        let newY = Math.max(0, Math.min(initBox.y + initBox.h - 0.15, initBox.y + deltaY))
        newBox.w = initBox.w + (initBox.x - newX)
        newBox.h = initBox.h + (initBox.y - newY)
        newBox.x = newX
        newBox.y = newY
      }

      setCropBox(newBox)
    },
    [dragMode, aspectRatio]
  )

  const handleMouseUp = useCallback(() => {
    setDragMode(null)
  }, [])

  useEffect(() => {
    if (dragMode) {
      window.addEventListener('mousemove', handleMouseMove)
      window.addEventListener('mouseup', handleMouseUp)
      return () => {
        window.removeEventListener('mousemove', handleMouseMove)
        window.removeEventListener('mouseup', handleMouseUp)
      }
    }
  }, [dragMode, handleMouseMove, handleMouseUp])

  // 적용 & 저장
  const handleApply = async () => {
    const prevCanvas = previewCanvasRef.current
    if (!prevCanvas) return

    setIsProcessing(true)
    try {
      // JPEG 82% 품질로 경량 압축 (15~25KB 내외 최적화)
      const dataUrl = prevCanvas.toDataURL('image/jpeg', 0.82)
      await onSave(dataUrl)
      onClose()
    } catch (err) {
      alert('이미지 저장 중 오류가 발생했습니다: ' + err.message)
    } finally {
      setIsProcessing(false)
    }
  }

  // 삭제 처리
  const handleDelete = async () => {
    if (!window.confirm('등록된 제품 이미지를 삭제하시겠습니까?')) return
    setIsProcessing(true)
    try {
      await onDelete()
      onClose()
    } catch (err) {
      alert('이미지 삭제 중 오류가 발생했습니다: ' + err.message)
    } finally {
      setIsProcessing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 2500,
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '14px',
          width: '92%',
          maxWidth: '780px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1)',
          overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div
          style={{
            padding: '1.1rem 1.4rem',
            borderBottom: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: '1.15rem',
                color: '#1e293b',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <FaCamera style={{ color: '#4f46e5' }} /> 제품 이미지 등록 및 편집
            </h3>
            <p style={{ margin: '3px 0 0', fontSize: '0.85rem', color: '#64748b' }}>
              품목: <strong style={{ color: '#0f172a' }}>{itemName}</strong>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              fontSize: '1.2rem',
              padding: '4px',
            }}
          >
            <FaTimes />
          </button>
        </div>

        {/* 모달 바디 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '1.2rem' }}>
          {!imageSrc ? (
            /* 이미지 업로드 영역 */
            <div
              onDragOver={(e) => {
                e.preventDefault()
                setIsDragging(true)
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${isDragging ? '#4f46e5' : '#cbd5e1'}`,
                borderRadius: '12px',
                padding: '3rem 1.5rem',
                textAlign: 'center',
                backgroundColor: isDragging ? '#eef2ff' : '#f8fafc',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <FaUpload size={40} style={{ color: '#6366f1', marginBottom: '12px' }} />
              <h4 style={{ margin: '0 0 6px', color: '#1e293b' }}>
                클릭하거나 이미지를 이곳에 드래그하여 업로드하세요
              </h4>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#64748b' }}>
                JPG, PNG, WebP 이미지 지원 (권장: 제품 정면 사진)
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
            </div>
          ) : (
            /* 편집 영역 */
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: '1.2rem' }}>
              {/* 왼쪽: 크롭 캔버스 뷰 */}
              <div>
                <div
                  style={{
                    position: 'relative',
                    width: '380px',
                    height: '380px',
                    margin: '0 auto',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                    border: '1px solid #cbd5e1',
                    backgroundColor: '#0f172a',
                    userSelect: 'none',
                  }}
                >
                  <canvas ref={canvasRef} style={{ display: 'block', width: '100%', height: '100%' }} />

                  {/* 크롭 오버레이 (어두운 영역) */}
                  <div
                    style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      pointerEvents: 'none',
                      boxShadow: `0 0 0 9999px rgba(0, 0, 0, 0.55)`,
                      clipPath: `polygon(
                        0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
                        ${cropBox.x * 100}% ${cropBox.y * 100}%,
                        ${cropBox.x * 100}% ${(cropBox.y + cropBox.h) * 100}%,
                        ${(cropBox.x + cropBox.w) * 100}% ${(cropBox.y + cropBox.h) * 100}%,
                        ${(cropBox.x + cropBox.w) * 100}% ${cropBox.y * 100}%,
                        ${cropBox.x * 100}% ${cropBox.y * 100}%
                      )`,
                    }}
                  />

                  {/* 크롭 박스 (인터랙티브) */}
                  <div
                    onMouseDown={(e) => handleMouseDown(e, 'move')}
                    style={{
                      position: 'absolute',
                      left: `${cropBox.x * 100}%`,
                      top: `${cropBox.y * 100}%`,
                      width: `${cropBox.w * 100}%`,
                      height: `${cropBox.h * 100}%`,
                      border: '2px solid #ffffff',
                      boxShadow: '0 0 0 1px #4f46e5',
                      cursor: 'move',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* 3x3 격자선 안내 */}
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr 1fr',
                        gridTemplateRows: '1fr 1fr 1fr',
                        pointerEvents: 'none',
                      }}
                    >
                      <div style={{ borderRight: '1px dashed rgba(255,255,255,0.4)', borderBottom: '1px dashed rgba(255,255,255,0.4)' }} />
                      <div style={{ borderRight: '1px dashed rgba(255,255,255,0.4)', borderBottom: '1px dashed rgba(255,255,255,0.4)' }} />
                      <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.4)' }} />
                      <div style={{ borderRight: '1px dashed rgba(255,255,255,0.4)', borderBottom: '1px dashed rgba(255,255,255,0.4)' }} />
                      <div style={{ borderRight: '1px dashed rgba(255,255,255,0.4)', borderBottom: '1px dashed rgba(255,255,255,0.4)' }} />
                      <div style={{ borderBottom: '1px dashed rgba(255,255,255,0.4)' }} />
                      <div style={{ borderRight: '1px dashed rgba(255,255,255,0.4)' }} />
                      <div style={{ borderRight: '1px dashed rgba(255,255,255,0.4)' }} />
                      <div />
                    </div>

                    {/* 모서리 핸들 (우하단) */}
                    <div
                      onMouseDown={(e) => handleMouseDown(e, 'se')}
                      style={{
                        position: 'absolute',
                        right: '-6px',
                        bottom: '-6px',
                        width: '12px',
                        height: '12px',
                        backgroundColor: '#4f46e5',
                        border: '2px solid #ffffff',
                        borderRadius: '2px',
                        cursor: 'nwse-resize',
                      }}
                    />
                  </div>
                </div>

                {/* 하단 툴바: 줌 & 회전 */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '1.2rem',
                    marginTop: '0.8rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaSearchPlus style={{ color: '#64748b', fontSize: '0.85rem' }} />
                    <input
                      type="range"
                      min="1"
                      max="3"
                      step="0.05"
                      value={zoom}
                      onChange={(e) => setZoom(parseFloat(e.target.value))}
                      style={{ width: '120px' }}
                    />
                    <span style={{ fontSize: '0.78rem', color: '#64748b', minWidth: '32px' }}>
                      {Math.round(zoom * 100)}%
                    </span>
                  </div>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => setRotation((r) => (r + 90) % 360)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px',
                      padding: '4px 10px',
                      fontSize: '0.8rem',
                    }}
                  >
                    <FaUndo /> 90° 회전
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => fileInputRef.current?.click()}
                    style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                  >
                    다른 사진 선택
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                  />
                </div>
              </div>

              {/* 오른쪽: 미리보기 및 세부 옵션 */}
              <div
                style={{
                  background: '#f8fafc',
                  borderRadius: '10px',
                  padding: '1rem',
                  border: '1px solid #e2e8f0',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.8rem',
                }}
              >
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.82rem',
                      fontWeight: '700',
                      color: '#475569',
                      marginBottom: '6px',
                    }}
                  >
                    최종 썸네일 미리보기
                  </label>
                  <div
                    style={{
                      width: '120px',
                      height: '120px',
                      margin: '0 auto',
                      borderRadius: '8px',
                      border: '2px solid #cbd5e1',
                      overflow: 'hidden',
                      backgroundColor: '#ffffff',
                      display: 'flex',
                      justifyContent: 'center',
                      alignItems: 'center',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                    }}
                  >
                    <canvas
                      ref={previewCanvasRef}
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  </div>
                  {previewSizeKb && (
                    <div
                      style={{
                        textAlign: 'center',
                        fontSize: '0.75rem',
                        color: '#16a34a',
                        fontWeight: '600',
                        marginTop: '4px',
                      }}
                    >
                      {outputSize}x{outputSize} px (~{previewSizeKb} KB)
                    </div>
                  )}
                </div>

                {/* 크롭 비율 선택 */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#475569',
                      marginBottom: '4px',
                    }}
                  >
                    <FaCrop style={{ marginRight: '4px' }} /> 자르기 비율
                  </label>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => handleAspectChange('1:1')}
                      style={{
                        flex: 1,
                        padding: '4px',
                        fontSize: '0.75rem',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        background: aspectRatio === '1:1' ? '#4f46e5' : '#ffffff',
                        color: aspectRatio === '1:1' ? '#ffffff' : '#334155',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      1:1 정사각
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAspectChange('4:3')}
                      style={{
                        flex: 1,
                        padding: '4px',
                        fontSize: '0.75rem',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        background: aspectRatio === '4:3' ? '#4f46e5' : '#ffffff',
                        color: aspectRatio === '4:3' ? '#ffffff' : '#334155',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      4:3
                    </button>
                    <button
                      type="button"
                      onClick={() => handleAspectChange('free')}
                      style={{
                        flex: 1,
                        padding: '4px',
                        fontSize: '0.75rem',
                        borderRadius: '4px',
                        border: '1px solid #cbd5e1',
                        background: aspectRatio === 'free' ? '#4f46e5' : '#ffffff',
                        color: aspectRatio === 'free' ? '#ffffff' : '#334155',
                        fontWeight: '600',
                        cursor: 'pointer',
                      }}
                    >
                      자유
                    </button>
                  </div>
                </div>

                {/* 출력 해상도 선택 */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: '0.8rem',
                      fontWeight: '600',
                      color: '#475569',
                      marginBottom: '4px',
                    }}
                  >
                    출력 해상도
                  </label>
                  <select
                    value={outputSize}
                    onChange={(e) => setOutputSize(parseInt(e.target.value))}
                    style={{
                      width: '100%',
                      padding: '4px 6px',
                      borderRadius: '4px',
                      border: '1px solid #cbd5e1',
                      fontSize: '0.78rem',
                    }}
                  >
                    <option value={200}>200 x 200 (초경량 ~10KB)</option>
                    <option value={300}>300 x 300 (표준 권장 ~20KB)</option>
                    <option value={400}>400 x 400 (고선명 ~35KB)</option>
                  </select>
                </div>

                <div
                  style={{
                    fontSize: '0.74rem',
                    color: '#64748b',
                    background: '#e0e7ff',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    lineHeight: 1.35,
                  }}
                >
                  💡 크롭 박스를 드래그하여 제품 중심을 맞추고, 우측 하단 모서리를 당겨 크기를 조절하세요.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 모달 푸터 */}
        <div
          style={{
            padding: '0.9rem 1.4rem',
            borderTop: '1px solid #e2e8f0',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: '#f8fafc',
          }}
        >
          <div>
            {initialImage && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleDelete}
                disabled={isProcessing}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  fontSize: '0.82rem',
                  padding: '6px 12px',
                }}
              >
                <FaTrash /> 이미지 삭제
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isProcessing}
              style={{ fontSize: '0.85rem', padding: '6px 14px' }}
            >
              취소
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleApply}
              disabled={!imageSrc || isProcessing}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '0.85rem',
                padding: '6px 16px',
              }}
            >
              <FaCheck /> {isProcessing ? '저장 중...' : '크롭 적용 및 이미지 저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

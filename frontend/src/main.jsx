import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import axios from 'axios'
import './index.css'
import App from './App.jsx'

// Axios 글로벌 에러 인터셉터
axios.interceptors.response.use(
  response => response,
  error => {
    const status = error.response?.status
    const detail = error.response?.data?.detail || error.message || '서버 오류가 발생했습니다.'

    if (status === 401) {
      console.error('[Auth] 인증 오류:', detail)
    } else if (status === 403) {
      console.error('[Auth] 권한 없음:', detail)
    } else if (status >= 500) {
      console.error(`[Server] ${status} 오류:`, detail)
    } else if (!error.response) {
      console.error('[Network] 네트워크 오류 또는 서버 연결 불가')
    }

    // 에러 메시지를 통일된 형식으로 attach
    error.userMessage = detail
    return Promise.reject(error)
  }
)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 2,                    // 쿼리 실패 시 최대 2회 재시도
      retryDelay: attempt => Math.min(1000 * 2 ** attempt, 10000), // 지수 백오프
      staleTime: 60_000,           // 1분간 데이터 신선 유지
      refetchOnWindowFocus: false, // 탭 전환 시 자동 재조회 비활성화
    },
    mutations: {
      retry: 0, // 뮤테이션은 재시도 없음 (중복 방지)
    }
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)

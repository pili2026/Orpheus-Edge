/**
 * Axios Instance Configuration
 * 使用相對路徑，自動適應部署環境
 */
import axios, { AxiosError } from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse } from '@/types'

// 創建 axios 實例
const api: AxiosInstance = axios.create({
  baseURL: '/api', // ✅ 使用相對路徑，會自動使用當前網頁的 host
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 請求攔截器
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 可以在這裡添加 token 等認證信息
    // const token = localStorage.getItem('token')
    // if (token && config.headers) {
    //   config.headers.Authorization = `Bearer ${token}`
    // }
    return config
  },
  (error: AxiosError) => {
    console.error('Request error:', error)
    return Promise.reject(error)
  },
)

// 響應攔截器
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error: AxiosError<ApiResponse>) => {
    // 統一錯誤處理
    if (error.response) {
      // 伺服器返回錯誤狀態碼
      const { status, data } = error.response
      switch (status) {
        case 400:
          console.error('Bad Request:', data?.message || '請求參數錯誤')
          break
        case 401:
          console.error('Unauthorized:', '未授權，請登入')
          // 可以跳轉到登入頁
          break
        case 403:
          console.error('Forbidden:', '沒有權限訪問')
          break
        case 404:
          console.error('Not Found:', data?.message || '資源不存在')
          break
        case 500:
          console.error('Internal Server Error:', '伺服器錯誤')
          break
        default:
          console.error('API Error:', data?.message || '未知錯誤')
      }
    } else if (error.request) {
      // 請求已發送但沒有收到響應
      console.error('Network Error:', '網路連接失敗，請檢查網路設定')
    } else {
      // 其他錯誤
      console.error('Error:', error.message)
    }

    return Promise.reject(error)
  },
)

export default api

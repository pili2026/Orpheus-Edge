/**
 * Axios Instance Configuration
 * Uses relative paths to automatically adapt to the deployment environment
 */
import axios, { AxiosError } from 'axios'
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios'
import type { ApiResponse } from '@/types'

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: '/api', // Use relative path; automatically resolves to current page host
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // You can add authentication info such as tokens here
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

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response
  },
  (error: AxiosError<ApiResponse>) => {
    // Unified error handling
    if (error.response) {
      // Server returned an error status code
      const { status, data } = error.response
      switch (status) {
        case 400:
          console.error('Bad Request:', data?.message || 'Invalid request parameters')
          break
        case 401:
          console.error('Unauthorized:', 'Unauthorized, please log in')
          // You may redirect to the login page here
          break
        case 403:
          console.error('Forbidden:', 'Access denied')
          break
        case 404:
          console.error('Not Found:', data?.message || 'Resource not found')
          break
        case 500:
          console.error('Internal Server Error:', 'Server error')
          break
        default:
          console.error('API Error:', data?.message || 'Unknown error')
      }
    } else if (error.request) {
      // Request was sent but no response was received
      console.error(
        'Network Error:',
        'Network connection failed, please check your network settings',
      )
    } else {
      // Other errors
      console.error('Error:', error.message)
    }

    return Promise.reject(error)
  },
)

export default api

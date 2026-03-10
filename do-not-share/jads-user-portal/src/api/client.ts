import axios from 'axios'
import { Capacitor } from '@capacitor/core'

// On native mobile (Capacitor), Vite proxy isn't available — use full backend URL.
// Set VITE_API_BASE_URL in .env for production, or fall back to localhost for dev.
const API = Capacitor.isNativePlatform()
  ? (import.meta.env.VITE_API_BASE_URL || 'http://10.0.2.2:8080') + '/api'
  : '/api'

const TOKEN_KEY = 'jads_user_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

// Pre-configured axios for user API calls
export function userApi() {
  return axios.create({
    baseURL: API,
    headers: {
      Authorization:    `Bearer ${getToken()}`,
      'X-JADS-Version': '4.0',
    }
  })
}

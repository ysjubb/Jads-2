import axios from 'axios'

const API = '/api'
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

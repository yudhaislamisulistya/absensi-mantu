const API_URL = '/api'
const SESSION_KEY = 'absensi-mantu-session'

export const session = {
  get() {
    try {
      return JSON.parse(localStorage.getItem(SESSION_KEY))
    } catch {
      return null
    }
  },
  set(value) {
    localStorage.setItem(SESSION_KEY, JSON.stringify(value))
  },
  clear() {
    localStorage.removeItem(SESSION_KEY)
  },
}

async function request(path, options = {}) {
  const auth = session.get()
  const headers = {
    Accept: 'application/json',
    ...options.headers,
  }
  if (options.body) headers['Content-Type'] = 'application/json'
  if (auth?.token) headers.Authorization = `Bearer ${auth.token}`

  const response = await fetch(`${API_URL}${path}`, { ...options, headers })
  if (!response.ok) {
    let payload = {}
    try {
      payload = await response.json()
    } catch {
      payload.message = `Permintaan gagal (${response.status})`
    }
    if (response.status === 401 && auth?.token) {
      session.clear()
      window.dispatchEvent(new Event('auth-expired'))
    }
    throw new Error(payload.message || payload.details || 'Terjadi kesalahan pada server')
  }
  if (response.status === 204) return null
  return response.json()
}

export const api = {
  get(path) {
    return request(`/${path}`)
  },
  create(table, data) {
    return request(`/${table}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(data),
    }).then((rows) => rows?.[0])
  },
  update(table, id, data) {
    return request(`/${table}?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(data),
    }).then((rows) => rows?.[0])
  },
  remove(table, id, key = 'id') {
    return request(`/${table}?${key}=eq.${encodeURIComponent(id)}`, { method: 'DELETE' })
  },
  upsert(table, data, conflict) {
    return request(`/${table}?on_conflict=${conflict}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(data),
    }).then((rows) => rows?.[0])
  },
  bulkUpsert(table, rows, conflict) {
    return request(`/${table}?on_conflict=${encodeURIComponent(conflict)}`, {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify(rows),
    })
  },
  rpc(name, data = {}) {
    return request(`/rpc/${name}`, { method: 'POST', body: JSON.stringify(data) })
  },
}

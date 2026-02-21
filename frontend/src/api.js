const API_BASE = 'http://localhost:8000'

export async function getChain() {
  const res = await fetch(`${API_BASE}/chain`)
  if (!res.ok) throw new Error('Failed to fetch chain')
  return res.json()
}

export async function addPrice(payload) {
  const res = await fetch(`${API_BASE}/prices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Failed to add price')
  }
  return res.json()
}

export async function updatePrice(blockIndex, payload) {
  const res = await fetch(`${API_BASE}/prices/${blockIndex}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Failed to update price')
  }
  return res.json()
}

export async function deletePrice(blockIndex) {
  const res = await fetch(`${API_BASE}/prices/${blockIndex}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Failed to delete price')
  }
  return res.json()
}

export async function predict({ daysAhead = 1, metal = 'silver', purity = null } = {}) {
  const params = new URLSearchParams({
    days_ahead: String(daysAhead),
    metal,
  })
  if (purity) params.set('purity', purity)

  const res = await fetch(`${API_BASE}/predict?${params.toString()}`)
  if (!res.ok) {
    const error = await res.json()
    throw new Error(error.detail || 'Failed to predict')
  }
  return res.json()
}

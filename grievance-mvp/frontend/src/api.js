import axios from 'axios'

const BASE_URL = 'http://localhost:8000'

export async function submit(data) {
  const formData = new FormData()
  formData.append('text', data.text)
  formData.append('complainant_name', data.complainantName)

  if (data.lat != null) formData.append('lat', data.lat)
  if (data.lng != null) formData.append('lng', data.lng)
  if (data.address) formData.append('address', data.address)
  if (data.photo) formData.append('photo', data.photo)

  const res = await axios.post(`${BASE_URL}/submit`, formData)
  return res.data
}

export async function getComplaints() {
  const res = await axios.get(`${BASE_URL}/complaints`)
  return res.data
}

export async function getStatus(id) {
  const res = await axios.get(`${BASE_URL}/status/${id}`)
  return res.data
}

export async function setStatus(id, status) {
  const res = await axios.patch(`${BASE_URL}/status/${id}`, { status })
  return res.data
}

export async function getAnalytics() {
  const res = await axios.get(`${BASE_URL}/analytics`)
  return res.data
}

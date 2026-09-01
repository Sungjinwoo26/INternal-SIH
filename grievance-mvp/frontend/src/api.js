import axios from 'axios'

const BASE_URL = 'http://localhost:8000'

export async function submit(data) {
  const res = await axios.post(`${BASE_URL}/submit`, data)
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

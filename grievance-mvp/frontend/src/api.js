import axios from 'axios'

const BASE_URL = 'http://localhost:8000'

export function getComplaintPhotoUrl(id) {
  return `${BASE_URL}/complaints/${id}/photo`
}

export function getResolutionPhotoUrl(id) {
  return `${BASE_URL}/complaints/${id}/resolution-photo`
}

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

export async function setStatus(id, status, estimatedDays, estimatedHours) {
  const res = await axios.patch(`${BASE_URL}/status/${id}`, {
    status,
    estimated_days: estimatedDays,
    estimated_hours: estimatedHours,
  })
  return res.data
}

export async function resolveComplaint(id, resolutionPhoto) {
  const formData = new FormData()
  if (resolutionPhoto) {
    formData.append('resolution_photo', resolutionPhoto)
  }

  const res = await axios.patch(`${BASE_URL}/status/${id}/resolve`, formData)
  return res.data
}

export async function getAnalytics() {
  const res = await axios.get(`${BASE_URL}/analytics`)
  return res.data
}

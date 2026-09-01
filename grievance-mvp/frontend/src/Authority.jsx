import { useEffect, useState, useRef } from 'react'
import { getComplaints, setStatus, getAnalytics } from './api'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import L from 'leaflet'
import 'leaflet.heat'

function Authority({ t }) {
  const [rows, setRows] = useState([])
  const [stats, setStats] = useState({})
  const [statusDrafts, setStatusDrafts] = useState({})
  const [estimateDrafts, setEstimateDrafts] = useState({})
  const mapRef = useRef(null)
  const mapObj = useRef(null)

  async function load() {
    const complaints = await getComplaints()
    setRows(complaints)

    const analytics = await getAnalytics()
    setStats(analytics)
  }

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- Load API data once on mount.
    load()
  }, [])

  useEffect(() => {
    // Wait for complaint data, and create the Leaflet map only once.
    if (rows.length === 0 || mapObj.current) {
      return
    }

    const map = L.map(mapRef.current).setView([19.076, 72.877], 13)
    mapObj.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    // Each heat point is [latitude, longitude, intensity from 0 to 1].
    const mappedRows = rows.filter(
      (row) => row.lat !== null && row.lng !== null,
    )
    const points = mappedRows.map((row) => [
      row.lat,
      row.lng,
      (row.score || 0) / 100,
    ])
    L.heatLayer(points, { radius: 25 }).addTo(map)

    mappedRows.forEach((row) => {
      L.marker([row.lat, row.lng])
        .addTo(map)
        .bindPopup(`#${row.id} ${row.department} - ${row.priority}`)
    })
  }, [rows])

  async function handleStatusChange(id, status) {
    setStatusDrafts((current) => ({ ...current, [id]: status }))

    if (status === 'In Progress') {
      return
    }

    // Open and Resolved save immediately and clear any previous estimate.
    await setStatus(id, status, null, null)
    setStatusDrafts((current) => ({ ...current, [id]: undefined }))
    setEstimateDrafts((current) => ({ ...current, [id]: undefined }))
    await load()
  }

  function updateEstimate(id, field, value) {
    setEstimateDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [field]: value },
    }))
  }

  async function saveInProgress(row) {
    const draft = estimateDrafts[row.id] || {}
    const days = Number(draft.days ?? row.estimated_resolution_days ?? 0)
    const hours = Number(draft.hours ?? row.estimated_resolution_hours ?? 0)

    // Save the status and its estimated resolution time together, then reload.
    await setStatus(row.id, 'In Progress', days, hours)
    setStatusDrafts((current) => ({ ...current, [row.id]: undefined }))
    setEstimateDrafts((current) => ({ ...current, [row.id]: undefined }))
    await load()
  }

  const chartData = Object.entries(stats).map(([department, count]) => ({
    department,
    count,
  }))

  return (
    <div className="space-y-6">
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          {t.complaintHotspots}
        </h2>
        <div ref={mapRef} style={{ height: '350px' }} />
      </section>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          {t.complaintsPerDepartment}
        </h2>
        <div className="h-52 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <XAxis dataKey="department" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          {t.allComplaints}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="border-b bg-gray-50 text-gray-900">
              <tr>
                <th className="px-3 py-3">{t.id}</th>
                <th className="px-3 py-3">{t.complaint}</th>
                <th className="px-3 py-3">{t.dept}</th>
                <th className="px-3 py-3">{t.priority}</th>
                <th className="px-3 py-3">{t.score}</th>
                <th className="px-3 py-3">{t.duplicate}</th>
                <th className="px-3 py-3">{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const selectedStatus = statusDrafts[row.id] ?? row.status
                const days =
                  estimateDrafts[row.id]?.days ??
                  row.estimated_resolution_days ??
                  0
                const hours =
                  estimateDrafts[row.id]?.hours ??
                  row.estimated_resolution_hours ??
                  0

                return (
                  <tr key={row.id} className="border-b align-top">
                  <td className="px-3 py-3">{row.id}</td>
                  <td className="max-w-xs truncate px-3 py-3">{row.text}</td>
                  <td className="px-3 py-3">{row.department}</td>
                  <td className="px-3 py-3">{row.priority}</td>
                  <td className="px-3 py-3">{row.score}</td>
                  <td className="px-3 py-3">
                    {row.duplicate_of ? `#${row.duplicate_of}` : '-'}
                  </td>
                  <td className="px-3 py-3">
                    <select
                      className="rounded border border-gray-300 bg-white px-2 py-1"
                      value={selectedStatus}
                      onChange={(event) =>
                        handleStatusChange(row.id, event.target.value)
                      }
                    >
                      <option value="Open">{t.open}</option>
                      <option value="In Progress">{t.inProgress}</option>
                      <option value="Resolved">{t.resolved}</option>
                    </select>

                    {selectedStatus === 'In Progress' && (
                      <div className="mt-2 flex min-w-56 items-end gap-2">
                        <label className="text-xs">
                          {t.days}
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-16 rounded border border-gray-300 px-2 py-1"
                            value={days}
                            onChange={(event) =>
                              updateEstimate(row.id, 'days', event.target.value)
                            }
                          />
                        </label>
                        <label className="text-xs">
                          {t.hours}
                          <input
                            type="number"
                            min="0"
                            max="23"
                            className="mt-1 block w-16 rounded border border-gray-300 px-2 py-1"
                            value={hours}
                            onChange={(event) =>
                              updateEstimate(row.id, 'hours', event.target.value)
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="rounded bg-blue-600 px-3 py-1 font-medium text-white disabled:opacity-50"
                          disabled={Number(days) + Number(hours) === 0}
                          onClick={() => saveInProgress(row)}
                        >
                          {t.save}
                        </button>
                      </div>
                    )}
                  </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// If the map appears blank, confirm the Leaflet CSS link is present in index.html.
export default Authority

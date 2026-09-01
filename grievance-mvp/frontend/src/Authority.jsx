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
    // Save the new status, then reload both dashboard datasets from the backend.
    await setStatus(id, status)
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
              {rows.map((row) => (
                <tr key={row.id} className="border-b">
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
                      value={row.status}
                      onChange={(event) =>
                        handleStatusChange(row.id, event.target.value)
                      }
                    >
                      <option value="Open">{t.open}</option>
                      <option value="In Progress">{t.inProgress}</option>
                      <option value="Resolved">{t.resolved}</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

// If the map appears blank, confirm the Leaflet CSS link is present in index.html.
export default Authority

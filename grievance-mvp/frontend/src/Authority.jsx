import { useEffect, useState, useRef } from 'react'
import {
  getComplaintPhotoUrl,
  getComplaints,
  getAnalytics,
  resolveComplaint,
  setStatus,
} from './api'
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

const PRIORITY_RANK = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }
const CLUSTER_RADIUS_METRES = 500

function distanceMetres(lat1, lng1, lat2, lng2) {
  const earthRadius = 6371000
  const lat1Radians = (lat1 * Math.PI) / 180
  const lat2Radians = (lat2 * Math.PI) / 180
  const latDelta = ((lat2 - lat1) * Math.PI) / 180
  const lngDelta = ((lng2 - lng1) * Math.PI) / 180
  const value =
    Math.sin(latDelta / 2) ** 2 +
    Math.cos(lat1Radians) *
      Math.cos(lat2Radians) *
      Math.sin(lngDelta / 2) ** 2

  return (
    earthRadius *
    2 *
    Math.atan2(Math.sqrt(value), Math.sqrt(1 - value))
  )
}

function filterComplaintRows(rows, department, priority, timeRange) {
  const hoursByRange = { today: 24, week: 168, month: 720 }
  const cutoffHours = hoursByRange[timeRange]

  return rows.filter((row) => {
    if (row.lat === null || row.lng === null) return false
    if (department !== 'all' && row.department !== department) return false
    if (priority !== 'all' && row.priority !== priority) return false
    if (!cutoffHours) return true

    const timestamp = Date.parse(`${row.created_at?.replace(' ', 'T')}Z`)
    return Number.isFinite(timestamp) && Date.now() - timestamp <= cutoffHours * 3600000
  })
}

function clusterComplaintRows(rows) {
  const clusters = []

  rows.forEach((row) => {
    const nearby = clusters.find(
      (cluster) =>
        distanceMetres(row.lat, row.lng, cluster.lat, cluster.lng) <=
        CLUSTER_RADIUS_METRES,
    )

    if (!nearby) {
      clusters.push({ lat: row.lat, lng: row.lng, rows: [row] })
      return
    }

    nearby.rows.push(row)
    nearby.lat =
      nearby.rows.reduce((sum, item) => sum + item.lat, 0) /
      nearby.rows.length
    nearby.lng =
      nearby.rows.reduce((sum, item) => sum + item.lng, 0) /
      nearby.rows.length
  })

  return clusters.map((cluster) => {
    const activeRows = cluster.rows.filter(
      (row) => row.status !== 'Resolved' && row.status !== 'Invalid',
    )
    const rankedRows = [...(activeRows.length ? activeRows : cluster.rows)].sort(
      (a, b) =>
        (PRIORITY_RANK[b.priority] || 0) - (PRIORITY_RANK[a.priority] || 0) ||
        (b.score || 0) - (a.score || 0),
    )
    const departmentCounts = cluster.rows.reduce((counts, row) => {
      const key = row.department || 'Pending'
      counts[key] = (counts[key] || 0) + 1
      return counts
    }, {})
    const department = Object.entries(departmentCounts).sort(
      (a, b) => b[1] - a[1],
    )[0]?.[0]

    return {
      id: cluster.rows
        .map((row) => row.id)
        .sort((a, b) => a - b)
        .join('-'),
      lat: cluster.lat,
      lng: cluster.lng,
      rows: cluster.rows,
      count: cluster.rows.length,
      activeCount: activeRows.length,
      department,
      priority: activeRows.length ? rankedRows[0]?.priority : 'RESOLVED',
      score: Math.max(...cluster.rows.map((row) => row.score || 0)),
      proofCount: cluster.rows.filter((row) => row.has_resolution_photo).length,
      oldestTimestamp: Math.min(
        ...cluster.rows
          .map((row) => Date.parse(`${row.created_at?.replace(' ', 'T')}Z`))
          .filter(Number.isFinite),
      ),
    }
  })
}

function formatAge(timestamp, t) {
  if (!Number.isFinite(timestamp)) return t.notAvailable
  const hours = Math.max(0, (Date.now() - timestamp) / 3600000)
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} ${t.minutes}`
  if (hours < 24) return `${Math.round(hours * 10) / 10} ${t.hours}`
  return `${Math.round(hours / 24)} ${t.days}`
}

function clusterColor(priority) {
  if (priority === 'CRITICAL') return '#dc2626'
  if (priority === 'HIGH') return '#ea580c'
  if (priority === 'MEDIUM') return '#ca8a04'
  if (priority === 'RESOLVED') return '#15803d'
  return '#2563eb'
}

function Authority({ t }) {
  const [rows, setRows] = useState([])
  const [stats, setStats] = useState({})
  const [statusDrafts, setStatusDrafts] = useState({})
  const [estimateDrafts, setEstimateDrafts] = useState({})
  const [resolutionPhotoDrafts, setResolutionPhotoDrafts] = useState({})
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [timeFilter, setTimeFilter] = useState('all')
  const [showHeat, setShowHeat] = useState(true)
  const [selectedClusterId, setSelectedClusterId] = useState(null)
  const mapRef = useRef(null)
  const mapObj = useRef(null)
  const markerLayerRef = useRef(null)
  const heatLayerRef = useRef(null)

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
    if (!mapRef.current || mapObj.current) return
    const map = L.map(mapRef.current).setView([19.076, 72.877], 13)
    mapObj.current = map

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
    }).addTo(map)

    return () => {
      map.remove()
      mapObj.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapObj.current
    if (!map) return

    if (markerLayerRef.current) {
      markerLayerRef.current.removeFrom(map)
    }
    if (heatLayerRef.current) {
      heatLayerRef.current.removeFrom(map)
      heatLayerRef.current = null
    }

    const mappedRows = filterComplaintRows(
      rows,
      departmentFilter,
      priorityFilter,
      timeFilter,
    )
    const mapClusters = clusterComplaintRows(mappedRows)
    const markerLayer = L.layerGroup().addTo(map)
    markerLayerRef.current = markerLayer
    map.invalidateSize()

    if (showHeat) {
      const heatPoints = mappedRows
        .filter((row) => row.status !== 'Resolved' && row.status !== 'Invalid')
        .map((row) => [row.lat, row.lng, (row.score || 0) / 100])
      if (heatPoints.length) {
        heatLayerRef.current = L.heatLayer(heatPoints, {
          radius: 32,
          blur: 24,
          maxZoom: 17,
        }).addTo(map)
      }
    }

    mapClusters.forEach((cluster) => {
      const size = Math.min(48, 30 + cluster.count * 3)
      const color = clusterColor(cluster.priority)
      const icon = L.divIcon({
        className: '',
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        html: `<span style="display:flex;width:${size}px;height:${size}px;align-items:center;justify-content:center;border:3px solid white;border-radius:999px;background:${color};color:white;font-size:13px;font-weight:800;box-shadow:0 4px 12px rgba(15,23,42,.3)">${cluster.count}</span>`,
      })
      L.marker([cluster.lat, cluster.lng], {
        icon,
        title: `${cluster.department} - ${cluster.count} ${t.reports}`,
      })
        .addTo(markerLayer)
        .on('click', () => setSelectedClusterId(cluster.id))
    })

  }, [departmentFilter, priorityFilter, rows, showHeat, t.reports, timeFilter])

  async function handleStatusChange(id, status) {
    setStatusDrafts((current) => ({ ...current, [id]: status }))

    if (status === 'In Progress' || status === 'Resolved') {
      return
    }

    // Open saves immediately and clears any previous estimate.
    await setStatus(id, status, null, null)
    setStatusDrafts((current) => ({ ...current, [id]: undefined }))
    setEstimateDrafts((current) => ({ ...current, [id]: undefined }))
    await load()
  }

  async function saveResolved(row) {
    await resolveComplaint(row.id, resolutionPhotoDrafts[row.id] || null)
    setStatusDrafts((current) => ({ ...current, [row.id]: undefined }))
    setEstimateDrafts((current) => ({ ...current, [row.id]: undefined }))
    setResolutionPhotoDrafts((current) => ({
      ...current,
      [row.id]: undefined,
    }))
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
  const departments = [
    ...new Set(rows.map((row) => row.department).filter(Boolean)),
  ].sort()
  const mappedRows = filterComplaintRows(
    rows,
    departmentFilter,
    priorityFilter,
    timeFilter,
  )
  const clusters = clusterComplaintRows(mappedRows)
  const selectedCluster =
    clusters.find((cluster) => cluster.id === selectedClusterId) || clusters[0]
  const topHotspots = [...clusters]
    .sort((a, b) => b.count - a.count || b.score - a.score)
    .slice(0, 4)
  const activeComplaintCount = mappedRows.filter(
    (row) => row.status !== 'Resolved' && row.status !== 'Invalid',
  ).length
  const criticalHotspotCount = clusters.filter(
    (cluster) => cluster.priority === 'CRITICAL',
  ).length
  const proofCount = mappedRows.filter(
    (row) => row.has_resolution_photo,
  ).length

  function selectCluster(cluster) {
    setSelectedClusterId(cluster.id)
    mapObj.current?.setView([cluster.lat, cluster.lng], 16)
  }

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-blue-800 px-5 py-4 text-white md:px-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-blue-200">
              {t.complaintHotspots}
            </p>
            <h2 className="mt-1 text-2xl font-black">
              {t.complaintIntelligenceMap}
            </h2>
          </div>
          <span className="flex items-center gap-2 text-sm font-bold">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
            {t.liveData}
          </span>
        </div>

        <div className="grid gap-3 bg-blue-50 p-4 sm:grid-cols-2 lg:grid-cols-4 lg:p-5">
          <label className="text-xs font-bold uppercase tracking-wide text-blue-900">
            {t.department}
            <select
              className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900"
              value={departmentFilter}
              onChange={(event) => setDepartmentFilter(event.target.value)}
            >
              <option value="all">{t.allDepartments}</option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-blue-900">
            {t.priority}
            <select
              className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900"
              value={priorityFilter}
              onChange={(event) => setPriorityFilter(event.target.value)}
            >
              <option value="all">{t.allPriorities}</option>
              <option value="CRITICAL">{t.critical}</option>
              <option value="HIGH">{t.high}</option>
              <option value="MEDIUM">{t.medium}</option>
              <option value="LOW">{t.low}</option>
            </select>
          </label>

          <label className="text-xs font-bold uppercase tracking-wide text-blue-900">
            {t.timeRange}
            <select
              className="mt-2 w-full rounded-lg border border-blue-200 bg-white px-3 py-2.5 text-sm font-semibold text-gray-900"
              value={timeFilter}
              onChange={(event) => setTimeFilter(event.target.value)}
            >
              <option value="all">{t.allTime}</option>
              <option value="today">{t.today}</option>
              <option value="week">{t.lastSevenDays}</option>
              <option value="month">{t.lastThirtyDays}</option>
            </select>
          </label>

          <div className="flex items-end">
            <button
              type="button"
              className={`w-full rounded-lg border px-4 py-2.5 text-sm font-black transition ${
                showHeat
                  ? 'border-blue-700 bg-blue-700 text-white'
                  : 'border-blue-200 bg-white text-blue-900'
              }`}
              aria-pressed={showHeat}
              onClick={() => setShowHeat((current) => !current)}
            >
              {t.heatLayer}: {showHeat ? t.on : t.off}
            </button>
          </div>
        </div>

        <div className="grid gap-3 px-4 pb-4 sm:grid-cols-3 lg:px-5">
          <div className="rounded-xl border border-gray-200 bg-white p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">
              {t.activeComplaints}
            </p>
            <p className="mt-1 text-3xl font-black text-gray-950">
              {activeComplaintCount}
            </p>
          </div>
          <div className="rounded-xl border border-red-200 bg-red-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-red-700">
              {t.criticalHotspots}
            </p>
            <p className="mt-1 text-3xl font-black text-red-950">
              {criticalHotspotCount}
            </p>
          </div>
          <div className="rounded-xl border border-green-200 bg-green-50 p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-green-700">
              {t.resolutionProofs}
            </p>
            <p className="mt-1 text-3xl font-black text-green-950">
              {proofCount}
            </p>
          </div>
        </div>

        <div className="grid gap-4 px-4 pb-4 lg:grid-cols-[minmax(0,1fr)_17rem] lg:px-5">
          <div className="relative overflow-hidden rounded-xl border border-gray-200 bg-gray-100">
            <div
              ref={mapRef}
              className="h-[430px] w-full"
              style={{ height: '430px' }}
            />
            <div className="pointer-events-none absolute bottom-3 left-3 z-[500] flex max-w-[calc(100%-1.5rem)] flex-wrap gap-3 rounded-lg border border-gray-200 bg-white/95 px-3 py-2 text-xs font-bold text-gray-700 shadow-sm">
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-red-600" />
                {t.critical}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-orange-600" />
                {t.high}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-yellow-600" />
                {t.medium}
              </span>
              <span className="flex items-center gap-1.5">
                <i className="h-2.5 w-2.5 rounded-full bg-green-700" />
                {t.resolved}
              </span>
              <span>{t.markerSizeMeaning}</span>
            </div>
          </div>

          <aside className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-700">
              {t.selectedHotspot}
            </p>
            {selectedCluster ? (
              <>
                <h3 className="mt-2 text-xl font-black text-gray-950">
                  {selectedCluster.department}
                </h3>
                <p className="mt-1 text-sm text-gray-600">
                  {selectedCluster.count}{' '}
                  {selectedCluster.count === 1
                    ? t.complaintInCluster
                    : t.complaintsInCluster}
                </p>
                <dl className="mt-4 divide-y divide-gray-200 text-sm">
                  <div className="flex justify-between gap-3 py-2">
                    <dt className="text-gray-500">{t.priority}</dt>
                    <dd className="font-black text-gray-900">
                      {selectedCluster.priority}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 py-2">
                    <dt className="text-gray-500">{t.highestScore}</dt>
                    <dd className="font-black text-gray-900">
                      {selectedCluster.score}/100
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 py-2">
                    <dt className="text-gray-500">{t.unresolved}</dt>
                    <dd className="font-black text-gray-900">
                      {selectedCluster.activeCount}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 py-2">
                    <dt className="text-gray-500">{t.oldestReport}</dt>
                    <dd className="font-black text-gray-900">
                      {formatAge(selectedCluster.oldestTimestamp, t)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-3 py-2">
                    <dt className="text-gray-500">{t.resolutionProofs}</dt>
                    <dd className="font-black text-gray-900">
                      {selectedCluster.proofCount}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="mt-3 text-sm text-gray-500">{t.noHotspots}</p>
            )}

            <h3 className="mt-5 text-sm font-black uppercase tracking-wide text-gray-700">
              {t.topHotspots}
            </h3>
            <div className="mt-2 space-y-2">
              {topHotspots.map((cluster) => (
                <button
                  key={cluster.id}
                  type="button"
                  className={`flex w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm ${
                    selectedCluster?.id === cluster.id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white'
                  }`}
                  onClick={() => selectCluster(cluster)}
                >
                  <span>
                    <strong className="block text-gray-900">
                      {cluster.department}
                    </strong>
                    <small className="text-gray-500">{cluster.priority}</small>
                  </span>
                  <strong className="rounded-full bg-gray-900 px-2 py-1 text-xs text-white">
                    {cluster.count}
                  </strong>
                </button>
              ))}
            </div>
          </aside>
        </div>

        <div className="mx-4 mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 lg:mx-5">
          <h3 className="font-black text-blue-950">{t.howToUseMap}</h3>
          <p className="mt-1 text-sm leading-6 text-blue-900">
            {t.hotspotInstructions}
          </p>
        </div>
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
          <table className="w-full min-w-[980px] text-left text-sm text-gray-700">
            <thead className="border-b bg-gray-50 text-gray-900">
              <tr>
                <th className="px-3 py-3">{t.id}</th>
                <th className="px-3 py-3">{t.complaint}</th>
                <th className="px-3 py-3">{t.photo}</th>
                <th className="px-3 py-3">{t.dept}</th>
                <th className="px-3 py-3">{t.priority}</th>
                <th className="px-3 py-3">{t.score}</th>
                <th className="px-3 py-3">{t.geminiUsed}</th>
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
                  <td className="max-w-56 truncate px-3 py-3">{row.text}</td>
                  <td className="w-32 min-w-32 px-3 py-3">
                    {row.has_photo ? (
                      <a
                        href={getComplaintPhotoUrl(row.id)}
                        target="_blank"
                        rel="noreferrer"
                        className="block w-fit"
                        aria-label={`${t.photo} #${row.id}`}
                      >
                        <img
                          src={getComplaintPhotoUrl(row.id)}
                          alt={`${t.photo} #${row.id}`}
                          className="h-20 w-28 min-w-28 rounded-lg border border-gray-200 object-cover shadow-sm transition hover:scale-105"
                        />
                      </a>
                    ) : (
                      <span className="text-gray-400">{t.notAttached}</span>
                    )}
                  </td>
                  <td className="px-3 py-3">{row.department || '-'}</td>
                  <td className="px-3 py-3">{row.priority || '-'}</td>
                  <td className="px-3 py-3">{row.score ?? '-'}</td>
                  <td className="px-3 py-3 text-center font-black">
                    {row.analysis_source === 'local' ? 0 : 1}
                  </td>
                  <td className="px-3 py-3">
                    {row.duplicate_of ? `#${row.duplicate_of}` : '-'}
                  </td>
                  <td className="w-48 min-w-48 px-3 py-3">
                    <select
                      className="w-full rounded border border-gray-300 bg-white px-2 py-1"
                      value={selectedStatus}
                      disabled={
                        row.status === 'Invalid' || row.status === 'Registered'
                      }
                      onChange={(event) =>
                        handleStatusChange(row.id, event.target.value)
                      }
                    >
                      <option value="Open">{t.open}</option>
                      <option value="In Progress">{t.inProgress}</option>
                      <option value="Resolved">{t.resolved}</option>
                      <option value="Invalid" disabled>{t.invalid}</option>
                      <option value="Registered" disabled>
                        {t.registeredStatus}
                      </option>
                    </select>

                    {selectedStatus === 'In Progress' && (
                      <div className="mt-2 grid w-full grid-cols-2 gap-2">
                        <label className="min-w-0 text-xs">
                          {t.days}
                          <input
                            type="number"
                            min="0"
                            className="mt-1 block w-full min-w-0 rounded border border-gray-300 px-2 py-1"
                            value={days}
                            onChange={(event) =>
                              updateEstimate(row.id, 'days', event.target.value)
                            }
                          />
                        </label>
                        <label className="min-w-0 text-xs">
                          {t.hours}
                          <input
                            type="number"
                            min="0"
                            max="23"
                            className="mt-1 block w-full min-w-0 rounded border border-gray-300 px-2 py-1"
                            value={hours}
                            onChange={(event) =>
                              updateEstimate(row.id, 'hours', event.target.value)
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="col-span-2 w-full rounded bg-blue-600 px-3 py-2 font-medium text-white disabled:opacity-50"
                          disabled={Number(days) + Number(hours) === 0}
                          onClick={() => saveInProgress(row)}
                        >
                          {t.save}
                        </button>
                      </div>
                    )}

                    {statusDrafts[row.id] === 'Resolved' && (
                      <div className="mt-3 w-full rounded-lg border border-green-200 bg-green-50 p-3">
                        <label className="block text-xs font-bold text-green-900">
                          {t.resolutionPhotoOptional}
                          <input
                            type="file"
                            accept="image/*"
                            className="mt-2 block w-full min-w-0 max-w-full text-xs text-gray-700 file:mr-2 file:rounded file:border-0 file:bg-green-700 file:px-3 file:py-2 file:font-bold file:text-white"
                            onChange={(event) =>
                              setResolutionPhotoDrafts((current) => ({
                                ...current,
                                [row.id]: event.target.files[0] || null,
                              }))
                            }
                          />
                        </label>
                        <button
                          type="button"
                          className="mt-3 w-full rounded bg-green-700 px-3 py-2 font-bold text-white"
                          onClick={() => saveResolved(row)}
                        >
                          {t.markResolved}
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

import { useState } from 'react'
import { submit, getStatus } from './api'

function Citizen({ t }) {
  const [citizenPage, setCitizenPage] = useState('complaint')
  const [complainantName, setComplainantName] = useState('')
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [locationMode, setLocationMode] = useState('current')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [address, setAddress] = useState('')
  const [trackId, setTrackId] = useState('')
  const [tracked, setTracked] = useState(null)

  async function submitReport(location) {
    try {
      const response = await submit({
        text,
        complainantName,
        photo,
        ...location,
      })
      setResult(response)
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit() {
    setLoading(true)

    if (locationMode === 'coordinates') {
      submitReport({ lat: Number(lat), lng: Number(lng), address: null })
      return
    }

    if (locationMode === 'address') {
      // Typed addresses are stored as written and are not converted to coordinates.
      submitReport({ lat: null, lng: null, address })
      return
    }

    // Use current coordinates when allowed, with Mumbai as the fallback.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        submitReport({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          address: null,
        })
      },
      () => submitReport({ lat: 19.07, lng: 72.87, address: null }),
    )
  }

  async function handleCheckStatus() {
    const response = await getStatus(trackId)
    setTracked(response)
  }

  const locationReady =
    locationMode === 'current' ||
    (locationMode === 'coordinates' && lat !== '' && lng !== '') ||
    (locationMode === 'address' && address.trim() !== '')

  const estimate =
    tracked?.estimated_resolution_days !== null &&
    tracked?.estimated_resolution_days !== undefined
      ? `${tracked.estimated_resolution_days} ${t.days}, ${tracked.estimated_resolution_hours ?? 0} ${t.hours}`
      : t.notAvailable

  return (
    <div>
      <nav className="mb-6 flex flex-wrap gap-3">
        <button
          type="button"
          className={`rounded-lg px-5 py-3 text-base font-bold ${
            citizenPage === 'complaint'
              ? 'bg-blue-700 text-white shadow-sm'
              : 'bg-blue-100 text-blue-800'
          }`}
          onClick={() => setCitizenPage('complaint')}
        >
          {t.complaintPage}
        </button>
        <button
          type="button"
          className={`rounded-lg px-5 py-3 text-base font-bold ${
            citizenPage === 'tracking'
              ? 'bg-green-700 text-white shadow-sm'
              : 'bg-green-100 text-green-800'
          }`}
          onClick={() => setCitizenPage('tracking')}
        >
          {t.trackingPage}
        </button>
      </nav>

      {citizenPage === 'complaint' ? (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm md:p-8">
          <h2 className="mb-6 text-3xl font-black text-blue-950">
            {t.submitComplaint}
          </h2>

          <label className="mb-2 block text-base font-bold text-gray-800">
            {t.complainantName}
          </label>
          <input
            type="text"
            className="mb-5 w-full rounded-lg border border-blue-200 bg-white p-3 text-gray-900 outline-none focus:border-blue-600"
            placeholder={t.enterName}
            value={complainantName}
            onChange={(event) => setComplainantName(event.target.value)}
          />

          <label className="mb-2 block text-base font-bold text-gray-800">
            {t.complaint}
          </label>
          <textarea
            className="min-h-40 w-full rounded-lg border border-blue-200 bg-white p-3 text-gray-900 outline-none focus:border-blue-600"
            placeholder={t.describeIssue}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />

          <label className="mb-2 mt-5 block text-base font-bold text-gray-800">
            {t.photoOptional}
          </label>
          <input
            type="file"
            accept="image/*"
            className="block w-full rounded-lg bg-white p-2 text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-700 file:px-4 file:py-2 file:font-bold file:text-white"
            onChange={(event) => setPhoto(event.target.files[0] || null)}
          />

          <p className="mb-3 mt-5 text-base font-bold text-gray-800">
            {t.chooseLocation}
          </p>
          <div className="flex flex-wrap gap-3">
            {[
              ['current', t.currentLocation],
              ['coordinates', t.coordinates],
              ['address', t.typedAddress],
            ].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                className={`rounded-lg px-4 py-2 font-bold ${
                  locationMode === mode
                    ? 'bg-blue-700 text-white'
                    : 'bg-blue-200 text-blue-900'
                }`}
                onClick={() => setLocationMode(mode)}
              >
                {label}
              </button>
            ))}
          </div>

          {locationMode === 'coordinates' && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <input
                type="number"
                step="any"
                className="rounded-lg border border-blue-200 bg-white p-3 outline-none focus:border-blue-600"
                placeholder={t.latitude}
                value={lat}
                onChange={(event) => setLat(event.target.value)}
              />
              <input
                type="number"
                step="any"
                className="rounded-lg border border-blue-200 bg-white p-3 outline-none focus:border-blue-600"
                placeholder={t.longitude}
                value={lng}
                onChange={(event) => setLng(event.target.value)}
              />
            </div>
          )}

          {locationMode === 'address' && (
            <input
              type="text"
              className="mt-4 w-full rounded-lg border border-blue-200 bg-white p-3 outline-none focus:border-blue-600"
              placeholder={t.addressPlaceholder}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
            />
          )}

          <button
            type="button"
            className="mt-6 rounded-lg bg-blue-700 px-7 py-3 text-lg font-black text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleSubmit}
            disabled={
              loading ||
              complainantName.trim() === '' ||
              text.trim() === '' ||
              !locationReady
            }
          >
            {loading ? t.registering : t.submit}
          </button>

          {result && (
            <div className="mt-7 rounded-xl border-4 border-blue-300 bg-blue-800 p-6 text-white shadow-lg">
              <p className="text-3xl font-black md:text-4xl">
                {t.complaintRegistered}
              </p>
              <p className="mt-2 text-lg font-bold text-blue-100">
                {t.registered}
              </p>
              <p className="mt-3 text-xl font-black">
                {t.complaintId}: {result.id}
              </p>
            </div>
          )}
        </section>
      ) : (
        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5 shadow-sm md:p-8">
          <h2 className="mb-6 text-3xl font-black text-blue-950">
            {t.trackStatus}
          </h2>

          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              type="text"
              className="min-w-0 flex-1 rounded-lg border border-green-300 bg-white p-3 text-gray-900 outline-none focus:border-green-700"
              placeholder={t.enterComplaintId}
              value={trackId}
              onChange={(event) => setTrackId(event.target.value)}
            />
            <button
              type="button"
              className="rounded-lg bg-green-700 px-7 py-3 text-lg font-black text-white shadow-sm"
              onClick={handleCheckStatus}
            >
              {t.check}
            </button>
          </div>

          {tracked && !tracked.error && (
            <div className="mt-7 grid gap-4 md:grid-cols-2">
              <DetailBox label={t.complainantName} value={tracked.complainant_name || '-'} />
              <DetailBox label={t.status} value={tracked.department ? tracked.status : t.registered} />
              <DetailBox label={t.department} value={tracked.department || t.notAvailable} />
              <DetailBox label={t.estimatedResolution} value={estimate} />
              <DetailBox label={t.complaint} value={tracked.text} wide />

              <div className="rounded-xl border border-blue-200 bg-white p-4 md:col-span-2">
                <p className="font-bold text-gray-800">
                  {t.location}: {tracked.address || `${tracked.lat}, ${tracked.lng}`}
                </p>
                <p className="mt-2 font-bold text-gray-800">
                  {t.photo}: {tracked.has_photo ? t.attached : t.notAttached}
                </p>
                {tracked.department && (
                  <>
                    <p className="mt-2 font-bold text-gray-800">
                      {t.priority}: {tracked.priority} ({tracked.score}/100)
                    </p>
                    <p className="mt-2 font-bold text-gray-800">
                      {t.reasons}: {tracked.reasons.join(', ')}
                    </p>
                  </>
                )}
                {tracked.duplicate_of && (
                  <p className="mt-3 text-lg font-black text-orange-700">
                    ⚠️ {t.possibleDuplicate} #{tracked.duplicate_of}
                  </p>
                )}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function DetailBox({ label, value, wide = false }) {
  return (
    <div
      className={`rounded-xl border-2 border-blue-200 bg-blue-100 p-5 ${
        wide ? 'md:col-span-2' : ''
      }`}
    >
      <p className="text-sm font-black uppercase tracking-wide text-blue-800">
        {label}
      </p>
      <p className="mt-2 text-xl font-black text-gray-950">{value}</p>
    </div>
  )
}

export default Citizen

import { useState } from 'react'
import { submit, getStatus } from './api'

function Citizen({ t }) {
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
      // Store typed addresses exactly as entered; no geocoding is performed.
      submitReport({ lat: null, lng: null, address })
      return
    }

    // Use the device coordinates when allowed; otherwise use the Mumbai fallback.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        submitReport({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          address: null,
        })
      },
      () => {
        submitReport({ lat: 19.07, lng: 72.87, address: null })
      },
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

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          {t.submitComplaint}
        </h2>

        <label className="mb-2 block text-sm font-semibold text-gray-700">
          {t.complainantName}
        </label>
        <input
          type="text"
          className="mb-4 w-full rounded-md border border-gray-300 p-3 text-gray-900 outline-none focus:border-blue-500"
          placeholder={t.enterName}
          value={complainantName}
          onChange={(event) => setComplainantName(event.target.value)}
        />

        <textarea
          className="min-h-36 w-full rounded-md border border-gray-300 p-3 text-gray-900 outline-none focus:border-blue-500"
          placeholder={t.describeIssue}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />

        <label className="mb-2 mt-4 block text-sm font-semibold text-gray-700">
          {t.photoOptional}
        </label>
        <input
          type="file"
          accept="image/*"
          className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-2 file:font-medium file:text-blue-700"
          onChange={(event) => setPhoto(event.target.files[0] || null)}
        />

        <p className="mb-2 mt-4 text-sm font-semibold text-gray-700">
          {t.chooseLocation}
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            ['current', t.currentLocation],
            ['coordinates', t.coordinates],
            ['address', t.typedAddress],
          ].map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                locationMode === mode
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700'
              }`}
              onClick={() => setLocationMode(mode)}
            >
              {label}
            </button>
          ))}
        </div>

        {locationMode === 'coordinates' && (
          <div className="mt-4 grid grid-cols-2 gap-3">
            <input
              type="number"
              step="any"
              className="rounded-md border border-gray-300 p-3 outline-none focus:border-blue-500"
              placeholder={t.latitude}
              value={lat}
              onChange={(event) => setLat(event.target.value)}
            />
            <input
              type="number"
              step="any"
              className="rounded-md border border-gray-300 p-3 outline-none focus:border-blue-500"
              placeholder={t.longitude}
              value={lng}
              onChange={(event) => setLng(event.target.value)}
            />
          </div>
        )}

        {locationMode === 'address' && (
          <input
            type="text"
            className="mt-4 w-full rounded-md border border-gray-300 p-3 outline-none focus:border-blue-500"
            placeholder={t.addressPlaceholder}
            value={address}
            onChange={(event) => setAddress(event.target.value)}
          />
        )}

        <button
          type="button"
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
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
          <div className="mt-6 rounded-md bg-gray-50 p-4 text-sm text-gray-700">
            <p>
              <span className="font-semibold">{t.complaintId}:</span>{' '}
              {result.id}
            </p>
            <p className="mt-2 font-semibold text-blue-600">{t.registered}</p>
          </div>
        )}
      </section>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          {t.trackStatus}
        </h2>

        <input
          type="text"
          className="w-full rounded-md border border-gray-300 p-3 text-gray-900 outline-none focus:border-blue-500"
          placeholder={t.enterComplaintId}
          value={trackId}
          onChange={(event) => setTrackId(event.target.value)}
        />

        <button
          type="button"
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 font-medium text-white"
          onClick={handleCheckStatus}
        >
          {t.check}
        </button>

        {tracked && !tracked.error && (
          <div className="mt-6 rounded-md bg-gray-50 p-4 text-sm text-gray-700">
            <p>
              <span className="font-semibold">{t.complainantName}:</span>{' '}
              {tracked.complainant_name || '-'}
            </p>
            <p>
              <span className="font-semibold">{t.complaint}:</span>{' '}
              {tracked.text}
            </p>
            <p>
              <span className="font-semibold">{t.location}:</span>{' '}
              {tracked.address || `${tracked.lat}, ${tracked.lng}`}
            </p>
            <p>
              <span className="font-semibold">{t.photo}:</span>{' '}
              {tracked.has_photo ? t.attached : t.notAttached}
            </p>

            {tracked.department ? (
              <>
                <p>
                  <span className="font-semibold">{t.status}:</span>{' '}
                  {tracked.status}
                </p>
                {tracked.status === 'In Progress' &&
                  tracked.estimated_resolution_days !== null && (
                    <p>
                      <span className="font-semibold">
                        {t.estimatedResolution}:
                      </span>{' '}
                      {tracked.estimated_resolution_days} {t.days},{' '}
                      {tracked.estimated_resolution_hours ?? 0} {t.hours}
                    </p>
                  )}
                <p>
                  <span className="font-semibold">{t.department}:</span>{' '}
                  {tracked.department}
                </p>
                <p>
                  <span className="font-semibold">{t.priority}:</span>{' '}
                  {tracked.priority} ({tracked.score}/100)
                </p>
                <p>
                  <span className="font-semibold">{t.reasons}:</span>{' '}
                  {tracked.reasons.join(', ')}
                </p>

                {tracked.duplicate_of && (
                  <p className="mt-3 font-semibold text-orange-600">
                    ⚠️ {t.possibleDuplicate} #{tracked.duplicate_of}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 font-semibold text-blue-600">
                {t.registered}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

export default Citizen

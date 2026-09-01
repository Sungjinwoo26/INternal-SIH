import { useState } from 'react'
import { submit, getStatus } from './api'

function Citizen() {
  const [text, setText] = useState('')
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [trackId, setTrackId] = useState('')
  const [tracked, setTracked] = useState(null)

  async function submitWithLocation(lat, lng) {
    try {
      const response = await submit({ text, lat, lng })
      setResult(response)
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit() {
    setLoading(true)

    // Use the browser's coordinates when allowed; otherwise use the Mumbai fallback.
    navigator.geolocation.getCurrentPosition(
      (position) => {
        submitWithLocation(
          position.coords.latitude,
          position.coords.longitude,
        )
      },
      () => {
        submitWithLocation(19.07, 72.87)
      },
    )
  }

  async function handleCheckStatus() {
    const response = await getStatus(trackId)
    setTracked(response)
  }

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          Submit Complaint
        </h2>

        <textarea
          className="min-h-36 w-full rounded-md border border-gray-300 p-3 text-gray-900 outline-none focus:border-blue-500"
          placeholder="Describe your issue..."
          value={text}
          onChange={(event) => setText(event.target.value)}
        />

        <button
          type="button"
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 font-medium text-white disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? 'Analyzing...' : 'Submit'}
        </button>

        {result && (
          <div className="mt-6 rounded-md bg-gray-50 p-4 text-sm text-gray-700">
            <p>
              <span className="font-semibold">Complaint ID:</span> {result.id}
            </p>
            <p className="mt-2 font-semibold text-blue-600">
              Registered - AI analysis is in progress
            </p>
          </div>
        )}
      </section>

      <section className="rounded-lg bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">
          Track Status
        </h2>

        <input
          type="text"
          className="w-full rounded-md border border-gray-300 p-3 text-gray-900 outline-none focus:border-blue-500"
          placeholder="Enter Complaint ID"
          value={trackId}
          onChange={(event) => setTrackId(event.target.value)}
        />

        <button
          type="button"
          className="mt-4 rounded-md bg-blue-600 px-4 py-2 font-medium text-white"
          onClick={handleCheckStatus}
        >
          Check
        </button>

        {tracked && !tracked.error && (
          <div className="mt-6 rounded-md bg-gray-50 p-4 text-sm text-gray-700">
            <p>
              <span className="font-semibold">Complaint:</span> {tracked.text}
            </p>
            <p>
              <span className="font-semibold">Location:</span> {tracked.lat},{' '}
              {tracked.lng}
            </p>

            {tracked.department ? (
              <>
                <p>
                  <span className="font-semibold">Status:</span>{' '}
                  {tracked.status}
                </p>
                <p>
                  <span className="font-semibold">Department:</span>{' '}
                  {tracked.department}
                </p>
                <p>
                  <span className="font-semibold">Priority:</span>{' '}
                  {tracked.priority} ({tracked.score}/100)
                </p>
                <p>
                  <span className="font-semibold">Reasons:</span>{' '}
                  {tracked.reasons.join(', ')}
                </p>

                {/* Show the stored duplicate link after Gemini analysis is complete. */}
                {tracked.duplicate_of && (
                  <p className="mt-3 font-semibold text-orange-600">
                    ⚠️ Possible duplicate of #{tracked.duplicate_of}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 font-semibold text-blue-600">
                Status: Registered - AI analysis is in progress
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  )
}

export default Citizen

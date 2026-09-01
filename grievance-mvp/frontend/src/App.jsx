import { useState } from 'react'
import Citizen from './Citizen.jsx'
import Authority from './Authority.jsx'

function App() {
  const [activeTab, setActiveTab] = useState('citizen')

  const activeClasses = 'bg-blue-600 text-white'
  const inactiveClasses = 'bg-white text-gray-700'

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-5xl">
        <h1 className="mb-6 text-3xl font-bold text-gray-900">
          AI Grievance Platform
        </h1>

        <div className="mb-6 flex gap-2">
          <button
            type="button"
            className={`rounded px-4 py-2 font-medium ${
              activeTab === 'citizen' ? activeClasses : inactiveClasses
            }`}
            onClick={() => setActiveTab('citizen')}
          >
            Citizen
          </button>
          <button
            type="button"
            className={`rounded px-4 py-2 font-medium ${
              activeTab === 'authority' ? activeClasses : inactiveClasses
            }`}
            onClick={() => setActiveTab('authority')}
          >
            Authority
          </button>
        </div>

        {activeTab === 'citizen' ? <Citizen /> : <Authority />}
      </div>
    </main>
  )
}

export default App

import { useState } from 'react'
import Citizen from './Citizen.jsx'
import Authority from './Authority.jsx'
import translations from './translations.js'

function App() {
  const [activeTab, setActiveTab] = useState('citizen')
  const [language, setLanguage] = useState('en')
  const t = translations[language]

  const activeClasses = 'bg-blue-600 text-white'
  const inactiveClasses = 'bg-white text-gray-700'

  return (
    <main className="min-h-screen bg-gray-100 p-6">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-3xl font-bold text-gray-900">{t.appTitle}</h1>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
            {t.language}
            <select
              className="rounded border border-gray-300 bg-white px-3 py-2"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
              <option value="mr">मराठी</option>
            </select>
          </label>
        </div>

        <div className="mb-6 flex gap-2">
          <button
            type="button"
            className={`rounded px-4 py-2 font-medium ${
              activeTab === 'citizen' ? activeClasses : inactiveClasses
            }`}
            onClick={() => setActiveTab('citizen')}
          >
            {t.citizen}
          </button>
          <button
            type="button"
            className={`rounded px-4 py-2 font-medium ${
              activeTab === 'authority' ? activeClasses : inactiveClasses
            }`}
            onClick={() => setActiveTab('authority')}
          >
            {t.authority}
          </button>
        </div>

        {activeTab === 'citizen' ? <Citizen t={t} /> : <Authority t={t} />}
      </div>
    </main>
  )
}

export default App

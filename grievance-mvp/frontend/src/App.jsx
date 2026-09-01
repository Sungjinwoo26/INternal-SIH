import { useState } from 'react'
import Citizen from './Citizen.jsx'
import Authority from './Authority.jsx'
import translations from './translations.js'

const AUTHORITY_USERS = {
  admin: '1234',
  akshat: '0000',
}

const AUTHORITY_SESSION_KEY = 'authority-auth-user'

function App() {
  const [activePage, setActivePage] = useState('citizen')
  const [language, setLanguage] = useState('en')
  const [credentials, setCredentials] = useState({ userId: '', password: '' })
  const [loginError, setLoginError] = useState('')
  const [authorityUser, setAuthorityUser] = useState(() => {
    if (typeof window === 'undefined') {
      return ''
    }

    const savedUser = window.localStorage.getItem(AUTHORITY_SESSION_KEY) || ''
    return Object.hasOwn(AUTHORITY_USERS, savedUser) ? savedUser : ''
  })
  const t = translations[language]

  function handleAuthorityTabClick() {
    setActivePage('authority')
    setLoginError('')
  }

  function handleCredentialChange(event) {
    const { name, value } = event.target
    setCredentials((current) => ({ ...current, [name]: value }))
  }

  function handleAuthorityLogin(event) {
    event.preventDefault()

    const normalizedUserId = credentials.userId.trim().toLowerCase()
    const matchedPassword = AUTHORITY_USERS[normalizedUserId]

    if (!matchedPassword || matchedPassword !== credentials.password) {
      setLoginError(t.loginError)
      return
    }

    window.localStorage.setItem(AUTHORITY_SESSION_KEY, normalizedUserId)
    setAuthorityUser(normalizedUserId)
    setCredentials({ userId: '', password: '' })
    setLoginError('')
  }

  function handleAuthorityLogout() {
    window.localStorage.removeItem(AUTHORITY_SESSION_KEY)
    setAuthorityUser('')
    setCredentials({ userId: '', password: '' })
    setLoginError('')
    setActivePage('citizen')
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-100 via-blue-50 to-blue-200">
      <header className="bg-blue-800 px-5 py-6 text-white shadow-md md:px-10">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-5">
          <h1 className="text-4xl font-black tracking-tight md:text-5xl">
            Grievance Platform
          </h1>

          <label className="flex items-center gap-3 text-lg font-bold">
            {t.language}
            <select
              className="rounded-lg border-2 border-blue-300 bg-white px-4 py-3 text-lg font-bold text-gray-900"
              value={language}
              onChange={(event) => setLanguage(event.target.value)}
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
              <option value="mr">मराठी</option>
            </select>
          </label>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-7 md:px-10">
        <nav className="mb-7 flex gap-3 border-b border-gray-200 pb-4">
          <button
            type="button"
            className={`rounded-lg px-6 py-3 text-lg font-bold ${
              activePage === 'citizen'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700'
            }`}
            onClick={() => setActivePage('citizen')}
          >
            {t.citizen}
          </button>
          <button
            type="button"
            className={`rounded-lg px-6 py-3 text-lg font-bold ${
              activePage === 'authority'
                ? 'bg-blue-700 text-white shadow-sm'
                : 'bg-gray-100 text-gray-700'
            }`}
            onClick={handleAuthorityTabClick}
          >
            {t.authority}
          </button>
        </nav>

        {activePage === 'citizen' ? (
          <Citizen t={t} />
        ) : authorityUser ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
              <span>
                {t.loggedInAs}: {authorityUser}
              </span>
              <button
                type="button"
                className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white"
                onClick={handleAuthorityLogout}
              >
                {t.logout}
              </button>
            </div>
            <Authority t={t} />
          </div>
        ) : (
          <section className="mx-auto max-w-md rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-blue-700">
              {t.authorityAccess}
            </p>
            <h2 className="mt-3 text-3xl font-black text-gray-900">
              {t.authorityLoginTitle}
            </h2>
            <p className="mt-2 text-base text-gray-600">
              {t.authorityLoginSubtitle}
            </p>

            <form className="mt-6 space-y-4" onSubmit={handleAuthorityLogin}>
              <label className="block text-sm font-bold text-gray-800">
                {t.userId}
                <input
                  type="text"
                  name="userId"
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  value={credentials.userId}
                  onChange={handleCredentialChange}
                  placeholder={t.enterUserId}
                  autoComplete="username"
                />
              </label>

              <label className="block text-sm font-bold text-gray-800">
                {t.password}
                <input
                  type="password"
                  name="password"
                  className="mt-2 w-full rounded-xl border border-gray-300 px-4 py-3 text-base text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
                  value={credentials.password}
                  onChange={handleCredentialChange}
                  placeholder={t.enterPassword}
                  autoComplete="current-password"
                />
              </label>

              {loginError ? (
                <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                  {loginError}
                </p>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-xl bg-blue-700 px-4 py-3 text-base font-bold text-white transition hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={!credentials.userId.trim() || !credentials.password}
              >
                {t.signIn}
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  )
}

export default App

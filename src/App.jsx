import { useEffect, useState } from 'react'
import MobileFieldApp from './components/NutriGrid_Mobile_Complete'
import { initializeLocalDatabase } from './utils/bnsStorage'


function App() {
  const [storageReady, setStorageReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    const startupFallback = window.setTimeout(() => {
      if (!cancelled) setStorageReady(true)
    }, 2000)

    initializeLocalDatabase()
      .catch((error) => console.error('Local database initialization failed:', error))
      .finally(() => {
        window.clearTimeout(startupFallback)
        if (!cancelled) setStorageReady(true)
      })

    return () => {
      cancelled = true
      window.clearTimeout(startupFallback)
    }
  }, [])

  if (!storageReady) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 text-slate-700" aria-live="polite">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-blue-600" aria-hidden="true" />
        <p className="text-sm font-medium">Loading NutriGrid...</p>
      </main>
    )
  }

  return <MobileFieldApp />
}

export default App
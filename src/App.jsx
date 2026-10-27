import { useEffect, useState } from 'react'
import MobileFieldApp from './components/NutriGrid_Mobile_Complete'
import { initializeLocalDatabase } from './utils/bnsStorage'


function App() {
  const [localDatabaseReady, setLocalDatabaseReady] = useState(false)

  useEffect(() => {
    initializeLocalDatabase()
      .catch((error) => {
        console.error('Local database initialization failed:', error)
      })
      .finally(() => setLocalDatabaseReady(true))
  }, [])

  if (!localDatabaseReady) {
    return (
      <main className="grid min-h-screen place-items-center bg-pink-50 text-sm font-medium text-violet-700">
        Loading your saved records…
      </main>
    )
  }

  return <MobileFieldApp />
}

export default App
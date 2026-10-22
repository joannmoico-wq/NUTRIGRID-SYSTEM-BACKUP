import { useEffect } from 'react'
import MobileFieldApp from './components/NutriGrid_Mobile_Complete'
import { initializeLocalDatabase } from './utils/bnsStorage'


function App() {
  useEffect(() => {
    initializeLocalDatabase()
      .catch((error) => console.error('Local database initialization failed:', error))
  }, [])

  return <MobileFieldApp />
}

export default App
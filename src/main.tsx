import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startRun } from './ui/cardActions'
import { seedFromUrl } from './ui/seedUrl'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root element')

// A `?seed=` in the URL starts that run immediately, bypassing the start
// screen. Read before render so the first paint is already that run. This is
// deliberately not in `src/state/simulation.ts` — that module is imported by
// `src/state/simulation.test.ts` under plain Node with no jsdom, so a
// module-scope `window` read there would throw in every test run. The
// simulation's throwaway random boot is simply replaced, the same way any
// `startRun` call replaces it.
const urlSeed = seedFromUrl(window.location.search)
if (urlSeed !== null) startRun(urlSeed)

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

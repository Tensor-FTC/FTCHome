import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import './styles/base.css'
import './styles/components.css'
import './styles/shell.css'
import './styles/auth.css'
import './styles/print.css'
import { apply as applyAppearance } from './lib/appearance'

// Before render, not inside it: reading the stored theme in an effect paints one
// frame of the wrong one, which is the flash every themed app is judged on.
applyAppearance()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

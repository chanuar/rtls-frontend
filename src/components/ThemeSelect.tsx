import { useState } from 'react'

export function ThemeSelect() {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? 'system')
  function selectTheme(value: string) {
    if (!['light', 'dark', 'system'].includes(value)) return
    document.documentElement.dataset.theme = value
    setTheme(value)
    try {
      localStorage.setItem('rtls-theme', value)
    } catch (error) {
      // La selección sigue activa aunque el navegador no permita guardarla.
      if (!(error instanceof DOMException && ['SecurityError', 'QuotaExceededError'].includes(error.name))) throw error
    }
  }
  return <label className="theme-select">
    <span>Tema</span>
    <select value={theme} onChange={event => selectTheme(event.target.value)}>
      <option value="system">Sistema</option>
      <option value="light">Claro</option>
      <option value="dark">Oscuro</option>
    </select>
  </label>
}

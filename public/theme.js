try {
  const theme = localStorage.getItem('rtls-theme')
  if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme
} catch (error) {
  if (!(error instanceof DOMException && error.name === 'SecurityError')) throw error
}

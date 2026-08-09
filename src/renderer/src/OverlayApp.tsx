import { useEffect, useState } from 'react'

function OverlayApp(): React.JSX.Element {
  const [interactive, setInteractive] = useState(false)

  useEffect(() => {
    const handler = (_event: unknown, value: boolean): void => setInteractive(value)
    window.electron.ipcRenderer.on('overlay:interactive-changed', handler)
    return () => {
      window.electron.ipcRenderer.removeListener('overlay:interactive-changed', handler)
    }
  }, [])

  return (
    <div className="overlay-panel">
      <span className="overlay-dot" data-active={interactive} />
      <div className="overlay-text">
        <strong>Overlay prototype</strong>
        <span>Ctrl/Cmd+Shift+Space — show / hide</span>
        <span>
          Ctrl/Cmd+Shift+I — {interactive ? 'interactive (click to switch back)' : 'click-through'}
        </span>
      </div>
    </div>
  )
}

export default OverlayApp

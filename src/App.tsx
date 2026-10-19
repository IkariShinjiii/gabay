import { useEffect, useRef, useState } from 'react'

type Mode = 'click-through' | 'interactive'

export default function App(): React.JSX.Element {
  const notchRef = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<Mode>('click-through')

  useEffect(() => {
    let inside = false

    // While the window is click-through, Electron forwards mousemove only, which is enough here.
    const onMove = (e: MouseEvent): void => {
      const r = notchRef.current?.getBoundingClientRect()
      if (!r) return
      const nowInside =
        e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      if (nowInside === inside) return // only talk to main on a state change
      inside = nowInside
      window.overlay.setInteractive(nowInside)
      setMode(nowInside ? 'interactive' : 'click-through')
    }

    document.addEventListener('mousemove', onMove)
    return () => document.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div ref={notchRef} className="notch">
      {mode} {/* debug label: remove later */}
    </div>
  )
}

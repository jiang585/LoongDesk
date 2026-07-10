import { X } from 'lucide-react'
import type { ReactNode } from 'react'

export function Modal({ title, children, onClose, wide = false }: {
  title: string
  children: ReactNode
  onClose(): void
  wide?: boolean
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose()
    }}>
      <section className={`modal paper-panel ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="modal-header">
          <div><span className="eyebrow">御前呈览</span><h2>{title}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button>
        </header>
        {children}
      </section>
    </div>
  )
}


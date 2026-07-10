import { ScrollText } from 'lucide-react'
import type { ReactNode } from 'react'

export function EmptyState({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-seal"><ScrollText size={26} /></span>
      <h3>{title}</h3>
      <p>{detail}</p>
      {action}
    </div>
  )
}

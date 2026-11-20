import type { CSSProperties } from 'react'
import { Toaster } from 'sonner'
import { AppRoutes } from './routes'

// Sonner's own CSS sets the toast surface, so theme it through its variables.
const toastStyle = {
  '--normal-bg': 'var(--card)',
  '--normal-border': 'var(--border)',
  '--normal-text': 'var(--card-foreground)',
  '--border-radius': 'calc(var(--radius) * 1.4)',
} as CSSProperties

export default function App() {
  return (
    <>
      <AppRoutes />
      <Toaster
        theme="light"
        position="top-center"
        closeButton
        style={toastStyle}
        toastOptions={{
          classNames: {
            toast: 'rounded-xl border border-border bg-card text-card-foreground shadow-lg',
            title: 'text-sm font-semibold',
            description: 'text-sm text-muted-foreground',
            icon: 'text-muted-foreground',
            closeButton:
              'border border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
            success: '[&_[data-icon]]:text-[var(--success)]',
            error: '[&_[data-icon]]:text-destructive',
            warning: '[&_[data-icon]]:text-[var(--action)]',
            info: '[&_[data-icon]]:text-foreground',
          },
        }}
      />
    </>
  )
}

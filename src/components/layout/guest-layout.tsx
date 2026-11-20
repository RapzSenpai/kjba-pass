import { Outlet } from 'react-router-dom'
import { Logo } from '@/components/common/logo'

export function GuestLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="mx-auto w-full max-w-md px-4 pt-5 pb-2">
        <Logo />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        <Outlet />
      </main>
      <footer className="mx-auto w-full max-w-md px-4 pb-6 text-center text-xs text-muted-foreground">
        Powered by KJBA Production
      </footer>
    </div>
  )
}

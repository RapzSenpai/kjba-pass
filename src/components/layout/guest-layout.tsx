import { Outlet } from 'react-router-dom'
import logoKjba from '@/assets/logoKjba.png'
import safelinksLogo from '@/assets/safelinksLogo.png'

export function GuestLayout() {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="mx-auto flex w-full max-w-md items-center justify-center px-4 pt-8 pb-3">
        <img
          src={safelinksLogo}
          alt="Safelinks"
          className="h-16 sm:h-20 w-auto object-contain [filter:drop-shadow(0_4px_14px_rgba(0,0,0,0.14))_drop-shadow(0_1px_4px_rgba(0,0,0,0.08))]"
        />
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        <Outlet />
      </main>
      <footer className="mx-auto flex w-full max-w-md items-center justify-center gap-2 px-4 pb-6 text-center text-xs text-muted-foreground select-none">
        <img
          src={logoKjba}
          alt="KJBA"
          className="h-5 w-auto object-contain opacity-85"
        />
        <span>Powered by KJBA Productions</span>
      </footer>
    </div>
  )
}

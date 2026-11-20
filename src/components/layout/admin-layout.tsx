import { useState } from 'react'
import {
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Trophy,
  UserCog,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/common/logo'
import { Button } from '@/components/ui/button'
import { useSession } from '@/hooks/useSession'
import { useStaffProfile } from '@/hooks/useStaffProfile'
import { cn } from '@/lib/utils'
import { supabase } from '@/lib/supabase'

const NAV: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/guests', label: 'Guest Management', icon: Users },
  { to: '/admin/staff', label: 'Staff Management', icon: UserCog },
  { to: '/admin/raffle', label: 'Raffle Management', icon: Trophy },
  { to: '/admin/logs', label: 'Activity Logs', icon: ScrollText },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export function AdminLayout() {
  const { session } = useSession()
  const profile = useStaffProfile(session?.user.id)
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const navLinks = () =>
    NAV.map((item) => {
      const Icon = item.icon
      return (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={() => setMenuOpen(false)}
          className={({ isActive }) =>
            cn(
              'flex h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-foreground hover:bg-muted',
            )
          }
        >
          <Icon className="size-5 shrink-0" aria-hidden />
          {item.label}
        </NavLink>
      )
    })

  return (
    <div className="min-h-svh bg-background md:grid md:grid-cols-[220px_1fr]">
      <aside className="sticky top-0 hidden h-svh flex-col gap-6 border-e border-border bg-muted/40 p-4 md:flex">
        <Logo />
        <nav className="flex flex-col gap-1" aria-label="Admin">
          {navLinks()}
        </nav>
        <div className="mt-auto flex flex-col gap-2 border-t border-border pt-4">
          <span className="truncate px-3 text-sm text-muted-foreground">{profile.data?.full_name}</span>
          <Button
            type="button"
            variant="ghost"
            className="h-11 justify-start px-3 text-base"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogOut className="size-5" aria-hidden />
            Log out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-2 md:hidden">
          <Logo />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11"
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          >
            {menuOpen ? <X className="size-5" aria-hidden /> : <Menu className="size-5" aria-hidden />}
          </Button>
        </header>

        {menuOpen ? (
          <nav className="flex flex-col gap-1 border-b border-border bg-background p-3 md:hidden" aria-label="Admin">
            {navLinks()}
            <Button
              type="button"
              variant="ghost"
              className="h-11 justify-start px-3 text-base"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <LogOut className="size-5" aria-hidden />
              Log out
            </Button>
          </nav>
        ) : null}

        <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

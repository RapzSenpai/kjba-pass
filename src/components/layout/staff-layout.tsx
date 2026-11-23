import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { Outlet, useNavigate } from 'react-router-dom'
import logoKjba from '@/assets/logoKjba.png'
import { Button } from '@/components/ui/button'
import { useSession } from '@/hooks/useSession'
import { useStaffProfile } from '@/hooks/useStaffProfile'
import { stationLabels } from '@/lib/labels'
import { supabase } from '@/lib/supabase'

export function StaffLayout() {
  const { session } = useSession()
  const profile = useStaffProfile(session?.user.id)
  const navigate = useNavigate()
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await supabase.auth.signOut()
    navigate('/login', { replace: true })
  }

  const stationName = profile.data?.station ? stationLabels[profile.data.station] : null

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-2.5">
          {/* Left: App title and station badge */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-foreground">
              Staff Scanner
            </span>
            {stationName ? (
              <span className="rounded-md border border-border bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {stationName}
              </span>
            ) : null}
          </div>

          {/* Right: Staff profile name and logout */}
          <div className="flex min-w-0 items-center gap-2">
            <span className="max-w-[120px] truncate text-xs text-muted-foreground sm:max-w-none sm:text-sm">
              {profile.data?.full_name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9"
              onClick={handleSignOut}
              disabled={signingOut}
              aria-label="Log out"
            >
              <LogOut className="size-4 sm:size-5" aria-hidden />
            </Button>
          </div>
        </div>
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

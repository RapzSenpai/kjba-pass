import { useState } from 'react'
import { LogOut } from 'lucide-react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Logo } from '@/components/common/logo'
import { Button } from '@/components/ui/button'
import { useSession } from '@/hooks/useSession'
import { useStaffProfile } from '@/hooks/useStaffProfile'
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

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 px-4 py-2">
          <Logo />
          <div className="flex min-w-0 items-center gap-2">
            <span className="max-w-[120px] truncate text-xs text-muted-foreground sm:max-w-none sm:text-sm">
              {profile.data?.full_name}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              onClick={handleSignOut}
              disabled={signingOut}
              aria-label="Log out"
            >
              <LogOut className="size-5" aria-hidden />
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-4">
        <Outlet />
      </main>
    </div>
  )
}

import { useQuery } from '@tanstack/react-query'
import { guestRpc } from '@/lib/guest-api'
import type { PublicSettings } from '@/types/db'

export function usePublicSettings() {
  return useQuery({
    queryKey: ['public-settings'],
    queryFn: () => guestRpc<PublicSettings>('get_public_settings', {}),
    staleTime: 60_000,
  })
}

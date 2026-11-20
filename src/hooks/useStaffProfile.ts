import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { StaffRow } from '@/types/db'

export function useStaffProfile(userId: string | undefined) {
  return useQuery({
    queryKey: ['staff', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<StaffRow | null> => {
      if (!userId) return null

      const { data, error } = await supabase
        .from('staff')
        .select('user_id, full_name, role, station, active, created_at, last_active_at')
        .eq('user_id', userId)
        .maybeSingle()

      if (error) throw error
      return data
    },
  })
}

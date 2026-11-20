import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { PublicSettings } from '@/types/db'

export function usePublicSettings() {
  return useQuery({
    queryKey: ['public-settings'],
    queryFn: async (): Promise<PublicSettings> => {
      const { data, error } = await supabase.rpc('get_public_settings')
      if (error) throw error
      return data as PublicSettings
    },
    staleTime: 60_000,
  })
}

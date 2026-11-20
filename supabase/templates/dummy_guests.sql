-- ==============================================================================
-- KJBA Pass — 400 Dummy Guests Load Testing Script
-- ==============================================================================
-- Run this in the Supabase SQL Editor to simulate 400 registered guests.
-- Does NOT write to activity_logs so all dummy rows can be cleaned up cleanly.
-- ==============================================================================

DO $$
DECLARE
  v_i INT;
  v_name TEXT;
  v_norm TEXT;
  v_token TEXT;
  v_code TEXT;
  v_inserted INT := 0;
BEGIN
  FOR v_i IN 1..400 LOOP
    v_name := 'Dummy Guest ' || lpad(v_i::text, 3, '0');
    v_norm := public.normalize_name(v_name);
    
    LOOP
      v_token := public.generate_token();
      v_code := public.generate_backup_code();
      
      BEGIN
        INSERT INTO public.guests (name, name_normalized, token, backup_code)
        VALUES (v_name, v_norm, v_token, v_code);
        
        v_inserted := v_inserted + 1;
        EXIT;
      EXCEPTION WHEN unique_violation THEN
        -- Retry on rare random token or backup_code collision
        NULL;
      END;
    END LOOP;
  END LOOP;
  
  RAISE NOTICE 'Successfully inserted % dummy guests.', v_inserted;
END;
$$;

-- ------------------------------------------------------------------------------
-- Optional: Simulate check-in for the first 250 guests
-- ------------------------------------------------------------------------------
-- UPDATE public.guests
-- SET checked_in_at = now() - (interval '1 minute' * (400 - substring(name from 13)::int)),
--     checked_in_method = 'scan'
-- WHERE name LIKE 'Dummy Guest %' AND substring(name from 13)::int <= 250;

-- ------------------------------------------------------------------------------
-- Optional: Simulate claims for some checked-in guests
-- ------------------------------------------------------------------------------
-- INSERT INTO public.claims (guest_id, station, method)
-- SELECT id, 'cocktail', 'scan'
-- FROM public.guests
-- WHERE name LIKE 'Dummy Guest %' AND substring(name from 13)::int <= 120
-- ON CONFLICT DO NOTHING;

-- ------------------------------------------------------------------------------
-- CLEANUP SCRIPT (Run after completing load and UI performance tests)
-- ------------------------------------------------------------------------------
-- DELETE FROM public.claims WHERE guest_id IN (SELECT id FROM public.guests WHERE name LIKE 'Dummy Guest %');
-- DELETE FROM public.winners WHERE guest_id IN (SELECT id FROM public.guests WHERE name LIKE 'Dummy Guest %');
-- DELETE FROM public.guests WHERE name LIKE 'Dummy Guest %';

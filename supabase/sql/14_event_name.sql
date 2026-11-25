-- Rename the event to "Safelinx Christmas Party".
-- Safe to run whether or not 02_tables.sql was already applied.
update public.settings
set event_name = 'Safelinx Christmas Party',
    updated_at = now()
where id = 1;

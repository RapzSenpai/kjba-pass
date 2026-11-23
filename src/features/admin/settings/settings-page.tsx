import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/common/checkbox'
import { formatDateTime } from '@/lib/format'
import { supabase } from '@/lib/supabase'
import type { SettingsRow } from '@/types/db'

// Stored timestamps are timestamptz; these inputs read and write Manila wall time.
function toManilaInput(value: string | null): string {
  if (!value) return ''
  return new Date(new Date(value).getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 16)
}

function fromManilaInput(value: string): string | null {
  return value ? `${value}:00+08:00` : null
}

function isPast(value: string): boolean {
  return value !== '' && new Date(`${value}:00+08:00`).getTime() < Date.now()
}

function FieldWarning({ show }: { show: boolean }) {
  if (!show) return null

  return <p className="text-xs text-[var(--action-text)]">This time is already in the past.</p>
}

function SettingsForm({ row }: { row: SettingsRow }) {
  const queryClient = useQueryClient()
  const [eventName, setEventName] = useState(row.event_name)
  const [eventDate, setEventDate] = useState(row.event_date)
  const [venue, setVenue] = useState(row.venue)
  const [notice, setNotice] = useState(row.notice_text)
  const [registrationOpen, setRegistrationOpen] = useState(row.registration_open)
  const [registrationClosesAt, setRegistrationClosesAt] = useState(
    toManilaInput(row.registration_closes_at),
  )
  const [checkinOpen, setCheckinOpen] = useState(row.checkin_open)
  const [checkinClosesAt, setCheckinClosesAt] = useState(toManilaInput(row.checkin_closes_at))
  const [cocktailEnabled, setCocktailEnabled] = useState(row.cocktail_enabled)
  const [bundleEnabled, setBundleEnabled] = useState(row.bundle_enabled)
  const [saving, setSaving] = useState(false)

  const canSave = eventName.trim() !== '' && eventDate !== '' && venue.trim() !== ''

  async function save() {
    if (!canSave) return

    setSaving(true)

    try {
      const { data, error } = await supabase
        .from('settings')
        .update({
          event_name: eventName.trim(),
          event_date: eventDate,
          venue: venue.trim(),
          notice_text: notice.trim(),
          registration_open: registrationOpen,
          registration_closes_at: fromManilaInput(registrationClosesAt),
          checkin_open: checkinOpen,
          checkin_closes_at: fromManilaInput(checkinClosesAt),
          cocktail_enabled: cocktailEnabled,
          bundle_enabled: bundleEnabled,
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1)
        .select('id')

      if (error || !data || data.length === 0) {
        toast.error('Could not save settings. Check the network and try again.')
        return
      }

      toast.success('Settings saved.')
      const { error: logError } = await supabase.rpc('log_admin_action', {
        p_action: 'update_settings',
        p_details: {
          registration_open: registrationOpen,
          registration_closes_at: fromManilaInput(registrationClosesAt),
          checkin_open: checkinOpen,
          checkin_closes_at: fromManilaInput(checkinClosesAt),
          cocktail_enabled: cocktailEnabled,
          bundle_enabled: bundleEnabled,
        },
      })
      if (logError) toast.warning('Settings saved, but the audit log could not be written.')
      void queryClient.invalidateQueries({ queryKey: ['settings'] })
      void queryClient.invalidateQueries({ queryKey: ['public-settings'] })
    } catch {
      toast.error('Could not save settings. Check the network and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Settings</h1>
        <span className="text-xs text-muted-foreground">
          Last saved {formatDateTime(row.updated_at)} · times are Asia/Manila
        </span>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Event</h2>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Event name
          <input
            value={eventName}
            onChange={(event) => setEventName(event.target.value)}
            required
            maxLength={120}
            className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Event date
            <input
              type="date"
              value={eventDate}
              onChange={(event) => setEventDate(event.target.value)}
              required
              className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Venue
            <input
              value={venue}
              onChange={(event) => setVenue(event.target.value)}
              required
              maxLength={160}
              className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Notice text
          <textarea
            value={notice}
            onChange={(event) => setNotice(event.target.value)}
            rows={3}
            maxLength={500}
            className="rounded-lg border border-input bg-background px-3 py-2 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
        </label>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Registration</h2>

        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox
            checked={registrationOpen}
            onCheckedChange={setRegistrationOpen}
          />
          Registration open
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Closes at (optional)
          <input
            type="datetime-local"
            value={registrationClosesAt}
            onChange={(event) => setRegistrationClosesAt(event.target.value)}
            className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <FieldWarning show={isPast(registrationClosesAt)} />
        </label>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Check-in</h2>

        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={checkinOpen} onCheckedChange={setCheckinOpen} />
          Check-in open
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Closes at (optional)
          <input
            type="datetime-local"
            value={checkinClosesAt}
            onChange={(event) => setCheckinClosesAt(event.target.value)}
            className="h-11 rounded-lg border border-input bg-background px-3 text-base font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <FieldWarning show={isPast(checkinClosesAt)} />
        </label>
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4">
        <h2 className="text-lg font-semibold">Stations</h2>

        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={cocktailEnabled} onCheckedChange={setCocktailEnabled} />
          Cocktail enabled
        </label>

        <label className="flex items-center gap-2 text-sm font-medium">
          <Checkbox checked={bundleEnabled} onCheckedChange={setBundleEnabled} />
          Bundle of Joy enabled
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button
          type="button"
          className="h-11 px-4 text-base"
          disabled={saving || !canSave}
          onClick={() => void save()}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
        {!canSave ? (
          <span className="text-sm text-muted-foreground">Event name, date, and venue are required.</span>
        ) : null}
      </div>
    </section>
  )
}

export function SettingsPage() {
  const settings = useQuery({
    queryKey: ['settings'],
    queryFn: async (): Promise<SettingsRow> => {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single()

      if (error) throw error
      return data as SettingsRow
    },
  })

  if (settings.isPending) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>
  }

  if (!settings.data) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p className="text-sm text-muted-foreground">Could not load settings.</p>
        <Button
          type="button"
          variant="outline"
          className="h-11 px-4 text-base"
          onClick={() => void settings.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  }

  return <SettingsForm key={settings.data.updated_at} row={settings.data} />
}

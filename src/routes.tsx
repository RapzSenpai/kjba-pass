import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { Logo } from '@/components/common/logo'
import { AdminLayout } from '@/components/layout/admin-layout'
import { GuestLayout } from '@/components/layout/guest-layout'
import { StaffLayout } from '@/components/layout/staff-layout'
import { RequireRole } from '@/features/auth/require-role'
import { PassPage } from '@/features/pass/pass-page'
import { RegisterPage } from '@/features/register/register-page'

const LoginPage = lazy(() => import('@/features/auth/login-page').then((m) => ({ default: m.LoginPage })))
const ScannerPage = lazy(() => import('@/features/scanner/scanner-page').then((m) => ({ default: m.ScannerPage })))
const DashboardPage = lazy(() => import('@/features/admin/dashboard/dashboard-page').then((m) => ({ default: m.DashboardPage })))
const GuestsPage = lazy(() => import('@/features/admin/guests/guests-page').then((m) => ({ default: m.GuestsPage })))
const StaffPage = lazy(() => import('@/features/admin/staff/staff-page').then((m) => ({ default: m.StaffPage })))
const RafflePage = lazy(() => import('@/features/admin/raffle/raffle-page').then((m) => ({ default: m.RafflePage })))
const LogsPage = lazy(() => import('@/features/admin/logs/logs-page').then((m) => ({ default: m.LogsPage })))
const SettingsPage = lazy(() => import('@/features/admin/settings/settings-page').then((m) => ({ default: m.SettingsPage })))

function PageFallback() {
  return (
    <div className="flex min-h-48 items-center justify-center p-6 text-sm text-muted-foreground">
      Loading...
    </div>
  )
}

function NotFoundPage() {
  return (
    <main className="mx-auto flex min-h-svh w-full max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <Logo />
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="text-sm text-muted-foreground">That link does not exist.</p>
      <Link
        to="/register"
        className="inline-flex h-11 items-center rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground"
      >
        Go to registration
      </Link>
    </main>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/register" replace />} />

      <Route element={<GuestLayout />}>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/g/:token" element={<PassPage />} />
      </Route>

      <Route
        path="/login"
        element={
          <Suspense fallback={<PageFallback />}>
            <LoginPage />
          </Suspense>
        }
      />

      <Route element={<RequireRole allowed={['staff', 'admin']} />}>
        <Route element={<StaffLayout />}>
          <Route
            path="/scan"
            element={
              <Suspense fallback={<PageFallback />}>
                <ScannerPage />
              </Suspense>
            }
          />
        </Route>
      </Route>

      <Route element={<RequireRole allowed={['admin']} />}>
        <Route element={<AdminLayout />}>
          <Route
            path="/admin"
            element={
              <Suspense fallback={<PageFallback />}>
                <DashboardPage />
              </Suspense>
            }
          />
          <Route
            path="/admin/guests"
            element={
              <Suspense fallback={<PageFallback />}>
                <GuestsPage />
              </Suspense>
            }
          />
          <Route
            path="/admin/staff"
            element={
              <Suspense fallback={<PageFallback />}>
                <StaffPage />
              </Suspense>
            }
          />
          <Route
            path="/admin/raffle"
            element={
              <Suspense fallback={<PageFallback />}>
                <RafflePage />
              </Suspense>
            }
          />
          <Route
            path="/admin/logs"
            element={
              <Suspense fallback={<PageFallback />}>
                <LogsPage />
              </Suspense>
            }
          />
          <Route
            path="/admin/settings"
            element={
              <Suspense fallback={<PageFallback />}>
                <SettingsPage />
              </Suspense>
            }
          />
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

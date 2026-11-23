import { lazy, Suspense } from 'react'
import { Link, Navigate, Route, Routes } from 'react-router-dom'
import { Logo } from '@/components/common/logo'
import { GuestLayout } from '@/components/layout/guest-layout'

const LoginPage = lazy(() => import('@/features/auth/login-page').then((m) => ({ default: m.LoginPage })))
const RequireRole = lazy(() => import('@/features/auth/require-role').then((m) => ({ default: m.RequireRole })))
const RegisterPage = lazy(() => import('@/features/register/register-page').then((m) => ({ default: m.RegisterPage })))
const PassPage = lazy(() => import('@/features/pass/pass-page').then((m) => ({ default: m.PassPage })))
const ScannerPage = lazy(() => import('@/features/scanner/scanner-page').then((m) => ({ default: m.ScannerPage })))
const StaffLayout = lazy(() => import('@/components/layout/staff-layout').then((m) => ({ default: m.StaffLayout })))
const AdminLayout = lazy(() => import('@/components/layout/admin-layout').then((m) => ({ default: m.AdminLayout })))
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
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/" element={<Navigate to="/register" replace />} />

        <Route element={<GuestLayout />}>
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/g/:token" element={<PassPage />} />
        </Route>

        <Route path="/login" element={<LoginPage />} />

        <Route element={<RequireRole allowed={['staff', 'admin']} />}>
          <Route element={<StaffLayout />}>
            <Route path="/scan" element={<ScannerPage />} />
          </Route>
        </Route>

        <Route element={<RequireRole allowed={['admin']} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<DashboardPage />} />
            <Route path="/admin/guests" element={<GuestsPage />} />
            <Route path="/admin/staff" element={<StaffPage />} />
            <Route path="/admin/raffle" element={<RafflePage />} />
            <Route path="/admin/logs" element={<LogsPage />} />
            <Route path="/admin/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </Suspense>
  )
}

import { Toaster } from 'sonner'
import { AppRoutes } from './routes'

export default function App() {
  return (
    <>
      <AppRoutes />
      <Toaster theme="light" position="top-center" richColors closeButton />
    </>
  )
}

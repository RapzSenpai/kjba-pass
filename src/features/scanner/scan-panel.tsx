import { useEffect, useRef, useState } from 'react'
import { Flashlight, FlashlightOff } from 'lucide-react'
import QrScanner from 'qr-scanner'
import { Button } from '@/components/ui/button'

export function ScanPanel({ onScan }: { onScan: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const scannerRef = useRef<QrScanner | null>(null)
  const onScanRef = useRef(onScan)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [torchAvailable, setTorchAvailable] = useState(false)
  const [torchOn, setTorchOn] = useState(false)

  useEffect(() => {
    onScanRef.current = onScan
  }, [onScan])

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    const scanner = new QrScanner(video, (result) => onScanRef.current(result.data), {
      preferredCamera: 'environment',
      highlightScanRegion: true,
      highlightCodeOutline: true,
      maxScansPerSecond: 10,
      onDecodeError: () => {},
    })
    scannerRef.current = scanner

    scanner
      .start()
      .then(async () => {
        const hasFlash = await scanner.hasFlash().catch(() => false)
        if (!cancelled) setTorchAvailable(hasFlash)
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError('Camera could not start. Use Enter Code or Find Guest instead.')
        }
      })

    return () => {
      cancelled = true
      scannerRef.current = null
      scanner.destroy()
    }
  }, [])

  async function toggleTorch() {
    const scanner = scannerRef.current
    if (!scanner) return

    try {
      await scanner.toggleFlash()
      setTorchOn(scanner.isFlashOn())
    } catch {
      setTorchAvailable(false)
      setTorchOn(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-black">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
        {torchAvailable ? (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            className="absolute end-3 top-3 size-11"
            onClick={toggleTorch}
            aria-label={torchOn ? 'Turn torch off' : 'Turn torch on'}
          >
            {torchOn ? (
              <FlashlightOff className="size-5" aria-hidden />
            ) : (
              <Flashlight className="size-5" aria-hidden />
            )}
          </Button>
        ) : null}
      </div>

      {cameraError ? (
        <p role="alert" className="rounded-lg bg-[var(--stop-soft)] px-3 py-2 text-sm text-[var(--stop-text)]">
          {cameraError}
        </p>
      ) : (
        <p className="text-center text-sm text-muted-foreground">Point the camera at the guest QR code.</p>
      )}
    </div>
  )
}

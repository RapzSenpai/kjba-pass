type Cell = string | number | boolean | null | undefined

function escapeCell(value: Cell): string {
  const text = value == null ? '' : String(value)
  const guarded = /^[=+\-@]/.test(text) ? `'${text}` : text
  return `"${guarded.replace(/"/g, '""')}"`
}

export function downloadCsv(filename: string, rows: Cell[][]) {
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))

  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

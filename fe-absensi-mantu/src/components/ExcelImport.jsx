import { Download, FileSpreadsheet, Upload } from 'lucide-react'
import { useEffect, useState } from 'react'
import { readSheet } from 'read-excel-file/browser'
import writeExcelFile from 'write-excel-file/browser'
import { Modal } from './ui'

function normalize(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
}

function display(value) {
  if (value instanceof Date) return value.toLocaleDateString('en-CA')
  return value === null || value === undefined || value === '' ? '–' : String(value)
}

export default function ExcelImport({ open, title, fileName, columns, onClose, onImport }) {
  const [file, setFile] = useState(null)
  const [rows, setRows] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setFile(null)
      setRows([])
      setError('')
      setBusy(false)
    }
  }, [open])

  async function downloadTemplate() {
    setError('')
    try {
      const header = columns.map((column) => ({
        value: `${column.label}${column.required ? ' *' : ''}`,
        fontWeight: 'bold',
        color: '#FFFFFF',
        backgroundColor: '#0F766E',
      }))
      const example = columns.map((column) => ({ value: column.example ?? null }))
      await writeExcelFile([header, example], {
        columns: columns.map((column) => ({ width: column.width || 22 })),
      }).toFile(fileName)
    } catch (downloadError) {
      setError(`Template tidak dapat dibuat: ${downloadError.message}`)
    }
  }

  async function chooseFile(event) {
    const selected = event.target.files?.[0]
    setFile(selected || null)
    setRows([])
    setError('')
    if (!selected) return
    if (!selected.name.toLowerCase().endsWith('.xlsx')) {
      setError('Gunakan file Excel berformat .xlsx.')
      return
    }

    setBusy(true)
    try {
      const sheetRows = await readSheet(selected)
      if (sheetRows.length < 2) throw new Error('File tidak memiliki baris data.')
      const headers = sheetRows[0].map(normalize)
      const indexes = columns.map((column) => {
        const accepted = [column.label, ...(column.aliases || [])].map((item) => normalize(item).replace(/ \*$/, ''))
        return headers.findIndex((header) => accepted.includes(header.replace(/ \*$/, '')))
      })
      const missing = columns.filter((column, index) => column.required && indexes[index] < 0)
      if (missing.length) throw new Error(`Kolom wajib tidak ditemukan: ${missing.map((column) => column.label).join(', ')}.`)

      const parsed = sheetRows.slice(1)
        .filter((sheetRow) => sheetRow.some((cell) => cell !== null && String(cell).trim() !== ''))
        .map((sheetRow, rowIndex) => {
          const object = Object.fromEntries(columns.map((column, index) => [column.key, indexes[index] < 0 ? null : sheetRow[indexes[index]]]))
          const missingValues = columns.filter((column) => column.required && (object[column.key] === null || String(object[column.key]).trim() === ''))
          if (missingValues.length) throw new Error(`Baris ${rowIndex + 2}: ${missingValues.map((column) => column.label).join(', ')} wajib diisi.`)
          return object
        })
      if (!parsed.length) throw new Error('Tidak ada baris data yang dapat diimpor.')
      setRows(parsed)
    } catch (parseError) {
      setError(`File tidak valid: ${parseError.message}`)
    } finally {
      setBusy(false)
    }
  }

  async function submit() {
    setBusy(true)
    setError('')
    try {
      await onImport(rows)
      onClose()
    } catch (importError) {
      setError(importError.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} title={`Import ${title}`} description="Gunakan template agar nama dan urutan kolom sesuai." size="lg" onClose={onClose}>
      <div className="modal-body excel-import-body">
        <div className="excel-guide">
          <span><FileSpreadsheet /></span>
          <div><strong>Template Excel siap digunakan</strong><p>Kolom bertanda * wajib diisi. Satu baris mewakili satu data.</p></div>
          <button className="button secondary" type="button" onClick={downloadTemplate}><Download size={17} /> Unduh template XLSX</button>
        </div>
        <label className="excel-file-input">
          <Upload size={22} />
          <strong>{file?.name || 'Pilih file Excel'}</strong>
          <span>Maksimal satu file .xlsx</span>
          <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={chooseFile} />
        </label>
        {error && <div className="form-error excel-error">{error}</div>}
        {busy && !rows.length && <p className="excel-reading">Membaca dan memvalidasi file...</p>}
        {!!rows.length && (
          <div className="excel-preview">
            <div><strong>Pratinjau data</strong><span>{rows.length} baris siap diimpor</span></div>
            <div className="table-wrap"><table><thead><tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr></thead><tbody>{rows.slice(0, 5).map((row, index) => <tr key={index}>{columns.map((column) => <td key={column.key}>{display(row[column.key])}</td>)}</tr>)}</tbody></table></div>
            {rows.length > 5 && <small>Menampilkan 5 dari {rows.length} baris.</small>}
          </div>
        )}
      </div>
      <div className="modal-footer">
        <button className="button secondary" type="button" onClick={onClose}>Batal</button>
        <button className="button primary" type="button" disabled={!rows.length || busy} onClick={submit}><Upload size={17} /> {busy ? 'Mengimpor...' : `Import ${rows.length || ''} data`}</button>
      </div>
    </Modal>
  )
}

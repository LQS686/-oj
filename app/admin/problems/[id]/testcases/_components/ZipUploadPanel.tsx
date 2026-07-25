'use client'

import { useRef, useState, type DragEvent } from 'react'
import { Upload, Loader2 } from 'lucide-react'

interface ZipUploadPanelProps {
  uploading: boolean
  result: { success: boolean; message: string; count?: number } | null
  onUpload: (file: File) => void | Promise<void>
}

export function ZipUploadPanel({ uploading, result, onUpload }: ZipUploadPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleFiles = (files: FileList | null) => {
    const file = files?.[0]
    if (file) void onUpload(file)
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    handleFiles(e.dataTransfer.files)
  }

  return (
    <section className="card p-4">
      <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Upload className="w-4 h-4 text-primary" />
        批量上传
      </h3>
      <div
        className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors cursor-pointer ${
          dragOver
            ? 'border-primary bg-primary/5'
            : 'border-border hover:bg-muted/60'
        }`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click()
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip,application/zip"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
          className="hidden"
        />
        <div className="flex flex-col items-center gap-1.5">
          {uploading ? (
            <Loader2 className="w-7 h-7 animate-spin text-primary" />
          ) : (
            <Upload className="w-7 h-7 text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-foreground">
            {uploading ? '正在解析压缩包…' : '点击或拖拽上传 ZIP'}
          </span>
          <span className="text-xs text-muted-foreground">
            支持 1.in/1.out 或 1.input/1.output，最多 50 对，≤50MB
          </span>
        </div>
      </div>
      {result && (
        <div
          className={`mt-3 text-sm px-3 py-2 rounded-lg border ${
            result.success
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-error/10 border-error/30 text-error'
          }`}
        >
          {result.message}
          {result.count !== undefined && `（共 ${result.count} 个）`}
        </div>
      )}
    </section>
  )
}

'use client'

import React, { ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'

interface FormFieldProps {
  label: string
  name: string
  type?: string
  placeholder?: string
  value: string | number | boolean
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  error?: string
  required?: boolean
  className?: string
  disabled?: boolean
  children?: ReactNode
}

export function FormField({
  label,
  name,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  required = false,
  className = '',
  disabled = false,
  children
}: FormFieldProps) {
  return (
    <div className={`mb-4 ${className}`}>
      <label 
        htmlFor={name} 
        className="block text-sm font-medium text-slate-300 mb-2"
        aria-required={required}
      >
        {label} {required && <span className="text-red-400" aria-hidden="true">*</span>}
      </label>
      {children ? (
        React.cloneElement(children as React.ReactElement<Record<string, unknown>>, { 
          id: name, 
          'aria-required': required, 
          'aria-disabled': disabled, 
          'aria-invalid': !!error 
        })
      ) : (
        <input
          id={name}
          type={type}
          name={name}
          placeholder={placeholder}
          value={value as string}
          onChange={onChange}
          disabled={disabled}
          required={required}
          aria-invalid={!!error}
          aria-describedby={error ? `${name}-error` : undefined}
          className={`input ${error ? 'border-red-500 focus:ring-red-500/50' : ''} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        />
      )}
      {error && (
        <p 
          id={`${name}-error`}
          className="mt-2 text-sm text-red-400 flex items-center gap-1"
          role="alert"
          aria-live="assertive"
        >
          <AlertCircle className="w-4 h-4" aria-hidden="true" />
          {error}
        </p>
      )}
    </div>
  )
}

interface FormProps {
  onSubmit: (e: React.FormEvent) => void
  children: ReactNode
  loading?: boolean
  className?: string
}

export function Form({
  onSubmit,
  children,
  loading = false,
  className = ''
}: FormProps) {
  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
    </form>
  )
}

interface FormActionsProps {
  onCancel: () => void
  onSubmit: () => void
  loading?: boolean
  submitText?: string
  cancelText?: string
  className?: string
}

export function FormActions({
  onCancel,
  onSubmit,
  loading = false,
  submitText = '提交',
  cancelText = '取消',
  className = ''
}: FormActionsProps) {
  return (
    <div className={`flex gap-3 justify-end ${className}`}>
      <button
        type="button"
        onClick={onCancel}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onCancel();
          }
        }}
        className="btn btn-ghost"
        disabled={loading}
        aria-label={cancelText}
      >
        {cancelText}
      </button>
      <button
        type="submit"
        onClick={onSubmit}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onSubmit();
          }
        }}
        className="btn btn-primary"
        disabled={loading}
        aria-label={submitText}
        aria-busy={loading}
      >
        {loading ? (
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" aria-hidden="true"></div>
            <span>处理中...</span>
          </div>
        ) : (
          submitText
        )}
      </button>
    </div>
  )
}

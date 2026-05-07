export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') {
    return ''
  }
  const htmlEntities: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  }
  return str.replace(/[&<>"'`=/]/g, char => htmlEntities[char] || char)
}

export function stripTags(str: string): string {
  if (!str || typeof str !== 'string') {
    return ''
  }
  return str.replace(/<[^>]*>/g, '')
}

export function trimAll(obj: Record<string, unknown>): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') {
    return {}
  }

  const result: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      result[key] = value.trim()
    } else if (Array.isArray(value)) {
      result[key] = value.map(item => {
        if (typeof item === 'string') {
          return item.trim()
        }
        if (item && typeof item === 'object') {
          return trimAll(item as Record<string, unknown>)
        }
        return item
      })
    } else if (value && typeof value === 'object') {
      result[key] = trimAll(value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }

  return result
}

export function sanitizeObject(obj: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  if (!obj || typeof obj !== 'object') {
    return {}
  }

  const result: Record<string, unknown> = { ...obj }

  for (const field of fields) {
    if (typeof result[field] === 'string') {
      result[field] = escapeHtml(result[field] as string)
    }
  }

  return result
}

export function removeNullBytes(str: string): string {
  if (!str || typeof str !== 'string') {
    return ''
  }
  return str.replace(/\x00/g, '')
}

export function normalizeWhitespace(str: string): string {
  if (!str || typeof str !== 'string') {
    return ''
  }
  return str.replace(/\s+/g, ' ').trim()
}

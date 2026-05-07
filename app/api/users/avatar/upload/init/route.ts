import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { randomUUID } from 'crypto'
import { cleanOldTempFiles } from '@/lib/upload'

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    
    // Probabilistic cleanup (1% chance)
    if (Math.random() < 0.01) {
      cleanOldTempFiles().catch(console.error)
    }

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { filename, fileSize } = body

    // Validation
    if (!filename || !fileSize) {
      return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 })
    }

    if (fileSize > 5 * 1024 * 1024) {
       return NextResponse.json({ success: false, error: 'File too large (Max 5MB)' }, { status: 400 })
    }

    const uploadId = randomUUID()
    
    return NextResponse.json({
      success: true,
      data: {
        uploadId,
        chunkSize: 1024 * 1024 // 1MB chunks recommended
      }
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Server error' }, { status: 500 })
  }
}

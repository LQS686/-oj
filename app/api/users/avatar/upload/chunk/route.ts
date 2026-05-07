import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { saveChunk } from '@/lib/upload'

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const formData = await request.formData()
    const uploadId = formData.get('uploadId') as string
    const chunkIndex = parseInt(formData.get('chunkIndex') as string)
    const file = formData.get('file') as File

    if (!uploadId || isNaN(chunkIndex) || !file) {
      return NextResponse.json({ success: false, error: 'Invalid params' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    await saveChunk(uploadId, chunkIndex, buffer)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Chunk upload error:', error)
    return NextResponse.json({ success: false, error: 'Chunk upload failed' }, { status: 500 })
  }
}

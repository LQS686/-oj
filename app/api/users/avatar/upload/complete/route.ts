import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { mergeChunks } from '@/lib/upload'
import clientPromise from '@/lib/mongodb'
import { ObjectId } from 'mongodb'

export async function POST(request: NextRequest) {
  try {
    const user = getUserFromRequest(request)
    if (!user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })

    const { uploadId, filename, totalChunks } = await request.json()

    if (!uploadId || !filename || !totalChunks) {
      return NextResponse.json({ success: false, error: 'Invalid params' }, { status: 400 })
    }

    // Merge and process
    const result = await mergeChunks(uploadId, totalChunks, user.userId, filename)

    // Update DB using native MongoDB driver to avoid Prisma transaction requirement on standalone
    const client = await clientPromise
    const db = client.db() // Uses the db name from connection string
    
    // 1. Update User Avatar
    await db.collection('User').updateOne(
      { _id: new ObjectId(user.userId) },
      { 
        $set: { 
          avatar: result.url,
          updatedAt: new Date()
        } 
      }
    )

    // 2. Create History Record
    try {
      await db.collection('AvatarHistory').insertOne({
        userId: new ObjectId(user.userId),
        url: result.url,
        filename: filename,
        size: result.size,
        createdAt: new Date()
      })
    } catch (historyError) {
      console.error('Failed to save avatar history:', historyError)
      // Non-blocking error
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        avatar: result.url 
      } 
    })
  } catch (error) {
    console.error('Merge error:', error)
    return NextResponse.json({ success: false, error: 'Merge failed' }, { status: 500 })
  }
}

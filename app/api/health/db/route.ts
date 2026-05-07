import { NextResponse } from 'next/server'
import { getMongoClient } from '@/lib/mongodb-direct'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const start = Date.now()
    const client = await getMongoClient()
    const db = client.db()
    
    // 执行一个轻量级命令来检查连接
    const pingStart = Date.now()
    await db.command({ ping: 1 })
    const pingTime = Date.now() - pingStart

    // 获取副本集状态
    let replicaStatus = 'Unknown'
    let members = []
    let primary = null
    
    try {
      const adminDb = client.db('admin')
      const status = await adminDb.command({ replSetGetStatus: 1 })
      
      if (status.ok) {
        replicaStatus = 'Healthy'
        members = status.members.map((m: any) => ({
          name: m.name,
          state: m.stateStr,
          health: m.health,
          uptime: m.uptime
        }))
        
        const primaryNode = members.find((m: any) => m.state === 'PRIMARY')
        primary = primaryNode ? primaryNode.name : 'None'
      }
    } catch (e: any) {
      replicaStatus = 'Error: ' + e.message
    }

    return NextResponse.json({
      status: 'up',
      latency: pingTime,
      database: {
        type: 'mongodb',
        replicaSet: {
          status: replicaStatus,
          primary: primary,
          members: members.length
        }
      },
      timestamp: new Date().toISOString(),
      uptime: process.uptime()
    })
  } catch (error: any) {
    console.error('Health check failed:', error)
    return NextResponse.json(
      { 
        status: 'down', 
        error: error.message,
        timestamp: new Date().toISOString()
      },
      { status: 503 }
    )
  }
}

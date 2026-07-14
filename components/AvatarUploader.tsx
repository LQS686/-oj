'use client'

import { useState, useRef, useEffect } from 'react'
import { Camera, Upload, X, Check, AlertCircle, History, Trash2, Loader2 } from 'lucide-react'
import Image from 'next/image'
import { useUser } from '@/contexts/UserContext'
import { fetchWithCookie } from '@/lib/api/base'

interface UploadHistory {
 id: string
 url: string
 filename: string
 size: number
 createdAt: string
}

export default function AvatarUploader({ 
 currentAvatar, 
 onAvatarUpdate 
}: { 
 currentAvatar?: string | null
 onAvatarUpdate: (url: string) => void
}) {
 const [file, setFile] = useState<File | null>(null)
 const [preview, setPreview] = useState<string | null>(null)
 const [uploading, setUploading] = useState(false)
 const [progress, setProgress] = useState(0)
 const [error, setError] = useState<string | null>(null)
 const [history, setHistory] = useState<UploadHistory[]>([])
 const [showHistory, setShowHistory] = useState(false)
 
 const fileInputRef = useRef<HTMLInputElement>(null)
 const CHUNK_SIZE = 1024 * 1024 // 1MB

 useEffect(() => {
 fetchHistory()
 }, [])

 const fetchHistory = async () => {
 try {
 const res = await fetchWithCookie('/api/users/avatar/history')
 const data = await res.json()
 if (data.success) {
 setHistory(data.data)
 }
 } catch (err) {
 console.error('Failed to fetch history', err)
 }
 }

 const compressImage = (file: File): Promise<File> => {
 return new Promise((resolve) => {
 const canvas = document.createElement('canvas')
 const ctx = canvas.getContext('2d')
 const img = new window.Image()

 img.onload = () => {
 // 计算压缩后的尺寸，保持宽高比
 const maxWidth = 800
 const maxHeight = 800
 let width = img.width
 let height = img.height

 if (width > maxWidth) {
 height = (height * maxWidth) / width
 width = maxWidth
 }

 if (height > maxHeight) {
 width = (width * maxHeight) / height
 height = maxHeight
 }

 canvas.width = width
 canvas.height = height

 // 绘制压缩后的图片
 ctx?.drawImage(img, 0, 0, width, height)

 // 将canvas转换为blob
 canvas.toBlob(
 (blob) => {
 if (blob) {
 const compressedFile = new File([blob], file.name, {
 type: file.type,
 lastModified: Date.now()
 })
 resolve(compressedFile)
 } else {
 resolve(file)
 }
 },
 file.type,
 0.7 // 压缩质量
 )
 }

 img.src = URL.createObjectURL(file)
 })
 }

 const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
 const selectedFile = e.target.files?.[0]
 if (!selectedFile) return

 // Validation
 const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
 if (!validTypes.includes(selectedFile.type)) {
 setError('只支持 JPG, PNG, GIF, WebP 格式')
 return
 }

 if (selectedFile.size > 5 * 1024 * 1024) {
 setError('文件大小不能超过 5MB')
 return
 }

 setError(null)

 // 压缩图片
 const compressedFile = await compressImage(selectedFile)
 setFile(compressedFile)

 // Preview
 const reader = new FileReader()
 reader.onloadend = () => setPreview(reader.result as string)
 reader.readAsDataURL(compressedFile)
 }

 const uploadChunks = async (uploadId: string, file: File) => {
 const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
 
 for (let i = 0; i < totalChunks; i++) {
 const start = i * CHUNK_SIZE
 const end = Math.min(start + CHUNK_SIZE, file.size)
 const chunk = file.slice(start, end)
 
 const formData = new FormData()
 formData.append('uploadId', uploadId)
 formData.append('chunkIndex', i.toString())
 formData.append('file', chunk)

  const res = await fetchWithCookie('/api/users/avatar/upload/chunk', {
 method: 'POST',
 body: formData
 })
 
 if (!res.ok) throw new Error(`Chunk ${i} failed`)
 
 // Update progress
 const percent = Math.round(((i + 1) / totalChunks) * 90) // 90% for upload, 10% for merge
 setProgress(percent)
 }
 }

 const handleUpload = async () => {
 if (!file) return

 setUploading(true)
 setProgress(0)
 setError(null)

 try {
 // 1. Init
  const initRes = await fetchWithCookie('/api/users/avatar/upload/init', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 filename: file.name,
 fileSize: file.size
 })
 })
 
 const initData = await initRes.json()
 if (!initData.success) throw new Error(initData.error)
 
 const { uploadId } = initData.data

 // 2. Upload Chunks
 await uploadChunks(uploadId, file)

 // 3. Complete
  const completeRes = await fetchWithCookie('/api/users/avatar/upload/complete', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({
 uploadId,
 filename: file.name,
 totalChunks: Math.ceil(file.size / CHUNK_SIZE)
 })
 })

 const completeData = await completeRes.json()
 if (!completeData.success) throw new Error(completeData.error)

 setProgress(100)
 onAvatarUpdate(completeData.data.avatar)
 setFile(null)
 setPreview(null)
 fetchHistory() // Refresh history
 
 } catch (err: any) {
 setError(err.message || '上传失败')
 setProgress(0)
 } finally {
 setUploading(false)
 }
 }

 const handleHistorySelect = async (historyItem: UploadHistory) => {
 // Ideally we should have an API to "restore" old avatar, 
 // but for now we just update user to use this URL.
 // However, backend update is needed.
 // I'll assume passing the URL to onAvatarUpdate is enough for frontend, 
 // but backend state needs sync.
 // Let's call a simple update profile API or similar if we had one for just URL.
 // Or just re-upload? No, that's wasteful.
 // We can call the profile update API.
 
 try {
  const res = await fetchWithCookie('/api/users/profile', {
 method: 'PUT',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ avatar: historyItem.url }) // Assuming this API supports avatar update
 })
 if (res.ok) {
 onAvatarUpdate(historyItem.url)
 }
 } catch (e) {
 console.error(e)
 }
 }

 return (
 <div className="w-full">
 <div className="flex flex-col md:flex-row gap-6 items-start">
 {/* Preview Area */}
 <div className="relative group">
 <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-gray-100 shadow-md bg-gray-50 flex items-center justify-center" role="img" aria-label={currentAvatar ? "当前头像" : "无头像"}>
 {preview ? (
 <Image src={preview} alt="预览头像" width={128} height={128} className="object-cover w-full h-full" />
 ) : currentAvatar ? (
 <Image src={currentAvatar} alt="当前头像" width={128} height={128} className="object-cover w-full h-full" loading="lazy" />
 ) : (
 <div className="text-gray-300" aria-hidden="true">
 <Camera size={48} />
 </div>
 )}
 </div>
 
 <button
 onClick={() => fileInputRef.current?.click()}
 onKeyDown={(e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 fileInputRef.current?.click();
 }
 }}
 className="absolute bottom-0 right-0 bg-blue-600 text-white p-2.5 rounded-full hover:bg-blue-700 shadow-lg transition-transform active:scale-95 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
 title="选择图片"
 aria-label="选择头像图片"
 >
 <Camera size={18} />
 </button>
 
 <input
 ref={fileInputRef}
 type="file"
 accept="image/*"
 onChange={handleFileChange}
 className="hidden"
 />
 </div>

 {/* Controls */}
 <div className="flex-1 space-y-4 w-full">
 <div>
 <h3 className="text-lg font-medium text-gray-900">头像设置</h3>
 <p className="text-sm text-gray-500 mt-1">
 支持 JPG, PNG, GIF, WebP 格式，最大 5MB。
 </p>
 </div>

 {error && (
 <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-md">
 <AlertCircle size={16} />
 {error}
 </div>
 )}

 {file && (
 <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
 <div className="flex items-center justify-between mb-2">
 <span className="text-sm font-medium text-blue-900 truncate max-w-[200px]">{file.name}</span>
 <button 
 onClick={() => { setFile(null); setPreview(null); setError(null); }}
 className="text-blue-400 hover:text-blue-600"
 >
 <X size={16} />
 </button>
 </div>
 
 {uploading ? (
 <div className="space-y-1">
 <div className="flex justify-between text-xs text-blue-600">
 <span>上传中...</span>
 <span>{progress}%</span>
 </div>
 <div className="h-2 bg-blue-200 rounded-full overflow-hidden">
 <div 
 className="h-full bg-blue-600 transition-all duration-300"
 style={{ width: `${progress}%` }}
 />
 </div>
 </div>
 ) : (
 <button
 onClick={handleUpload}
 onKeyDown={(e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 handleUpload();
 }
 }}
 className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
 aria-label="确认上传头像"
 >
 <Upload size={16} />
 确认上传
 </button>
 )}
 </div>
 )}

 <div className="pt-2 border-t border-gray-100">
 <button
 onClick={() => setShowHistory(!showHistory)}
 onKeyDown={(e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 setShowHistory(!showHistory);
 }
 }}
 className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
 aria-expanded={showHistory}
 aria-label={showHistory ? '隐藏历史记录' : '查看上传历史'}
 >
 <History size={16} />
 {showHistory ? '隐藏历史记录' : '查看上传历史'}
 </button>
 </div>
 </div>
 </div>

 {/* History List */}
 {showHistory && (
 <div className="mt-6 animate-in fade-in slide-in-from-top-4 duration-300">
 <h4 className="text-sm font-medium text-gray-900 mb-3">历史头像</h4>
 <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-4">
 {history.map((item) => (
 <button 
 key={item.id} 
 className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 cursor-pointer hover:ring-2 hover:ring-blue-500 hover:border-transparent transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
 onClick={() => handleHistorySelect(item)}
 onKeyDown={(e) => {
 if (e.key === 'Enter' || e.key === ' ') {
 e.preventDefault();
 handleHistorySelect(item);
 }
 }}
 aria-label="选择历史头像"
 >
 <Image 
 src={item.url} 
 alt={`历史头像 ${item.filename}`} 
 fill 
 className="object-cover"
 loading="lazy"
 />
 <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" aria-hidden="true" />
 <div className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true">
 <div className="bg-white p-1 rounded-full shadow-sm text-blue-600">
 <Check size={12} />
 </div>
 </div>
 </button>
 ))}
 {history.length === 0 && (
 <div className="col-span-full text-center py-8 text-gray-400 text-sm bg-gray-50 rounded-lg border border-dashed border-gray-200">
 暂无历史记录
 </div>
 )}
 </div>
 </div>
 )}
 </div>
 )
}

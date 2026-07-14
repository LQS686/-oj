'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { Search, Command } from 'lucide-react'
import { useClickOutside } from '@/hooks/useClickOutside'
import { fetchWithCookie } from '@/lib/api/base'

interface SearchResult {
 problems: Array<{
 id: string
 problemNumber: string | null
 title: string
 difficulty: string
 totalAccepted: number
 totalSubmit: number
 }>
 users: Array<{
 id: string
 username: string
 nickname: string | null
 avatar: string | null
 rating: number
 }>
 contests: Array<{
 id: string
 title: string
 startTime: string
 }>
}

export default function SearchBar() {
 const [isSearchOpen, setIsSearchOpen] = useState(false)
 const [searchQuery, setSearchQuery] = useState('')
 const [searchResults, setSearchResults] = useState<SearchResult | null>(null)
 const [searchLoading, setSearchLoading] = useState(false)
 const searchRef = useRef<HTMLDivElement>(null)

 useClickOutside(searchRef, () => {
 if (isSearchOpen) setIsSearchOpen(false)
 })

 const handleSearch = useCallback(async (query: string) => {
 if (!query.trim()) {
 setSearchResults(null)
 return
 }

 setSearchLoading(true)
 try {
  const response = await fetchWithCookie(`/api/search?q=${encodeURIComponent(query)}&limit=10`)
 const data = await response.json()
 if (data.success) {
 setSearchResults(data.data)
 }
 } catch (error) {
 console.error('搜索失败:', error)
 } finally {
 setSearchLoading(false)
 }
 }, [])

 useEffect(() => {
 const timer = setTimeout(() => {
 handleSearch(searchQuery)
 }, 300)

 return () => clearTimeout(timer)
 }, [searchQuery, handleSearch])

 return (
 <div className="relative" ref={searchRef}>
 <button 
 onClick={() => setIsSearchOpen(!isSearchOpen)}
 className="btn-ghost btn p-2.5 group"
 aria-label="搜索"
 >
 <Search className="w-5 h-5 transition-transform duration-300 group-hover:rotate-12 group-hover:scale-110" />
 </button>
 
 {isSearchOpen && (
 <div className="dropdown-menu w-96 p-3">
 <div className="relative">
 <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
 <input
 type="text"
 placeholder="搜索题目、用户、竞赛..."
 className="input pl-10 py-2.5 text-sm focus:ring-2 focus:ring-primary/50"
 autoFocus
 value={searchQuery}
 onChange={(e) => setSearchQuery(e.target.value)}
 onKeyDown={(e) => {
 if (e.key === 'Escape') {
 setIsSearchOpen(false)
 setSearchQuery('')
 setSearchResults(null)
 }
 }}
 />
 </div>
 
 {searchLoading ? (
 <div className="mt-3 flex justify-center py-4">
 <div className="loading loading-spinner loading-sm text-primary"></div>
 </div>
 ) : searchResults ? (
 <div className="mt-3 space-y-4">
 {searchResults.problems && searchResults.problems.length > 0 && (
 <div>
 <h4 className="text-xs font-medium text-muted-foreground mb-2">题目</h4>
 <div className="space-y-1">
 {searchResults.problems.slice(0, 3).map((problem) => (
 <Link
 key={problem.id}
 href={`/problem/${problem.id}`}
 className="block p-2 rounded-lg hover:bg-primary/10 transition-colors duration-200"
 onClick={() => {
 setIsSearchOpen(false)
 setSearchQuery('')
 setSearchResults(null)
 }}
 >
 <div className="text-sm font-medium text-foreground">
 {problem.problemNumber ? `${problem.problemNumber} ` : ''}{problem.title}
 </div>
 <div className="flex items-center gap-2 mt-1">
 <span className={`text-xs px-2 py-0.5 rounded-full ${
 problem.difficulty === 'easy' ? 'bg-secondary/10 text-secondary-dark' :
 problem.difficulty === 'medium' ? 'bg-accent/10 text-accent-dark' :
 'bg-error/10 text-error'
 }`}>
 {problem.difficulty}
 </span>
 <span className="text-xs text-muted-foreground">
 {problem.totalAccepted}/{problem.totalSubmit}
 </span>
 </div>
 </Link>
 ))}
 </div>
 </div>
 )}
 
 {searchResults.users && searchResults.users.length > 0 && (
 <div>
 <h4 className="text-xs font-medium text-muted-foreground mb-2">用户</h4>
 <div className="space-y-1">
 {searchResults.users.slice(0, 3).map((user) => (
 <Link
 key={user.id}
 href={`/user/${user.id}`}
 className="flex items-center gap-2 p-2 rounded-lg hover:bg-primary/10 transition-colors duration-200"
 onClick={() => {
 setIsSearchOpen(false)
 setSearchQuery('')
 setSearchResults(null)
 }}
 >
 <div className="w-8 h-8 rounded-full overflow-hidden">
 {user.avatar ? (
 <img src={user.avatar} alt={user.username} className="w-full h-full object-cover" />
 ) : (
 <div className="w-full h-full bg-primary/20 flex items-center justify-center text-primary">
 {user.username.charAt(0).toUpperCase()}
 </div>
 )}
 </div>
 <div>
 <div className="text-sm font-medium text-foreground">
 {user.nickname || user.username}
 </div>
 <div className="text-xs text-muted-foreground">
 {user.rating} 分
 </div>
 </div>
 </Link>
 ))}
 </div>
 </div>
 )}
 
 {searchResults.contests && searchResults.contests.length > 0 && (
 <div>
 <h4 className="text-xs font-medium text-muted-foreground mb-2">竞赛</h4>
 <div className="space-y-1">
 {searchResults.contests.slice(0, 3).map((contest) => (
 <Link
 key={contest.id}
 href={`/contest/${contest.id}`}
 className="block p-2 rounded-lg hover:bg-primary/10 transition-colors duration-200"
 onClick={() => {
 setIsSearchOpen(false)
 setSearchQuery('')
 setSearchResults(null)
 }}
 >
 <div className="text-sm font-medium text-foreground">
 {contest.title}
 </div>
 <div className="text-xs text-muted-foreground mt-1">
 {new Date(contest.startTime).toLocaleDateString()}
 </div>
 </Link>
 ))}
 </div>
 </div>
 )}
 </div>
 ) : searchQuery ? (
 <div className="mt-3 py-4 text-center text-sm text-muted-foreground">
 无搜索结果
 </div>
 ) : (
 <div className="mt-3 pt-3 border-t border-border">
 <div className="flex items-center gap-2 text-xs text-muted-foreground">
 <kbd className="px-2 py-1 rounded bg-muted text-foreground font-mono hover:bg-primary/10 transition-colors duration-300">
 <Command className="w-3 h-3 inline mr-1" />
 K
 </kbd>
 <span>快速搜索</span>
 </div>
 </div>
 )}
 </div>
 )}
 </div>
 )
}

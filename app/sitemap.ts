import type { MetadataRoute } from 'next'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'
  const now = new Date()

  return [
    { url: `${baseUrl}/`, lastModified: now, changeFrequency: 'daily', priority: 1.0 },
    { url: `${baseUrl}/problems`, lastModified: now, changeFrequency: 'daily', priority: 0.9 },
    { url: `${baseUrl}/contests`, lastModified: now, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${baseUrl}/training`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${baseUrl}/rank`, lastModified: now, changeFrequency: 'daily', priority: 0.6 },
    { url: `${baseUrl}/announcements`, lastModified: now, changeFrequency: 'weekly', priority: 0.6 },
  ]
}

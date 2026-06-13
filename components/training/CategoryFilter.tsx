'use client'

/**
 * components/training/CategoryFilter.tsx
 * 横向滚动的分类 Tab
 */
interface CategoryFilterProps {
  categories: Array<{ id: string; name: string; _count?: { trainings: number } }>
  activeId: string | null
  onChange: (id: string | null) => void
}

export function CategoryFilter({ categories, activeId, onChange }: CategoryFilterProps) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-thin">
      <button
        onClick={() => onChange(null)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
          activeId === null
            ? 'bg-primary text-white shadow-md shadow-primary/30'
            : 'bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50'
        }`}
      >
        全部
      </button>
      {categories.map(cat => (
        <button
          key={cat.id}
          onClick={() => onChange(cat.id)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all inline-flex items-center gap-1.5 ${
            activeId === cat.id
              ? 'bg-primary text-white shadow-md shadow-primary/30'
              : 'bg-muted/30 text-muted-foreground hover:text-foreground hover:bg-muted/50'
          }`}
        >
          {cat.name}
          {cat._count?.trainings !== undefined && (
            <span className={`text-xs px-1.5 rounded ${activeId === cat.id ? 'bg-white/20' : 'bg-muted'}`}>
              {cat._count.trainings}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

export default CategoryFilter

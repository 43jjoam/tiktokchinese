import React from 'react'

export type TabId = 'home' | 'library' | 'profile'

const tabs: { id: TabId; label: string }[] = [
  { id: 'home', label: 'Home' },
  { id: 'library', label: 'Library' },
  { id: 'profile', label: 'Profile' },
]

function HomeIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={active ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  )
}

function LibraryIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={active ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}

function ProfileIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke={active ? '#fff' : 'rgba(255,255,255,0.5)'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}

const iconMap: Record<TabId, React.FC<{ active: boolean }>> = {
  home: HomeIcon,
  library: LibraryIcon,
  profile: ProfileIcon,
}

export default function BottomNav({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
}) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around border-t border-white/10 bg-black/80 backdrop-blur-xl"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: 'calc(56px + env(safe-area-inset-bottom, 0px))' }}
    >
      {tabs.map((tab) => {
        const active = activeTab === tab.id
        const Icon = iconMap[tab.id]
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className="flex flex-1 flex-col items-center gap-0.5 pt-2 pb-1 transition-colors"
            aria-label={tab.label}
          >
            <Icon active={active} />
            <span className={`text-[10px] font-medium ${active ? 'text-white' : 'text-white/50'}`}>
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}

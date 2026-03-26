import React, { useState } from 'react'
import BottomNav, { type TabId } from './components/BottomNav'
import VideoFeed from './components/VideoFeed'
import LibraryTab from './components/LibraryTab'
import ProfileTab from './components/ProfileTab'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home')

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black text-white">
      {/* Home tab: always mounted, hidden via CSS to preserve video state */}
      <div style={{ display: activeTab === 'home' ? 'contents' : 'none' }}>
        <VideoFeed />
      </div>

      {activeTab === 'library' && <LibraryTab />}
      {activeTab === 'profile' && <ProfileTab />}

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}

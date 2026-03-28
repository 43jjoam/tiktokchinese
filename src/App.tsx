import React, { useState } from 'react'
import BottomNav, { type TabId } from './components/BottomNav'
import VideoFeed from './components/VideoFeed'
import LibraryTab from './components/LibraryTab'
import ProfileTab from './components/ProfileTab'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home')

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-black text-white">
      {/* Home: keep mounted but avoid display:none — that tears down iframe/video on mobile */}
      <div
        style={
          activeTab === 'home'
            ? { display: 'contents' }
            : {
                position: 'absolute',
                inset: 0,
                overflow: 'hidden',
                opacity: 0,
                pointerEvents: 'none',
                zIndex: 0,
              }
        }
        aria-hidden={activeTab !== 'home'}
      >
        <VideoFeed keyboardShortcutsActive={activeTab === 'home'} />
      </div>

      {activeTab === 'library' && <LibraryTab />}
      {activeTab === 'profile' && <ProfileTab />}

      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  )
}

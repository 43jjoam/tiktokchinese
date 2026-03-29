import React, { useCallback, useEffect, useState } from 'react'
import BottomNav, { type TabId } from './components/BottomNav'
import { AuthCallbackLanding } from './components/AuthCallbackLanding'
import VideoFeed from './components/VideoFeed'
import LibraryTab from './components/LibraryTab'
import ProfileTab from './components/ProfileTab'
import { isAuthCallbackPathname } from './lib/authCallbackRoute'

const APP_DOC_TITLE = 'Chinese Flash — make learning Chinese easy and fun'
const AUTH_DOC_TITLE = 'Signing in — Chinese Flash'

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('home')
  const [showAuthCallback, setShowAuthCallback] = useState(() =>
    typeof window !== 'undefined' ? isAuthCallbackPathname(window.location.pathname) : false,
  )

  const onAuthCallbackFinished = useCallback(() => {
    setShowAuthCallback(false)
  }, [])

  useEffect(() => {
    document.title = showAuthCallback ? AUTH_DOC_TITLE : APP_DOC_TITLE
  }, [showAuthCallback])

  if (showAuthCallback) {
    return (
      <div className="relative h-dvh w-full overflow-hidden bg-black text-white">
        <AuthCallbackLanding onFinished={onAuthCallbackFinished} />
      </div>
    )
  }

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

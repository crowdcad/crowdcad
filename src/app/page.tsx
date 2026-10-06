'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import LoginModal from '@/components/modals/auth/loginmodal';
import { useAuth } from '@/hooks/useauth';
import { Button } from '@heroui/react';
import HomePageStreaks from '@/components/layout/homepagestreaks';
import { Github, ExternalLink } from 'lucide-react';

function AuthQueryEffects({
  onOpen,
  onSetError,
}: {
  onOpen: () => void;
  onSetError: (msg: string | null) => void;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get('login') === 'true') {
      onOpen();
      if (searchParams.get('error') === 'auth') {
        onSetError('Please sign in to access this page');
      }
    }
  }, [searchParams, onOpen, onSetError]);

  return null;
}

export default function LandingPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'signup'>('login');
  const [initialError, setInitialError] = useState<string | null>(null);

  return (
    <main className="h-[calc(100dvh-3.5rem)] w-full max-w-full overflow-hidden relative flex flex-col text-surface-light bg-surface-deepest">
      <HomePageStreaks />

      {/* ===== MAIN CONTENT ===== */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 gap-10">
        {/* Title */}
        <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-surface-light text-center leading-tight">
          Welcome back to CrowdCAD
        </h1>

        {/* Logo Row */}
        <div className="flex items-center gap-12 sm:gap-20">
          {/* CrowdCAD icon */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-24 h-24 sm:w-28 sm:h-28 relative">
              <Image
                src="/crowdcad_icon.png"
                alt="CrowdCAD"
                fill
                className="object-contain"
                priority
              />
            </div>
          </div>

          {/* Divider */}
          <div className="h-20 w-px bg-surface-light/20" />

          {/* Organization logo placeholder */}
          <div className="flex flex-col items-center gap-2">
            <div className="w-24 h-24 sm:w-28 sm:h-28 relative">
              <Image
                src="/globe.svg"
                alt="Your organization logo"
                fill
                className="object-contain p-4 opacity-40"
              />
            </div>
          </div>
        </div>

        {/* Auth button — conditional on login state */}
        {user ? (
          <Button
            size="lg"
            className="bg-accent hover:bg-accent/90 text-surface-deepest font-semibold px-10 py-6 text-base shadow-lg shadow-accent/30"
            onClick={() => router.push('/venues/selection')}
          >
            Start a New Event
          </Button>
        ) : (
          <Button
            size="lg"
            className="bg-accent hover:bg-accent/90 text-surface-deepest font-semibold px-10 py-6 text-base shadow-lg shadow-accent/30"
            onClick={() => setShowLoginModal(true)}
          >
            Sign In
          </Button>
        )}
      </div>

      {/* ===== FOOTER ===== */}
      <footer className="relative z-10 py-4 px-6 border-t border-surface-light/10 flex flex-wrap justify-center items-center gap-x-6 gap-y-2 text-xs text-surface-light/50">
        <a
          href="https://crowdcad.org"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-accent transition-colors"
        >
          crowdcad.org
        </a>
        <span className="hidden sm:inline text-surface-light/20">|</span>
        <a
          href="https://github.com/crowdcad/crowdcad"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 hover:text-accent transition-colors"
        >
          <Github className="w-3.5 h-3.5" />
          crowdcad/crowdcad
        </a>
        <span className="hidden sm:inline text-surface-light/20">|</span>
        <a
          href="https://www.gnu.org/licenses/agpl-3.0.en.html"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-accent transition-colors flex items-center gap-1"
        >
          <ExternalLink className="w-3 h-3" />
          AGPLv3 License
        </a>
        <span className="hidden sm:inline text-surface-light/20">|</span>
        <Link href="/lite" className="text-surface-light/50 hover:text-accent transition-colors">
          CrowdCAD Lite
        </Link>
        <span className="hidden sm:inline text-surface-light/20">|</span>
        <span className="text-surface-light/30">
          © {new Date().getFullYear()} CrowdCAD contributors
        </span>
      </footer>

      {/* ===== MODALS ===== */}
      <Suspense fallback={null}>
        <AuthQueryEffects
          onOpen={() => setShowLoginModal(true)}
          onSetError={(msg) => setInitialError(msg)}
        />
      </Suspense>

      <LoginModal
        open={showLoginModal}
        mode={loginMode}
        onClose={() => {
          setShowLoginModal(false);
          setInitialError(null);
          if (window.location.search) {
            window.history.replaceState({}, '', window.location.pathname);
          }
        }}
        setMode={setLoginMode}
        initialError={initialError}
      />
    </main>
  );
}

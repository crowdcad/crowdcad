'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { authService } from '@/lib/services';
import { useAuth } from '@/hooks/useauth';
import { useDispatchVocabulary } from '@/hooks/useDispatchVocabulary';
import { getLiteEvent } from '@/lib/liteEventStore';
import { hasPostingSchedule } from '@/lib/postingTimes';
import {
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuItem,
} from '@heroui/react';

import { BrandLogo, NavbarEndActions, LiveClock, LoginModalLazy, MobileMenuAccountItems, useThemeToggle } from '@/components/layout/navbarshared';
import HelpButton from '@/components/training/HelpButton';

const liteNavItems = [
  { label: 'Lite Home', href: '/lite' },
  { label: 'Create', href: '/lite/create' },
];

export default function LiteNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready } = useAuth();
  const { activePreset: dispatchVocabularyPreset } = useDispatchVocabulary();
  const t = useCallback(
    (key: string) => dispatchVocabularyPreset.terms[key] ?? key,
    [dispatchVocabularyPreset]
  );
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<'login' | 'signup'>('login');
  const { isDarkTheme, toggleTheme } = useThemeToggle();
  const [postingScheduleEnabled, setPostingScheduleEnabled] = useState(true);
  const isDispatch = !!(pathname && /^\/lite\/events\/[^/]+\/dispatch(?:$|\/|\?)/.test(pathname));
  const liteDispatchEventId = pathname?.match(/^\/lite\/events\/([^/?#]+)\/dispatch(?:$|[/?#])/)?.[1] ?? null;

  const isActive = (href: string) => pathname === href;
  const showPostingSchedule = isDispatch && postingScheduleEnabled;
  const wrapperHeightClass = 'h-14 md:h-14';
  const containerWidthClass = isDispatch ? 'max-w-none' : 'max-w-[1280px]';
  const logoWidthClass = 'w-20';
  const desktopNavGapClass = 'gap-2 pl-3';
  const menuOffsetClass = 'top-14 h-[calc(100dvh-3.5rem)]';

  useEffect(() => {
    let cancelled = false;

    const loadPostingScheduleConfig = async () => {
      if (!isDispatch || !liteDispatchEventId) {
        setPostingScheduleEnabled(true);
        return;
      }

      const event = await getLiteEvent(decodeURIComponent(liteDispatchEventId));
      if (cancelled) return;

      setPostingScheduleEnabled(hasPostingSchedule(event));
    };

    void loadPostingScheduleConfig();

    return () => {
      cancelled = true;
    };
  }, [isDispatch, liteDispatchEventId]);

  const openPostingSchedule = () => {
    window.dispatchEvent(new CustomEvent('open-posting-schedule'));
  };

  const triggerClearEvent = () => {
    window.dispatchEvent(new CustomEvent('open-lite-clear-event'));
  };

  const triggerExportSummary = () => {
    window.dispatchEvent(new CustomEvent('open-lite-export-summary'));
  };

  const onLogout = async () => {
    await authService.signOut();
    document.cookie = 'ccad_auth=0; Max-Age=0; Path=/; SameSite=Lax';
    router.refresh();
    router.push('/');
  };

  return (
    <>
      <Navbar
        isBlurred
        position="sticky"
        maxWidth="full"
        isMenuOpen={isMenuOpen}
        onMenuOpenChange={setIsMenuOpen}
        classNames={{
          base: `sticky top-0 z-[300] ${isDispatch ? 'bg-surface-deep' : 'bg-surface-deepest/70'} backdrop-blur-md`,
          wrapper:
            `${wrapperHeightClass} px-4 sm:px-6 md:px-6 lg:px-6 xl:px-6 2xl:px-6 flex items-center`,
          item: 'text-[18px] leading-6',
          content: 'items-center',
          toggle: 'lg:hidden',
          menu:
            `fixed inset-x-0 ${menuOffsetClass} z-[350] bg-surface-deep/95 backdrop-blur supports-[backdrop-filter]:bg-opacity-90 ` +
            'overflow-y-auto pt-2 pb-6 border-t border-base-200',
          menuItem: 'justify-center text-surface-light',
        }}
      >
        <div className={`flex w-full items-center justify-between ${containerWidthClass} mx-auto`}>
          <div className="relative z-[30] min-w-0 flex items-center gap-2 sm:gap-4 md:gap-6">
            <NavbarBrand>
              <BrandLogo isDarkTheme={isDarkTheme} onClick={() => router.push("/")} widthClass={logoWidthClass} />

              {isDispatch && (
                <div className="ml-3 flex items-center sm:ml-4 md:ml-6">
                  <LiveClock />
                </div>
                
              )}
            </NavbarBrand>

          <NavbarContent
            className={`hidden lg:flex flex-none ${desktopNavGapClass}`}
            justify="start"
          >
            {isDispatch ? (
              <>
                {showPostingSchedule && (
                  <NavbarItem>
                    <button
                      onClick={openPostingSchedule}
                      className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition text-surface-light hover:text-accent"
                    >
                      {t('Posting Schedule')}
                    </button>
                  </NavbarItem>
                )}

                <NavbarItem>
                  <Dropdown placement="bottom-start">
                    <DropdownTrigger>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition text-surface-light hover:text-accent"
                      >
                        {t('End Event')}
                      </button>
                    </DropdownTrigger>
                    <DropdownMenu aria-label="Lite end event actions">
                      <DropdownItem
                        key="clear-event"
                        className="text-status-red"
                        onPress={triggerClearEvent}
                      >
                        {t('Clear Event')}
                      </DropdownItem>
                      <DropdownItem key="export-summary" onPress={triggerExportSummary}>
                        {t('Export Summary')}
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </NavbarItem>
              </>
            ) : (
              liteNavItems.map(({ label, href }) => (
                <NavbarItem key={href} isActive={isActive(href)}>
                  <Link
                    href={href}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
                      isActive(href) ? 'text-surface-light' : 'text-surface-faint hover:text-accent'
                    }`}
                  >
                    {label}
                  </Link>
                </NavbarItem>
              ))
            )}
          </NavbarContent>
          </div>

          <NavbarEndActions
              isMenuOpen={isMenuOpen}
              help={isDispatch ? <HelpButton /> : null}
              isDarkTheme={isDarkTheme}
              toggleTheme={toggleTheme}
              ready={ready}
              signedIn={!!user}
              onLogin={() => {
                setIsMenuOpen(false);
                setLoginMode('login');
                setLoginOpen(true);
              }}
              onProfile={() => router.push('/profile')}
              onLogout={onLogout}
            />
        </div>

        <NavbarMenu className="bg-surface-deep border-t border-surface-liner pt-6">
          {isDispatch ? (
            <>
              {showPostingSchedule && (
                <NavbarMenuItem>
                  <button
                    onClick={() => {
                      setIsMenuOpen(false);
                      openPostingSchedule();
                    }}
                    className="block w-full text-left text-[18px] px-2 py-2"
                  >
                    {t('Posting Schedule')}
                  </button>
                </NavbarMenuItem>
              )}
              <NavbarMenuItem>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    triggerClearEvent();
                  }}
                  className="block w-full text-left text-[18px] px-2 py-2 text-status-red"
                >
                  {t('Clear Event')}
                </button>
              </NavbarMenuItem>
              <NavbarMenuItem>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    triggerExportSummary();
                  }}
                  className="block w-full text-left text-[18px] px-2 py-2"
                >
                  {t('Export Summary')}
                </button>
              </NavbarMenuItem>
            </>
          ) : (
            liteNavItems.map(({ label, href }) => (
              <NavbarMenuItem key={href}>
                <Link
                  href={href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`block w-full rounded-md px-2 py-2 text-left text-sm font-medium transition ${
                    isActive(href) ? 'text-surface-light' : 'text-surface-faint hover:text-accent'
                  }`}
                >
                  {label}
                </Link>
              </NavbarMenuItem>
            ))
          )}

          <MobileMenuAccountItems
            signedIn={!!user}
            isDarkTheme={isDarkTheme}
            toggleTheme={toggleTheme}
            closeMenu={() => setIsMenuOpen(false)}
            openLogin={(mode) => {
              setLoginMode(mode);
              setLoginOpen(true);
            }}
            onLogout={onLogout}
          />
        </NavbarMenu>
      </Navbar>

      {loginOpen && (
        <LoginModalLazy
          open={loginOpen}
          mode={loginMode}
          onClose={() => setLoginOpen(false)}
          setMode={setLoginMode}
        />
      )}
    </>
  );
}

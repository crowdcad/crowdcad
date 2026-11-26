'use client';

// Pieces shared by AppNavbar (cloud) and LiteNavbar (Lite mode).

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { Button, Dropdown, DropdownItem, DropdownMenu, DropdownTrigger, NavbarContent, NavbarItem, NavbarMenuItem, NavbarMenuToggle } from '@heroui/react';
import { LogOut, Menu, Moon, Sun, UserRound } from 'lucide-react';

export const LoginModalLazy = dynamic(() => import('@/components/modals/auth/loginmodal'), { ssr: false });

export type LoginMode = 'login' | 'signup';

/** The round icon buttons on the navbar's right (Help, light/dark): the same outline as the profile button. */
export const NAVBAR_ICON_BUTTON_CLASS =
  'h-8 w-8 min-w-8 !rounded-circle border border-surface-liner bg-surface-base text-surface-light hover:bg-surface-deeper';

/**
 * HH:mm:ss wall clock shown next to the logo on dispatch pages. A box as tall as the navbar's buttons
 * (h-8) with its digits centred, so it lines up with them in both looks; the timer font's baseline
 * nudge (meant for timers sitting in a line of label text) is turned off here.
 */
export function LiveClock() {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span suppressHydrationWarning={true} className="ui-timer !top-0 inline-flex h-8 items-center text-sm font-semibold leading-none text-surface-light" data-testid="navbar-clock">
      {now.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

/**
 * Light/dark toggle backed by the `dark` class + data-theme on <html>,
 * persisted to localStorage("ccad-theme") for the pre-paint theme script.
 */
export function useThemeToggle() {
  const [isDarkTheme, setIsDarkTheme] = useState(true);

  useEffect(() => {
    setIsDarkTheme(document.documentElement.classList.contains('dark'));
  }, []);

  const toggleTheme = useCallback(() => {
    const nextIsDark = !isDarkTheme;
    const root = document.documentElement;

    root.classList.toggle('dark', nextIsDark);
    root.setAttribute('data-theme', nextIsDark ? 'dark' : 'light');

    try {
      localStorage.setItem('ccad-theme', nextIsDark ? 'dark' : 'light');
    } catch {
      // Ignore localStorage failures (private mode / restricted storage).
    }

    setIsDarkTheme(nextIsDark);
  }, [isDarkTheme]);

  return { isDarkTheme, toggleTheme };
}

const menuItemClass = 'block w-full rounded-md px-2 py-2 text-left text-sm font-medium transition';

/** Divider + theme toggle + log in/sign up (or profile/logout) at the bottom of the mobile menu. */
export function MobileMenuAccountItems({
  signedIn,
  isDarkTheme,
  toggleTheme,
  closeMenu,
  openLogin,
  onLogout,
}: {
  signedIn: boolean;
  isDarkTheme: boolean;
  toggleTheme: () => void;
  closeMenu: () => void;
  openLogin: (mode: LoginMode) => void;
  onLogout: () => void;
}) {
  const action = (fn: () => void) => () => {
    closeMenu();
    fn();
  };

  return (
    <>
      <div className="my-2 border-t border-surface-liner" />

      <NavbarMenuItem className="mt-1">
        <button className={`${menuItemClass} text-surface-light hover:text-accent`} onClick={action(toggleTheme)}>
          {isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
        </button>
      </NavbarMenuItem>

      {!signedIn ? (
        <>
          <NavbarMenuItem className="mt-1">
            <button className={`${menuItemClass} text-surface-light hover:text-accent`} onClick={action(() => openLogin('login'))}>
              Log in
            </button>
          </NavbarMenuItem>
          <NavbarMenuItem className="mt-1">
            <button className={`${menuItemClass} text-surface-light hover:text-accent`} onClick={action(() => openLogin('signup'))}>
              Sign up
            </button>
          </NavbarMenuItem>
        </>
      ) : (
        <>
          <NavbarMenuItem>
            <Link href="/profile" className={`${menuItemClass} text-surface-light hover:text-accent`} onClick={closeMenu}>
              Profile
            </Link>
          </NavbarMenuItem>
          <NavbarMenuItem>
            <button className={`${menuItemClass} text-status-red hover:text-status-red/80`} onClick={action(onLogout)}>
              Logout
            </button>
          </NavbarMenuItem>
        </>
      )}
    </>
  );
}

/**
 * The CrowdCAD wordmark with its ™, as every navbar shows it (a button home). One place, so the mark and its
 * sizing stay the same on every page.
 */
export function BrandLogo({ isDarkTheme, onClick, widthClass = 'w-20' }: { isDarkTheme: boolean; onClick: () => void; widthClass?: string }) {
  return (
    <button onClick={onClick} className="flex items-start" aria-label="CrowdCAD home">
      <Image
        src={isDarkTheme ? '/logo.svg' : '/logo-dark.svg'}
        alt="CrowdCAD"
        width={118}
        height={30}
        priority
        sizes="(max-width: 600px) 7rem, (max-width: 800px) 8rem, 110px"
        className={`cursor-pointer h-auto shrink-0 ${widthClass}`}
      />
      <span aria-hidden className="ml-0.5 -mt-0.5 text-[0.6rem] font-semibold leading-none text-surface-light/80">
        ™
      </span>
    </button>
  );
}

/**
 * The right end of every navbar: the phone menu toggle, Help (when given), the light/dark switch, and Log In
 * or the profile menu. Shared so the app's navbars look and behave the same.
 */
export function NavbarEndActions({
  isMenuOpen,
  help,
  isDarkTheme,
  toggleTheme,
  ready,
  signedIn,
  onLogin,
  onProfile,
  onLogout,
}: {
  isMenuOpen: boolean;
  help?: React.ReactNode;
  isDarkTheme: boolean;
  toggleTheme: () => void;
  ready: boolean;
  signedIn: boolean;
  onLogin: () => void;
  onProfile: () => void;
  onLogout: () => void;
}) {
  return (
    <NavbarContent justify="end" className="gap-1 sm:gap-2 md:gap-2">
      {help && <NavbarItem>{help}</NavbarItem>}

      <NavbarItem>
        <Button
          isIconOnly
          variant="flat"
          aria-label={isDarkTheme ? 'Switch to light mode' : 'Switch to dark mode'}
          className={NAVBAR_ICON_BUTTON_CLASS}
          onPress={toggleTheme}
        >
          {isDarkTheme ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </NavbarItem>

      {!ready ? (
        <NavbarItem>
          {/* Holds the space while auth loads, so nothing shifts. */}
          <div className="w-10 h-10" />
        </NavbarItem>
      ) : !signedIn ? (
        <NavbarItem>
          <Button
            variant="bordered"
            aria-label="Log in"
            className="h-8 min-w-8 !rounded-circle border-surface-liner px-3 text-surface-light hover:bg-surface-deeper"
            onPress={onLogin}
          >
            Log In
          </Button>
        </NavbarItem>
      ) : (
        <NavbarItem className="hidden lg:flex">
          <Dropdown placement="bottom-end">
            <DropdownTrigger>
              <button aria-label="Open profile menu" className="relative rounded-circle cursor-pointer">
                <span className="flex h-8 w-8 items-center justify-center rounded-circle border border-surface-liner bg-surface-base text-surface-light">
                  <UserRound className="size-4" />
                </span>
              </button>
            </DropdownTrigger>
            <DropdownMenu aria-label="Profile menu" className="min-w-40 flex flex-col space-y-1 origin-top-right transform-gpu transition-all duration-150">
              <DropdownItem key="profile" startContent={<UserRound className="size-4" />} className="transition-colors" onPress={onProfile}>
                Profile
              </DropdownItem>
              <DropdownItem key="logout" className="text-status-red" startContent={<LogOut className="size-4" />} onPress={onLogout}>
                Logout
              </DropdownItem>
            </DropdownMenu>
          </Dropdown>
        </NavbarItem>
      )}

      {/* The menu button always sits at the top-right corner, after the theme and account buttons. */}
      <div className="lg:hidden">
        <NavbarMenuToggle
          aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
          className="text-surface-light"
          icon={(open) => <Menu className={`size-6 transition ${open ? 'rotate-90' : ''} text-surface-light`} />}
        />
      </div>
    </NavbarContent>
  );
}

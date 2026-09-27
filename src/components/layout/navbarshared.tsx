'use client';

// Pieces shared by AppNavbar (cloud) and LiteNavbar (Lite mode).

import React, { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { NavbarMenuItem } from '@heroui/react';

export const LoginModalLazy = dynamic(() => import('@/components/modals/auth/loginmodal'), { ssr: false });

export type LoginMode = 'login' | 'signup';

/** HH:mm:ss wall clock shown next to the logo on dispatch pages. */
export function LiveClock() {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span suppressHydrationWarning={true} className="tabular-nums text-surface-light text-sm font-semibold font-arial">
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

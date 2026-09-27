"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { authService, dbService } from "@/lib/services";
import { useAuth } from "@/hooks/useauth";
import { useAdmin } from "@/hooks/useAdmin";
import { useDispatchVocabulary } from "@/hooks/useDispatchVocabulary";
import { isEventEnded } from "@/lib/eventStatus";
import type { Event } from "@/app/types";

import {
  Navbar,
  NavbarBrand,
  NavbarContent,
  NavbarItem,
  NavbarMenu,
  NavbarMenuItem,
  NavbarMenuToggle,
  Button,
  Dropdown,
  DropdownTrigger,
  DropdownMenu,
  DropdownItem,
} from "@heroui/react";

import { Menu, Moon, UserRound, LogOut, Sun } from "lucide-react";
import { LiveClock, LoginModalLazy, MobileMenuAccountItems, useThemeToggle } from '@/components/layout/navbarshared';

export default function AppNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, ready } = useAuth();
  const { isAdmin } = useAdmin();
  const { activePreset: dispatchVocabularyPreset } = useDispatchVocabulary();
  const t = useCallback(
    (key: string) => dispatchVocabularyPreset.terms[key] ?? key,
    [dispatchVocabularyPreset]
  );

  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [loginMode, setLoginMode] = useState<"login" | "signup">("login");
  const { isDarkTheme, toggleTheme } = useThemeToggle();

  const isDispatch = !!(pathname && /^\/events\/[^/]+\/dispatch(?:$|\/|\?)/.test(pathname));
  const dispatchEventId = pathname?.match(/^\/events\/([^/?#]+)\/dispatch(?:$|[/?#])/)?.[1] ?? null;

  const navItems = [
    { label: "Home", href: "/" },
    { label: "Venues", href: "/venues/selection" },
  ];

  // Whether the current dispatch event actually has something for these
  // buttons to open — an event with no posting schedule configured gets no
  // button rather than one that opens an empty modal. Defaults to shown
  // (true) until the event doc loads, to avoid the button popping in after
  // a flash of nothing.
  const [postingScheduleEnabled, setPostingScheduleEnabled] = useState(true);
  const [eventEnded, setEventEnded] = useState(false);
  const [eventOwnerId, setEventOwnerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadDispatchNavState = async () => {
      if (!isDispatch || !dispatchEventId) {
        setPostingScheduleEnabled(true);
        setEventEnded(false);
        setEventOwnerId(null);
        return;
      }

      try {
        const docSnap = await dbService.getDocument<Event>('events', decodeURIComponent(dispatchEventId));
        if (cancelled) return;

        const data = docSnap.exists ? docSnap.data : null;

        setPostingScheduleEnabled((data?.postingTimes?.length ?? 0) > 0);
        setEventEnded(data ? isEventEnded(data) : false);
        setEventOwnerId(data?.userId ?? null);
      } catch {
        if (!cancelled) {
          setPostingScheduleEnabled(true);
        }
      }
    };

    void loadDispatchNavState();

    return () => {
      cancelled = true;
    };
  }, [isDispatch, dispatchEventId]);

  // Only the event's creator or a site admin can end it.
  const canEndEvent = isAdmin || (!!user && !!eventOwnerId && user.uid === eventOwnerId);

  // Flip instantly on the dispatch page's own "End Event" action, instead of
  // waiting on the one-time fetch above to notice.
  useEffect(() => {
    const onEnded = () => setEventEnded(true);
    window.addEventListener('dispatch-event-ended', onEnded);
    return () => window.removeEventListener('dispatch-event-ended', onEnded);
  }, []);

  const dispatchItems = [
    ...(postingScheduleEnabled
      ? [{
          label: "Posting Schedule",
          onClick: () => window.dispatchEvent(new CustomEvent('open-posting-schedule')),
        }]
      : []),
    {
      label: "Event Summary",
      onClick: () => window.dispatchEvent(new CustomEvent('open-event-summary'))
    },
    ...(canEndEvent
      ? [{
          label: eventEnded ? "Event Ended" : "End Event",
          onClick: () => window.dispatchEvent(new CustomEvent('open-end-event')),
        }]
      : []),
    {
      label: "Venues",
      onClick: () => router.push('/venues/selection'),
      isActive: pathname === '/venues/selection'
    },
  ];

  const isActive = (href: string) => pathname === href;
  const wrapperHeightClass = 'h-14 md:h-14';
  const containerWidthClass = isDispatch ? 'max-w-none' : 'max-w-[1280px]';
  const logoWidthClass = 'w-20';
  const desktopNavGapClass = 'gap-1 pl-2';

  // Optional: You can add logic here to check if the user is actually an admin
  // const isAdmin = user?.email === "admin@yourdomain.com"; 

  const onLogout = async () => {
    await authService.signOut();
    document.cookie = "ccad_auth=0; Max-Age=0; Path=/; SameSite=Lax";
    router.refresh();
    router.push("/");
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
          base:
            `sticky top-0 z-[300] ${isDispatch ? 'bg-surface-deep' : 'bg-surface-deepest/70'} backdrop-blur-md`,
          wrapper:
            `${wrapperHeightClass} px-4 sm:px-6 md:px-6 lg:px-6 xl:px-6 2xl:px-6 flex items-center`,
          item: "text-[16px] leading-6",
          content: "items-center",
          toggle: "lg:hidden",
          menu:
            `fixed inset-x-0 top-14 h-[calc(100dvh-3.5rem)] z-[350] bg-surface-deep/95 backdrop-blur supports-[backdrop-filter]:bg-opacity-90 ` +
            'overflow-y-auto pt-2 pb-6 border-t border-base-200',
          menuItem: "justify-center text-surface-light",
        }}
      >
        <div className={`flex w-full items-center justify-between ${containerWidthClass} mx-auto`}>
          <div className="relative z-[30] min-w-0 flex items-center gap-2 sm:gap-4 md:gap-6">
            <NavbarBrand>
              <button onClick={() => router.push("/")} className="flex items-center">
                <Image
                  src={isDarkTheme ? "/logo.svg" : "/logo-dark.svg"}
                  alt="Logo"
                  width={118}
                  height={30}
                  priority
                  sizes="(max-width: 600px) 7rem, (max-width: 800px) 8rem, 110px"
                  className={`cursor-pointer h-auto shrink-0 ${logoWidthClass}`}
                />
              </button>
              {/* LiveClock next to logo when on dispatch page */}
              {isDispatch && (
                <div className="ml-3 sm:ml-4 md:ml-6">
                  <LiveClock />
                </div>
              )}
            </NavbarBrand>
            {/* Organization selector removed — use Profile > Affiliations instead */}

            {/* Desktop nav links */}
          <NavbarContent 
            className={`hidden lg:flex flex-none ${desktopNavGapClass}`}
            justify="start"
          >
            {isDispatch ? (
              // Dispatch page navigation
              dispatchItems.map(({ label, onClick, isActive: itemActive }) => (
                <NavbarItem key={label}>
                  <button
                    onClick={onClick}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition ${
                      itemActive ? "text-surface-light" : "text-surface-light hover:text-accent"
                    }`}
                  >
                    {t(label)}
                  </button>
                </NavbarItem>
              ))
            ) : (
              navItems.map(({ label, href }) => (
                <NavbarItem key={href} isActive={isActive(href)}>
                  <Link
                    href={href}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium transition ${
                      isActive(href) ? "text-surface-light" : "text-surface-faint hover:text-accent"
                    }`}
                  >
                    {label}
                  </Link>
                </NavbarItem>
              ))
            )}
          </NavbarContent>
          </div>

          {/* RIGHT: auth + mobile toggle */}
          <NavbarContent justify="end" className="gap-1 sm:gap-2 md:gap-2">
            {/* Mobile toggle */}
            <div className="lg:hidden">
              <NavbarMenuToggle
                aria-label={isMenuOpen ? "Close menu" : "Open menu"}
                className="text-surface-light"
                icon={(open) => (
                  <Menu className={`size-6 transition ${open ? "rotate-90" : ""} text-surface-light`} />
                )}
              />
            </div>

            <NavbarItem>
              <Button
                isIconOnly
                variant="flat"
                aria-label={isDarkTheme ? "Switch to light mode" : "Switch to dark mode"}
                className="h-8 w-8 min-w-8 rounded-full bg-surface-deeper/70 text-surface-light hover:bg-surface-deeper"
                onPress={toggleTheme}
              >
                {isDarkTheme ? <Sun className="size-4" /> : <Moon className="size-4" />}
              </Button>
            </NavbarItem>

            {/* Show nothing while loading */}
            {!ready ? (
              <NavbarItem>
                <div className="w-10 h-10" /> {/* Placeholder to prevent layout shift */}
              </NavbarItem>
            ) : !user ? (
              <NavbarItem>
                <Button
                  variant="bordered"
                  aria-label="Log in"
                  className="h-8 min-w-8 rounded-full border-surface-liner px-3 text-surface-light hover:bg-surface-deeper"
                  onPress={() => {
                    setIsMenuOpen(false);
                    setLoginMode("login");
                    setLoginOpen(true);
                  }}
                >
                  Log In
                </Button>
              </NavbarItem>
              
            ) : (
              <NavbarItem className="hidden lg:flex">
                <Dropdown placement="bottom-end">
                  <DropdownTrigger>
                    <button
                        aria-label="Open profile menu"
                        className="relative rounded-full p-0.5 bg-gradient-to-br from-accent/70 to-[rgba(240,28,28,0.4)] cursor-pointer"
                      >
                        <span className="flex h-7 w-7 items-center justify-center rounded-full border border-surface-liner bg-surface-base text-surface-light">
                          <UserRound className="size-4" />
                        </span>
                      </button>
                  </DropdownTrigger>


                  {/* ✅ Fixed: solid background + correct hover styles */}
                  <DropdownMenu
                    aria-label="Profile menu"
                    className="min-w-40 flex flex-col space-y-1 origin-top-right transform-gpu transition-all duration-150"
                  >
                    <DropdownItem
                      key="profile"
                      startContent={<UserRound className="size-4" />}
                      className="transition-colors"
                      onPress={() => router.push("/profile")}
                    >
                      Profile
                    </DropdownItem>
                    <DropdownItem
                      key="logout"
                      className="text-status-red"
                      startContent={<LogOut className="size-4" />}
                      onPress={onLogout}
                    >
                      Logout
                    </DropdownItem>
                  </DropdownMenu>
                </Dropdown>
              </NavbarItem>
            )}
          </NavbarContent>
        </div>

        {/* MOBILE MENU */}
        <NavbarMenu className="bg-surface-deep border-t border-surface-liner pt-6">
          {isDispatch ? (
            dispatchItems.map(({ label, onClick}) => (
              <NavbarMenuItem key={label}>
                <button
                  onClick={() => {
                    setIsMenuOpen(false);
                    onClick();
                  }}
                  className="block w-full text-left text-[18px] px-2 py-2 hover:opacity-80"
                >
                  {t(label)}
                </button>
              </NavbarMenuItem>
            ))
          ) : (
            navItems.map(({ label, href }) => (
              <NavbarMenuItem key={href}>
                <Link
                  href={href}
                  onClick={() => setIsMenuOpen(false)}
                  className={`block w-full rounded-md px-2 py-2 text-left text-sm font-medium transition ${
                    isActive(href) ? "text-surface-light" : "text-surface-faint hover:text-accent"
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
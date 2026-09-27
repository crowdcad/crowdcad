'use client';
import { formatEventDate } from '@/lib/eventDate';

import { useRouter } from 'next/navigation';
import React, { useEffect, useState, useMemo } from 'react';
import { dbService, type Unsubscribe } from '@/lib/services';
import type { Venue, Event } from '@/app/types';
import { isEventEnded } from '@/lib/eventStatus';
import { useAuth } from '@/hooks/useauth';
import { useAdmin } from '@/hooks/useAdmin';
import LoadingScreen from '@/components/ui/loading-screen';
import { stripUndefined } from '@/lib/utils';
import ShareModal from '@/components/modals/sharemodal';
import { Share2, Building2 } from "lucide-react";
import { 
  Card, 
  CardBody, 
  Button, 
  Dropdown, 
  DropdownTrigger, 
  DropdownMenu, 
  DropdownItem,
  Input,
  Chip,
  ScrollShadow
} from "@heroui/react";
import { 
  Plus, 
  MapPin, 
  Calendar, 
  Users, 
  Phone, 
  MoreVertical, 
  Edit, 
  Trash2, 
  Play,
  Search,
  ChevronLeft
} from "lucide-react";

export default function VenueSelection() {
  const router = useRouter();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [, setLoading] = useState(true);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<Event[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobile, setIsMobile] = useState(false);
  const [ownedVenuesList, setOwnedVenuesList] = useState<Venue[]>([]);
  const [sharedVenuesList, setSharedVenuesList] = useState<Venue[]>([]);
  const [orgVenuesList, setOrgVenuesList] = useState<Venue[]>([]);
  const [ownedEventsList, setOwnedEventsList] = useState<Event[]>([]);
  const [sharedEventsList, setSharedEventsList] = useState<Event[]>([]);
  const [orgEventsList, setOrgEventsList] = useState<Event[]>([]);
  const [isStartingEvent, setIsStartingEvent] = useState(false);
  const { user, ready } = useAuth();
  const { isAdmin } = useAdmin();
  const [shareModalData, setShareModalData] = useState<{
    id: string;
    name: string;
    type: 'venues' | 'events';
    sharedWith: string[];
  } | null>(null);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Re-evaluates each event's Active/Ended status periodically so the
  // 1-hour-no-activity backup end (a pure function of wall-clock time, see
  // src/lib/eventStatus.ts) shows up here without needing a write.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  // const isEventIncomplete = (data: Partial<Event>) => {
  //   if (!data.name || data.name.trim() === '') {
  //     if (data.createdAt) {
  //       const createdTime = new Date(data.createdAt).getTime();
  //       const now = Date.now();
  //       return (now - createdTime) > 5 * 60 * 1000;
  //     }
  //     return true;
  //   }
  //   return false;
  // };

  const handleDeleteEvent = async (eventId: string) => {
    const confirm = window.confirm('Are you sure you want to delete this event?');
    if (!confirm) return;
    try {
      await dbService.deleteDocument('events', eventId);
      setRecentEvents(prev => prev.filter(e => e.id !== eventId));
    } catch (error) {
      console.error('Error deleting event:', error);
      alert('Failed to delete event.');
    }
  };

  const handleDeleteVenue = async (venueId: string) => {
    const confirm = window.confirm('Are you sure you want to delete this venue?');
    if (!confirm) return;
    try {
      await dbService.deleteDocument('venues', venueId);
      setVenues(prev => prev.filter(v => v.id !== venueId));
      if (selectedVenueId === venueId) {
        setSelectedVenueId(null);
      }
    } catch (error) {
      console.error('Error deleting venue:', error);
      alert('Failed to delete venue.');
    }
  };

  const handleStartNewEvent = async (venueId: string) => {
    const selectedVenue = venues.find((v) => v.id === venueId);
    if (!selectedVenue) {
      alert('Venue not found.');
      return;
    }

    try {
      setIsStartingEvent(true);
      const newEvent = {
        name: '',
        date: new Date(),
        venue: selectedVenue,
        postingTimes: [],
        staff: [],
        supervisor: [],
        userId: selectedVenue.userId,
        calls: [],
        eventPosts: [],
        eventEquipment: [],
        status: 'draft',
        createdAt: new Date().toISOString(),
      };

      const newEventId = await dbService.addDocument('events', stripUndefined(newEvent));
      router.push(`/events/${newEventId}/create`);
    } catch (error) {
      console.error('Error creating event:', error);
      alert('Failed to create event.');
      setIsStartingEvent(false);
    }
  };

  const handleToggleOrgEvent = async (event: Event) => {
    try {
      await dbService.updateDocument('events', event.id, { isOrgEvent: !event.isOrgEvent });
      setRecentEvents(prev => prev.map(e => (e.id === event.id ? { ...e, isOrgEvent: !e.isOrgEvent } : e)));
    } catch (error) {
      console.error('Error updating event:', error);
      alert('Failed to update event.');
    }
  };

  // Mirrors firestore.rules exactly, so a button is only ever enabled when
  // the write it triggers will actually succeed: venues/events can be
  // edited, deleted, or shared by their creator or a site admin — never by
  // any other member, org-venue or not. Starting a new event names the
  // *venue's* owner (not whoever clicks the button) as the event's owner,
  // so only the venue's own creator can currently start one there.
  const canManageVenue = (venue: Venue) => venue.userId === user?.uid || isAdmin;
  const canStartEventAt = (venue: Venue | undefined) => !!venue && venue.userId === user?.uid;
  const canManageEvent = (event: Event) => event.userId === user?.uid || isAdmin;

  useEffect(() => {
    if (!user) {
      setVenues([]);
      setRecentEvents([]);
      setLoading(false);
      return;
    }

    const listeners: Unsubscribe[] = [];
    setLoading(true);

    // 1. Owned Venues Listener
    listeners.push(dbService.subscribeToQuery<Venue>(
      'venues',
      [{ field: 'userId', op: '==', value: user.uid }],
      (snaps) => setOwnedVenuesList(snaps.map(s => ({ ...s.data, id: s.id } as Venue))),
    ));

    // 2. Shared Venues Listener
    if (user.email) {
      listeners.push(dbService.subscribeToQuery<Venue>(
        'venues',
        [{ field: 'sharedWith', op: 'array-contains', value: user.email }],
        (snaps) => setSharedVenuesList(snaps.map(s => ({ ...s.data, id: s.id } as Venue))),
      ));
    } else {
      setSharedVenuesList([]);
    }

    // 2b. Organization Venues Listener — admin-designated venues visible to everyone
    listeners.push(dbService.subscribeToQuery<Venue>(
      'venues',
      [{ field: 'isOrgVenue', op: '==', value: true }],
      (snaps) => setOrgVenuesList(snaps.map(s => ({ ...s.data, id: s.id } as Venue))),
    ));

    // 3. Owned Events Listener
    listeners.push(dbService.subscribeToQuery<Event>(
      'events',
      [{ field: 'userId', op: '==', value: user.uid }],
      (snaps) => setOwnedEventsList(snaps.map(s => ({ ...s.data, id: s.id } as Event))),
    ));

    // 4. Shared Events Listener
    if (user.email) {
      listeners.push(dbService.subscribeToQuery<Event>(
        'events',
        [{ field: 'sharedWith', op: 'array-contains', value: user.email }],
        (snaps) => setSharedEventsList(snaps.map(s => ({ ...s.data, id: s.id } as Event))),
      ));
    } else {
      setSharedEventsList([]);
    }

    // 5. Organization Events Listener — admin-designated events visible to
    // every org member, mirroring the Organization Venues listener above.
    listeners.push(dbService.subscribeToQuery<Event>(
      'events',
      [{ field: 'isOrgEvent', op: '==', value: true }],
      (snaps) => setOrgEventsList(snaps.map(s => ({ ...s.data, id: s.id } as Event))),
    ));

    // Cleanup incomplete drafts (One-time check on mount/user load)
    const cleanupIncompleteEvents = async () => {
      try {
        const drafts = await dbService.queryCollection<Partial<Event>>('events', [
          { field: 'userId', op: '==', value: user.uid },
          { field: 'status', op: '==', value: 'draft' },
        ]);
        const deletePromises = drafts
          .filter(snap => {
            const data = snap.data;
            if (!data?.name || data.name.trim() === '') {
              if (data?.createdAt) {
                const createdTime = new Date(data.createdAt as string).getTime();
                const now = Date.now();
                return (now - createdTime) > 5 * 60 * 1000;
              }
              return true;
            }
            return false;
          })
          .map(snap => dbService.deleteDocument('events', snap.id));
        await Promise.all(deletePromises);
      } catch (error) {
        console.error('Error cleaning up incomplete events:', error);
      }
    };
    cleanupIncompleteEvents();

    setLoading(false);

    return () => {
      listeners.forEach(unsub => unsub());
    };
  }, [user]);

  // NEW: Aggregation Effect to combine lists
  useEffect(() => {
    // Combine Venues
    const venueMap = new Map<string, Venue>();
    
    // Add owned, shared, and organization venues to map
    [...ownedVenuesList, ...sharedVenuesList, ...orgVenuesList].forEach(v => {
      venueMap.set(v.id, v);
    });

    // Process Events
    const rawEvents = [...ownedEventsList, ...sharedEventsList, ...orgEventsList];
    const processedEvents = rawEvents.map(event => {
      // Ensure shared events contribute their venues to the venue list
      if (event.venue && !venueMap.has(event.venue.id)) {
        venueMap.set(event.venue.id, event.venue);
      }

      let dateStr: string;
      if (typeof event.date === 'string') {
        const d = new Date(event.date);
        dateStr = isNaN(d.getTime()) ? '' : d.toISOString();
      } else {
        dateStr = '';
      }
      return {
        ...event,
        date: dateStr,
      } as Event;
    });

    // Remove duplicates in event list if any (e.g. if user is both owner and in sharedWith)
    const uniqueEvents = Array.from(new Map(processedEvents.map(item => [item.id, item])).values());

    setVenues(Array.from(venueMap.values()));
    setRecentEvents(uniqueEvents);
  }, [ownedVenuesList, sharedVenuesList, orgVenuesList, ownedEventsList, sharedEventsList, orgEventsList]);

  const venueStats = useMemo(() => {
    const byVenue: Record<string, { count: number; lastUsed: number | null }> = {};

    for (const v of venues) {
      byVenue[v.id] = { count: 0, lastUsed: null };
    }

    for (const e of recentEvents) {
      const vId = e.venue?.id;
      if (!vId || !byVenue[vId]) continue;

      byVenue[vId].count += 1;

      const ts = new Date(e.date as unknown as string).getTime();
      if (!Number.isNaN(ts)) {
        const prev = byVenue[vId].lastUsed ?? -Infinity;
        byVenue[vId].lastUsed = Math.max(prev, ts);
      }
    }

    const sorted = [...venues].sort((a, b) => {
      const aLast = byVenue[a.id]?.lastUsed ?? -Infinity;
      const bLast = byVenue[b.id]?.lastUsed ?? -Infinity;
      return bLast - aLast;
    });

    return { byVenue, sorted };
  }, [venues, recentEvents]);

  const filteredVenues = useMemo(() => {
    if (!searchQuery) return venueStats.sorted;
    return venueStats.sorted.filter(v =>
      (v.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [venueStats.sorted, searchQuery]);

  const selectedVenueEvents = useMemo(() => {
    if (!selectedVenueId) return [];
    return recentEvents
      .filter(e => e.venue?.id === selectedVenueId)
      .sort((a, b) => {
        const ta = new Date(a.date).getTime() || 0;
        const tb = new Date(b.date).getTime() || 0;
        return tb - ta;
      });
  }, [selectedVenueId, recentEvents]);

  const formatRelativeDate = (timestamp: number | null) => {
    if (!timestamp) return 'Never used';
    const now = Date.now();
    const diff = now - timestamp;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Used today';
    if (days === 1) return 'Used yesterday';
    if (days < 7) return `Used ${days} days ago`;
    if (days < 14) return `Used ${Math.floor(days / 7)} week ago`;
    if (days < 30) return `Used ${Math.floor(days / 7)} weeks ago`;
    return new Date(timestamp).toLocaleDateString();
  };

  // Authentication check
  useEffect(() => {
    if (ready && !user) {
      sessionStorage.setItem('redirectPath', '/venues/selection');
      router.push('/?login=true&error=auth');
    }
  }, [user, ready, router]);

  // Return early if auth is not ready or user is not authenticated
  if (!ready) {
    return <LoadingScreen label="Loading…" />;
  }

  if (!user) {
    return (
      <div className="bg-surface-deepest text-surface-light min-h-screen pt-24 px-6 flex items-center justify-center">
        <div>Redirecting...</div>
      </div>
    );
  }

  // Mobile View - Show venue list or event details
  if (isMobile) {
    return (
      <main className="relative bg-surface-deepest text-surface-light h-[calc(100vh-3.5rem)]">
        <div className="relative z-10 pt-10 px-4 pb-8">
          {/* Mobile: Venue List View */}
          {!selectedVenueId && (
            <>
              <div className="mb-6">
                <h1 className="text-3xl font-bold mb-2">Your Venues</h1>
                <p className="text-surface-light">Select a venue to view events or start a new one</p>
              </div>

              <Input
                placeholder="Search venues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                startContent={<Search className="w-4 h-4 text-surface-light" />}
                variant="flat"
                color="default"
                classNames={{
                  base: "mb-4",
                  inputWrapper: "bg-surface-deep",
                  input: "outline-none focus:outline-none data-[focus=true]:outline-none"
                }}
              />

              <ScrollShadow className="minimal-scrollbar space-y-3 max-h-[32rem] pr-2">
                {filteredVenues.map((venue) => {
                  const stats = venueStats.byVenue[venue.id] ?? { count: 0, lastUsed: null };
                  return (
                    <Card
                      key={venue.id}
                      isPressable
                      onPress={() => setSelectedVenueId(venue.id)}
                      classNames={{
                        base: "rounded-sm bg-surface-deep/50 hover:bg-surface-deep backdrop-blur-sm w-full"
                      }}
                    >
                      <CardBody className="p-4">
                        <div className="flex justify-between items-start w-full">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <MapPin className="w-4 h-4 text-status-blue flex-shrink-0" />
                              <h3 className="font-semibold text-lg truncate min-w-0">{venue.name}</h3>
                              {venue.isOrgVenue && (
                                <Chip size="sm" variant="flat" className="bg-accent/20 text-accent flex-shrink-0">
                                  Org
                                </Chip>
                              )}
                            </div>
                            <div className="text-sm text-surface-light">
                              {stats.count} {stats.count === 1 ? 'event' : 'events'}
                            </div>
                            <div className="text-xs text-surface-light mt-1">
                              {formatRelativeDate(stats.lastUsed)}
                            </div>
                          </div>
                          
                          <div
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <Dropdown placement="bottom-end" offset={6}>
                              <DropdownTrigger>
                                <button
                                  className="p-0 m-0 border-0 bg-transparent text-surface-light hover:text-status-blue transition-colors cursor-pointer flex items-center justify-center"
                                  aria-label="Venue actions"
                                  type="button"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </DropdownTrigger>
                              <DropdownMenu aria-label="Venue actions" disabledKeys={canManageVenue(venue) ? [] : ['edit', 'share', 'delete']}>
                                <DropdownItem
                                  key="edit"
                                  startContent={<Edit className="w-4 h-4" />}
                                  description={canManageVenue(venue) ? undefined : 'Only the owner or an admin can edit'}
                                  onPress={() => router.push(`/venues/management?venueId=${venue.id}`)}
                                >
                                  Edit
                                </DropdownItem>
                                <DropdownItem
                                  key="share"
                                  startContent={<Share2 className="w-4 h-4" />}
                                  description={canManageVenue(venue) ? undefined : 'Only the owner or an admin can share'}
                                  onPress={() => setShareModalData({
                                    id: venue.id,
                                    name: venue.name,
                                    type: 'venues',
                                    sharedWith: venue.sharedWith || []
                                  })}
                                >
                                  Share
                                </DropdownItem>
                                <DropdownItem
                                  key="delete"
                                  className="text-danger"
                                  color="danger"
                                  startContent={<Trash2 className="w-4 h-4" />}
                                  description={canManageVenue(venue) ? undefined : 'Only the owner or an admin can delete'}
                                  onPress={() => handleDeleteVenue(venue.id)}
                                >
                                  Delete
                                </DropdownItem>
                              </DropdownMenu>
                            </Dropdown>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  );
                })}
              </ScrollShadow>

              <Button
                size="lg"
                radius="full"
                startContent={<Plus className="w-5 h-5" />}
                className="bg-accent hover:bg-accent/90 fixed bottom-6 right-6 shadow-lg z-50"
                onPress={() => router.push('/venues/management')}
              >
                New Venue
              </Button>
            </>
          )}

          {/* Mobile: Event Details View */}
          {selectedVenueId && (
            <>
              <Button
                variant="flat"
                radius="full"
                startContent={<ChevronLeft className="w-4 h-4" />}
                onPress={() => setSelectedVenueId(null)}
                className="mb-4 text-md"
              >
                Back to Venues
              </Button>

              <div className="mb-6">
                <h1 className="text-2xl font-bold mb-2">
                  {venues.find(v => v.id === selectedVenueId)?.name}
                </h1>
                <Button
                  size="lg"
                  radius="full"
                  startContent={<Play className="w-5 h-5" />}
                  className="w-full bg-accent hover:bg-accent/90 text-surface-light"
                  onPress={() => handleStartNewEvent(selectedVenueId)}
                  isLoading={isStartingEvent}
                  isDisabled={isStartingEvent || !canStartEventAt(venues.find(v => v.id === selectedVenueId))}
                >
                  Start New Event
                </Button>
                {!isStartingEvent && !canStartEventAt(venues.find(v => v.id === selectedVenueId)) && (
                  <p className="text-xs text-surface-light/60 mt-1">Only this venue&apos;s owner can start a new event here.</p>
                )}
              </div>

              <h2 className="text-lg font-semibold mb-3">Recent Events</h2>
              
              {selectedVenueEvents.length === 0 ? (
                <Card classNames={{ base: "rounded-sm bg-surface-deep/50 w-full" }}>
                  <CardBody className="text-center py-8 text-surface-light">
                    No events yet. Start your first event at this venue!
                  </CardBody>
                </Card>
              ) : (
                <div className="minimal-scrollbar space-y-3 max-h-[32rem] overflow-y-auto pr-2">
                  {selectedVenueEvents.map((event) => {
                    const ended = isEventEnded(event, nowTick);
                    const destination = ended ? `/events/${event.id}/summary` : `/events/${event.id}/dispatch`;
                    return (
                    <Card
                      key={event.id}
                      isPressable
                      onPress={() => router.push(destination)}
                      classNames={{
                        base: "rounded-sm bg-surface-deep/50 backdrop-blur-sm w-full"
                      }}
                    >
                      <CardBody className="p-4">
                        <div className="flex justify-between items-start w-full">
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-lg mb-2 truncate">{event.name || 'Untitled Event'}</h3>

                            <div className="space-y-1 text-sm text-surface-light">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4" />
                                {formatEventDate(event.date)}
                              </div>
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4" />
                                {event.staff?.length || 0} teams
                              </div>
                              <div className="flex items-center gap-2">
                                <Phone className="w-4 h-4" />
                                {event.calls?.length || 0} calls
                              </div>
                            </div>

                            {event.status === 'draft' && (
                              <Chip size="sm" variant="flat" className="mt-2 bg-status-orange/20 text-status-orange">Draft</Chip>
                            )}
                            {event.isOrgEvent && (
                              <Chip size="sm" variant="flat" className="mt-2 bg-accent/20 text-accent">Org</Chip>
                            )}
                            {ended ? (
                              <Chip size="sm" variant="flat" className="mt-2 bg-status-red/20 text-status-red">Ended</Chip>
                            ) : (
                              <Chip size="sm" variant="flat" className="mt-2 bg-status-green/20 text-status-green">Active</Chip>
                            )}
                          </div>

                          <div
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => e.stopPropagation()}
                          >
                            <Dropdown placement="bottom-end" offset={6}>
                              <DropdownTrigger>
                                <button
                                  className="p-0 m-0 border-0 bg-transparent text-surface-light hover:text-status-blue transition-colors cursor-pointer flex items-center justify-center"
                                  aria-label="Event actions"
                                  type="button"
                                >
                                  <MoreVertical className="w-4 h-4" />
                                </button>
                              </DropdownTrigger>
                              <DropdownMenu aria-label="Event actions" disabledKeys={canManageEvent(event) ? [] : ['share', 'delete']}>
                                <DropdownItem
                                  key="resume"
                                  startContent={<Play className="w-4 h-4" />}
                                  onPress={() => router.push(destination)}
                                >
                                  {ended ? 'View Summary' : 'Resume'}
                                </DropdownItem>
                                <DropdownItem
                                  key="share"
                                  startContent={<Share2 className="w-4 h-4" />}
                                  description={canManageEvent(event) ? undefined : 'Only the owner or an admin can share'}
                                  onPress={() => setShareModalData({
                                    id: event.id,
                                    name: event.name || 'Untitled',
                                    type: 'events',
                                    sharedWith: event.sharedWith || []
                                  })}
                                >
                                  Share
                                </DropdownItem>
                                {isAdmin ? (
                                  <DropdownItem
                                    key="org"
                                    startContent={<Building2 className="w-4 h-4" />}
                                    onPress={() => handleToggleOrgEvent(event)}
                                  >
                                    {event.isOrgEvent ? 'Remove from org events' : 'Designate as org event'}
                                  </DropdownItem>
                                ) : null}
                                <DropdownItem
                                  key="delete"
                                  className="text-danger"
                                  color="danger"
                                  startContent={<Trash2 className="w-4 h-4" />}
                                  description={canManageEvent(event) ? undefined : 'Only the owner or an admin can delete'}
                                  onPress={() => handleDeleteEvent(event.id)}
                                >
                                  Delete
                                </DropdownItem>
                              </DropdownMenu>
                            </Dropdown>
                          </div>
                        </div>
                      </CardBody>
                    </Card>
                  );})}
                </div>
              )}
            </>
          )}
        </div>

        {/* Modals */}
        {shareModalData && (
        <ShareModal
          isOpen={!!shareModalData}
          onClose={() => setShareModalData(null)}
          resourceId={shareModalData.id}
          resourceName={shareModalData.name}
          collectionName={shareModalData.type}
          currentSharedWith={
            shareModalData.type === 'venues'
              ? venues.find(v => v.id === shareModalData.id)?.sharedWith || []
              : recentEvents.find(e => e.id === shareModalData.id)?.sharedWith || []
          }
          onUpdate={() => {
          }}
        />
      )}
      </main>
    );
  }

  // Desktop View - Master-Detail Pattern
  return (
    <main className="relative bg-surface-deepest text-surface-light h-[calc(100vh-3.5rem)]">
      <div className="relative z-10 pt-10 px-6">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Venue Selection</h1>
            <p className="text-lg text-surface-light">
              Select a venue to view past events or start a new one
            </p>
          </div>

          <div className="flex gap-6 h-[calc(100vh-360px)]">
            {/* LEFT SIDEBAR - Venue List */}
            <div className="w-72 min-w-[200px] flex-shrink flex flex-col min-h-[calc(100vh-16rem)]">
              <div className="mb-4">
                <Button
                  size="lg"
                  radius="full"
                  startContent={<Plus className="w-5 h-5" />}
                  className="w-full bg-accent hover:bg-accent/90 text-surface-light"
                  onPress={() => router.push('/venues/management')}
                >
                  New Venue
                </Button>
              </div>

              <Input
                placeholder="Search venues..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                startContent={<Search className="w-4 h-4 text-surface-light" />}
                variant="flat"
                color="default"
                classNames={{
                  base: "mb-4",
                  inputWrapper: "bg-surface-deep",
                  input: "outline-none focus:outline-none data-[focus=true]:outline-none"
                }}
              />

              <ScrollShadow className="minimal-scrollbar flex-1 space-y-2 pr-2">
                {filteredVenues.map((venue) => {
                  const stats = venueStats.byVenue[venue.id] ?? { count: 0, lastUsed: null };
                  const isSelected = selectedVenueId === venue.id;

                  return (
                    <Card
                      key={venue.id}
                      classNames={{
                        base: `rounded-sm ${isSelected
                          ? 'bg-status-blue/20'
                          : 'bg-surface-deep/50 hover:bg-surface-deep'
                        } backdrop-blur-sm transition-all w-full`
                      }}
                    >
                      <div 
                        className="relative cursor-pointer"
                        onClick={() => setSelectedVenueId(venue.id)}
                      >
                        <CardBody className="pl-3 pr-1 relative">
                        <div className="pr-8">
                          <div className="flex items-center gap-2 mb-1">
                            <MapPin className={`w-4 h-4 flex-shrink-0 ${isSelected ? 'text-status-blue' : 'text-surface-light'}`} />
                            <h3 className="font-semibold text-sm truncate min-w-0">{venue.name}</h3>
                            {venue.isOrgVenue && (
                              <Chip size="sm" variant="flat" className="bg-accent/20 text-accent flex-shrink-0">
                                Org
                              </Chip>
                            )}
                          </div>
                          <div className="text-xs text-surface-light">
                            {stats.count} {stats.count === 1 ? 'event' : 'events'}
                          </div>
                          <div className="text-xs text-surface-light mt-1">
                            {formatRelativeDate(stats.lastUsed)}
                          </div>
                        </div>
                        </CardBody>
                        
                        <div 
                          className="absolute top-3 right-3 z-10"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Dropdown placement="bottom-end" offset={6}>
                            <DropdownTrigger>
                              <button
                                className="p-0 m-0 border-0 bg-transparent text-surface-light hover:text-status-blue transition-colors cursor-pointer flex items-center justify-center"
                                aria-label="Venue actions"
                                type="button"
                              >
                                <MoreVertical className="w-4 h-4" />
                              </button>
                            </DropdownTrigger>
                            <DropdownMenu aria-label="Venue actions" disabledKeys={canManageVenue(venue) ? [] : ['edit', 'share', 'delete']}>
                              <DropdownItem
                                key="edit"
                                startContent={<Edit className="w-4 h-4" />}
                                description={canManageVenue(venue) ? undefined : 'Only the owner or an admin can edit'}
                                onPress={() => router.push(`/venues/management?venueId=${venue.id}`)}
                              >
                                Edit
                              </DropdownItem>
                              <DropdownItem
                                key="share"
                                startContent={<Share2 className="w-4 h-4" />}
                                description={canManageVenue(venue) ? undefined : 'Only the owner or an admin can share'}
                                onPress={() => setShareModalData({
                                  id: venue.id,
                                  name: venue.name,
                                  type: 'venues',
                                  sharedWith: venue.sharedWith || []
                                })}
                              >
                                Share Venue
                              </DropdownItem>
                              <DropdownItem
                                key="delete"
                                className="text-danger"
                                color="danger"
                                startContent={<Trash2 className="w-4 h-4" />}
                                description={canManageVenue(venue) ? undefined : 'Only the owner or an admin can delete'}
                                onPress={() => handleDeleteVenue(venue.id)}
                              >
                                Delete
                              </DropdownItem>
                            </DropdownMenu>
                          </Dropdown>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </ScrollShadow>
            </div>

            {/* RIGHT PANEL - Event Table/Details */}
            <div className="flex-1 flex flex-col min-h-[calc(100vh-16rem)]">
              {!selectedVenueId ? (
                <Card classNames={{ base: "rounded-sm flex-1 bg-surface-deep/50" }}>
                  <CardBody className="flex items-center justify-center">
                    <div className="text-center text-surface-light">
                      <MapPin className="w-16 h-16 mx-auto mb-4 opacity-50" />
                      <p className="text-lg">Select a venue to view its events</p>
                      <p className="text-sm mt-2">or create a new venue to get started</p>
                    </div>
                  </CardBody>
                </Card>
              ) : (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold">
                        {venues.find(v => v.id === selectedVenueId)?.name}
                      </h2>
                      <p className="text-sm text-surface-light">
                        {selectedVenueEvents.length} {selectedVenueEvents.length === 1 ? 'event' : 'events'} recorded
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Button
                        size="lg"
                        radius="full"
                        startContent={<Play className="w-5 h-5" />}
                        className="bg-accent hover:bg-accent/90 text-surface-light"
                        onPress={() => handleStartNewEvent(selectedVenueId)}
                        isLoading={isStartingEvent}
                        isDisabled={isStartingEvent || !canStartEventAt(venues.find(v => v.id === selectedVenueId))}
                      >
                        Start New Event
                      </Button>
                      {!isStartingEvent && !canStartEventAt(venues.find(v => v.id === selectedVenueId)) && (
                        <p className="text-xs text-surface-light/60">Only this venue&apos;s owner can start a new event here.</p>
                      )}
                    </div>
                  </div>

                  <Card classNames={{ base: "rounded-sm flex-1 bg-surface-deep/50 overflow-hidden" }}>
                    <CardBody className="p-0">
                      {selectedVenueEvents.length === 0 ? (
                        <div className="flex items-center justify-center h-full text-surface-light">
                          <div className="text-center">
                            <Calendar className="w-16 h-16 mx-auto mb-4 opacity-50" />
                            <p className="text-lg">No events yet</p>
                            <p className="text-sm mt-2">Start your first event at this venue!</p>
                          </div>
                        </div>
                      ) : (
                        <div className="minimal-scrollbar overflow-auto h-full min-w-[500px]">
                          <table className="w-full table-fixed border-separate border-spacing-0">
                            <colgroup>
                              <col className="w-[30%]" />
                              <col className="w-[16%]" />
                              <col className="w-[12%]" />
                              <col className="w-[12%]" />
                              <col className="w-[16%]" />
                              <col className="w-[14%]" />
                            </colgroup>
                            <thead className="sticky top-0 bg-surface-deep">
                              <tr className="border-b border-surface-liner">
                                <th className="text-left px-4 py-4 text-sm font-semibold uppercase tracking-wide text-surface-light/60">Event Name</th>
                                <th className="text-left px-4 py-4 text-sm font-semibold uppercase tracking-wide text-surface-light/60">Date</th>
                                <th className="text-left px-4 py-4 text-sm font-semibold uppercase tracking-wide text-surface-light/60">Teams</th>
                                <th className="text-left px-4 py-4 text-sm font-semibold uppercase tracking-wide text-surface-light/60">Calls</th>
                                <th className="text-left px-4 py-4 text-sm font-semibold uppercase tracking-wide text-surface-light/60">Status</th>
                                <th className="text-right px-4 py-4 text-sm font-semibold uppercase tracking-wide text-surface-light/60">Actions</th>
                              </tr>
                            </thead>
                            <tbody className="[&>tr>td]:border-b [&>tr>td]:border-surface-liner">
                              {selectedVenueEvents.map((event) => {
                                const ended = isEventEnded(event, nowTick);
                                const destination = ended ? `/events/${event.id}/summary` : `/events/${event.id}/dispatch`;
                                return (
                                <tr
                                  key={event.id}
                                  className="hover:bg-surface-deep cursor-pointer transition-colors"
                                  onClick={() => router.push(destination)}
                                >
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="font-medium truncate">{event.name || 'Untitled Event'}</span>
                                      {event.isOrgEvent && (
                                        <Chip size="sm" variant="flat" className="bg-accent/20 text-accent flex-shrink-0">Org</Chip>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-surface-light">
                                    <div className="flex items-center gap-2">
                                      <Calendar className="w-4 h-4 flex-shrink-0" />
                                      <span className="truncate">{formatEventDate(event.date)}</span>
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-surface-light">
                                    <div className="flex items-center gap-2">
                                      <Users className="w-4 h-4 flex-shrink-0" />
                                      {event.staff?.length || 0}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3 text-surface-light">
                                    <div className="flex items-center gap-2">
                                      <Phone className="w-4 h-4 flex-shrink-0" />
                                      {event.calls?.length || 0}
                                    </div>
                                  </td>
                                  <td className="px-4 py-3">
                                    {ended ? (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          router.push(`/events/${event.id}/summary`);
                                        }}
                                        className="text-sm font-medium text-accent hover:text-accent/80 underline underline-offset-2"
                                      >
                                        Event Summary
                                      </button>
                                    ) : (
                                      <Chip size="sm" variant="flat" className="bg-status-green/20 text-status-green">
                                        Active
                                      </Chip>
                                    )}
                                  </td>
                                  <td className="px-4 py-3 text-right">
                                    <div
                                      onClick={(e) => e.stopPropagation()}
                                      onKeyDown={(e) => e.stopPropagation()}
                                    >
                                      <Dropdown placement="bottom-end" offset={6}>
                                        <DropdownTrigger>
                                          <button
                                            className="p-0 m-0 border-0 bg-transparent text-surface-light hover:text-status-blue transition-colors cursor-pointer flex items-center justify-center ml-auto"
                                            aria-label="Event actions"
                                            type="button"
                                          >
                                            <MoreVertical className="w-4 h-4" />
                                          </button>
                                        </DropdownTrigger>
                                        <DropdownMenu aria-label="Event actions" disabledKeys={canManageEvent(event) ? [] : ['share', 'delete']}>
                                          <DropdownItem
                                            key="resume"
                                            startContent={<Play className="w-4 h-4" />}
                                            onPress={() => router.push(destination)}
                                          >
                                            {ended ? 'View Summary' : 'Resume Event'}
                                          </DropdownItem>
                                          <DropdownItem
                                            key="share"
                                            startContent={<Share2 className="w-4 h-4" />}
                                            description={canManageEvent(event) ? undefined : 'Only the owner or an admin can share'}
                                            onPress={() => setShareModalData({
                                              id: event.id,
                                              name: event.name || 'Untitled',
                                              type: 'events',
                                              sharedWith: event.sharedWith || []
                                            })}
                                          >
                                            Share Event
                                          </DropdownItem>
                                          {isAdmin ? (
                                            <DropdownItem
                                              key="org"
                                              startContent={<Building2 className="w-4 h-4" />}
                                              onPress={() => handleToggleOrgEvent(event)}
                                            >
                                              {event.isOrgEvent ? 'Remove from org events' : 'Designate as org event'}
                                            </DropdownItem>
                                          ) : null}
                                          <DropdownItem
                                            key="delete"
                                            className="text-danger"
                                            color="danger"
                                            startContent={<Trash2 className="w-4 h-4" />}
                                            description={canManageEvent(event) ? undefined : 'Only the owner or an admin can delete'}
                                            onPress={() => handleDeleteEvent(event.id)}
                                          >
                                            Delete
                                          </DropdownItem>
                                        </DropdownMenu>
                                      </Dropdown>
                                    </div>
                                  </td>
                                </tr>
                              );})}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardBody>
                  </Card>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {shareModalData && (
        <ShareModal
          isOpen={!!shareModalData}
          onClose={() => setShareModalData(null)}
          resourceId={shareModalData.id}
          resourceName={shareModalData.name}
          collectionName={shareModalData.type}
          currentSharedWith={
            shareModalData.type === 'venues'
              ? venues.find(v => v.id === shareModalData.id)?.sharedWith || []
              : recentEvents.find(e => e.id === shareModalData.id)?.sharedWith || []
          }
          onUpdate={() => {
          }}
        />
      )}
    </main>
  );
}

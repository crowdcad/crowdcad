// A new event is built at /events/new/create?venueId=… and only written to the
// database when the builder's "Create Event" is pressed, so backing out of
// setup never leaves an empty event behind.
export const NEW_EVENT_ID = 'new';

export const newEventCreatePath = (venueId: string) =>
  `/events/${NEW_EVENT_ID}/create?venueId=${encodeURIComponent(venueId)}`;

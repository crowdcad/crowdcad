import type { Event } from '@/app/types';
import { addCall, setTeamStatus } from '../actions';
import { festivalBoardAfter, POSTS } from '../fixtures';
import type { TrainingModule } from '../types';

const surgeStarted = (e: Event, at: number): Event => ({
  ...e,
  manualSurgeActive: true,
  manualSurgeStartedAt: at,
  surgeLog: [...(e.surgeLog || []), { startedAt: at }],
});

const surgeEnded = (e: Event, at: number): Event => {
  const log = e.surgeLog || [];
  return {
    ...e,
    manualSurgeActive: false,
    manualSurgeStartedAt: undefined,
    surgeLog: log.map((p, i) => (i === log.length - 1 && p.endedAt === undefined ? { ...p, endedAt: at } : p)),
  };
};

/** A busy stretch: three teams out, then surge on and off, then finding what happened in the Log. */
const surgeAndLog: TrainingModule = {
  id: 'surge-and-log',
  version: 1,
  track: 'dispatcher',
  title: 'Busy moments: surge and the Log',
  summary: "Check how busy your teams are, record a surge and find what happened in the Log.",
  release: 'stable',
  // Three of five teams already out on calls (60%, just under the 70% limit, so the board doesn't surge by itself).
  seed: () =>
    festivalBoardAfter('surge-and-log', (e) => {
      const t = Date.now() - 6 * 60 * 1000;
      let next = addCall(e, { location: POSTS.mainStage, chiefComplaint: 'Fall', assignedTeam: 'Team 1' }, t);
      next = addCall(next, { location: POSTS.gateA, chiefComplaint: 'Dehydration', assignedTeam: 'Team 2' }, t + 60_000);
      next = addCall(next, { location: POSTS.foodCourt, chiefComplaint: 'Allergic reaction', assignedTeam: 'Team 4' }, t + 120_000);
      next = setTeamStatus(next, POSTS.mainStage, 'Team 1', 'On Scene', t + 180_000);
      return setTeamStatus(next, POSTS.foodCourt, 'Team 4', 'On Scene', t + 200_000);
    }),
  practice: [
    'Switch the Log filter to show only one kind of entry.',
    'Log a new call and send Team 5: watch the strip cross the surge limit and surge switch on by itself.',
  ],
  steps: [
    {
      id: 'intro',
      section: 'How stretched are we?',
      title: 'A busy stretch',
      body: "Three of your five {{Teams}} are out on calls. Check how many you have left.",
      estSec: 15,
    },
    {
      id: 'strip',
      section: 'How stretched are we?',
      title: 'Read the strip',
      body: "**3** teams are on calls and **2** are available, so 60% are busy. At 70% the bar turns red and surge turns on by itself.",
      anchor: 'availability-surge-strip',
      placement: 'right',
      estSec: 20,
      intents: ['how busy', 'units available', 'surge limit', 'percent on calls'],
      liveSafe: true,
    },
    {
      id: 'surge-on',
      section: 'Surge',
      title: 'Start a surge',
      body: "Your supervisor says there are more calls than teams can handle. Click **Surge** and confirm. The start time is recorded for the event summary.",
      anchor: 'surge-toggle-button',
      placement: 'bottom',
      estSec: 20,
      intents: ['start surge', 'declare surge', 'overwhelmed'],
      done: (e) => !!e.manualSurgeActive,
      apply: (e) => surgeStarted(e, Date.now()),
      liveSafe: true,
    },
    {
      id: 'surge-off',
      section: 'Surge',
      title: 'End the surge',
      body: "Things have calmed down. Click the same button again and confirm to end the surge.",
      anchor: 'surge-toggle-button',
      placement: 'bottom',
      estSec: 15,
      intents: ['end surge', 'stop surge'],
      done: (e) => !e.manualSurgeActive && (e.surgeLog || []).some((p) => p.endedAt !== undefined),
      apply: (e) => surgeEnded(e, Date.now()),
    },
    {
      id: 'open-log',
      section: 'The Log',
      title: 'Open the Log',
      body: "Open the menu at the top of the left side and choose **{{Log}}**.",
      anchors: ['left-panel-option-log', 'left-panel-select'],
      placement: 'right',
      estSec: 15,
      doneWhenVisible: 'event-log',
      doClicks: ['left-panel-select', 'left-panel-option-log'],
      intents: ['event log', 'what happened', 'history of a call', 'activity log'],
      liveSafe: true,
    },
    {
      id: 'search-log',
      section: 'The Log',
      title: 'Search it',
      body: "The Log lists everything that happened, newest first, including your surge. Type `Gate A` in the search box to see only what happened there.",
      anchor: 'event-log-search',
      placement: 'right',
      estSec: 25,
      intents: ['search log', 'find entry', 'when did team'],
      liveSafe: true,
    },
    {
      id: 'filter-log',
      section: 'The Log',
      title: 'Filter it',
      body: "This button shows only some kinds of entries, like calls or teams. Searching and filtering don't change anything on the board.",
      anchor: 'event-log-filter',
      placement: 'right',
      estSec: 15,
      intents: ['filter log'],
      liveSafe: true,
    },
  ],
};

export default surgeAndLog;

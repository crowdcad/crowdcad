import { addCall, assignTeam, findCall, setTeamStatus } from '../actions';
import { POSTS, trainingBoardAfter } from '../fixtures';
import type { TrainingModule } from '../types';

const tab = (key: string) => `css:[data-slot="tab"][data-key="${key}"]`;
const tabOpen = (key: string) => `css:[data-slot="tab"][data-key="${key}"][aria-selected="true"]`;
const LOCATION = POSTS.satherGate;

/** The dispatch interface on a phone: the same board, in tabs along the bottom. */
const mobileTour: TrainingModule = {
  id: 'mobile-tour',
  version: 1,
  track: 'dispatcher',
  title: 'Dispatch on a phone',
  summary: 'Where teams, equipment, calls, clinics and the map are when you dispatch from a phone.',
  release: 'stable',
  device: 'phone',
  // A call already running, so the calls tab has something on it.
  seed: () =>
    trainingBoardAfter('mobile-tour', (e) => {
      const t = Date.now() - 5 * 60 * 1000;
      const next = addCall(e, { location: POSTS.lowerSproul, source: 'Radio', chiefComplaint: 'Ankle injury' }, t);
      return setTeamStatus(assignTeam(next, POSTS.lowerSproul, 'MRC1', t + 30_000), POSTS.lowerSproul, 'MRC1', 'On Scene', t + 120_000);
    }),
  practice: ['Assign MRC3 to the Sather Gate call from its card.', 'Switch the teams list to Supervisors and change Sup 1’s status.', 'Open the map and find MRC1.'],
  steps: [
    {
      id: 'intro',
      section: 'Find your way around',
      title: 'Look at the layout',
      body: 'This is the dispatch interface on a phone. It has everything the computer layout has, one section at a time: the icons along the bottom switch between teams, equipment, calls, clinics and the map.',
      estSec: 20,
      intents: ['phone layout', 'mobile dispatch', 'dispatch on a phone'],
    },
    {
      id: 'availability',
      section: 'Find your way around',
      title: 'Look at the availability bar',
      body: 'The bar at the top shows how many {{teams}} are free. It turns red when a pre-designated percentage of teams are on calls.',
      anchor: 'availability-surge-strip',
      placement: 'bottom',
      estSec: 15,
    },
    {
      id: 'teams',
      section: 'Find your way around',
      title: 'Look at the teams list',
      body: 'Each {{team}} card shows its status, {{location}} and how long it has been in that status. MRC1 is on scene at Lower Sproul.',
      anchors: ['team-card-condensed-MRC1', 'team-card-MRC1'],
      placement: 'bottom',
      estSec: 15,
    },
    {
      id: 'teams-menu',
      section: 'Find your way around',
      title: 'Switch the list',
      body: 'This menu switches the list between teams, supervisors and the log.',
      anchor: 'mobile-teams-subtab',
      placement: 'bottom',
      estSec: 10,
    },
    {
      id: 'equipment',
      section: 'Find your way around',
      title: 'Open equipment',
      body: 'Tap the bag icon at the bottom to see where each piece of equipment is.',
      anchor: tab('equipment'),
      placement: 'top',
      estSec: 10,
      doneWhenVisible: tabOpen('equipment'),
    },
    {
      id: 'calls',
      section: 'Calls',
      title: 'Open calls',
      body: 'Tap the radio icon to open the calls.',
      anchor: tab('calls'),
      placement: 'top',
      estSec: 10,
      doneWhenVisible: tabOpen('calls'),
      intents: ['calls on phone'],
    },
    {
      id: 'call-card',
      section: 'Calls',
      title: 'Look at a call card',
      body: 'Each open {{call}} is a card with its {{location}}, {{teams}} and status. Tap a card to open its details.',
      anchor: 'call-card-1',
      placement: 'bottom',
      estSec: 15,
    },
    {
      id: 'open-add-call',
      section: 'Calls',
      title: 'Open Add Call',
      body: 'Someone radios in from Sather Gate. Tap **{{Add Call}}**.',
      anchor: 'mobile-add-call',
      placement: 'bottom',
      estSec: 10,
      doneWhenVisible: 'quick-call-modal',
    },
    {
      id: 'add-call',
      section: 'Calls',
      title: 'Add a call',
      body: 'It is the same form as on a computer. Type {{Location}} `Sather Gate`, {{Source}} `Radio` and {{Chief Complaint}} `Dizzy`, then tap **Submit**.',
      anchors: ['quick-call-modal', 'mobile-add-call'],
      placement: 'bottom',
      estSec: 45,
      values: ['Sather Gate', 'Radio', 'Dizzy'],
      done: (e) => !!findCall(e, LOCATION),
      apply: (e) => addCall(e, { location: LOCATION, source: 'Radio', chiefComplaint: 'Dizzy' }),
    },
    {
      id: 'clinic',
      section: 'Clinics and map',
      title: 'Open clinics',
      body: 'Tap the house icon for the clinic patients. The menu at the top picks the clinic.',
      anchor: tab('clinic'),
      placement: 'top',
      estSec: 10,
      doneWhenVisible: tabOpen('clinic'),
    },
    {
      id: 'map',
      section: 'Clinics and map',
      title: 'Open the map',
      body: 'Tap the map icon to see posts, {{teams}} and equipment on the venue map.',
      anchor: tab('map'),
      placement: 'top',
      estSec: 10,
      doneWhenVisible: tabOpen('map'),
    },
    {
      id: 'help',
      section: 'Clinics and map',
      title: 'Get help on a phone',
      body: 'During a live event, the **?** button in the top bar opens Help, with links to these tutorials. That is the phone layout.',
      // The player's own ? is the same button; inside the computer's phone frame there is none, and the card stands alone.
      anchor: 'help-button',
      placement: 'bottom',
      estSec: 10,
    },
  ],
};

export default mobileTour;

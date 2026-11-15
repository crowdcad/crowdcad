import type { Event } from '@/app/types';
import { getVenueZones } from '@/lib/zones';
import { clearZonePatch, declareMci, deriveMci, isMciActive, movePatch, standDownMci, tagPatch, transportPatch, type MciWrite } from '@/lib/mci';
import { CLINIC_ID, festivalBoard, POSTS } from '../fixtures';
import type { TrainingModule } from '../types';

const ZONE = 'North Lawn';
const AREA = POSTS.firstAid;

const ctx = () => ({ now: Date.now() });
const patched = (event: Event, write: MciWrite): Event => ({ ...event, ...write.patch });
const zoneStats = (event: Event) => deriveMci(event).zones.find((z) => z.zone.name === ZONE);
const areaStats = (event: Event) => deriveMci(event).areas.find((a) => a.name === AREA || a.area.clinicId === CLINIC_ID);
const zoneId = (event: Event) => event.mci?.zones.find((z) => z.name === ZONE)?.id ?? '';
const areaId = (event: Event) => areaStats(event)?.area.id ?? CLINIC_ID;

/** Mass casualty incident, start to finish, from the dispatcher's board. */
const mciResponse: TrainingModule = {
  id: 'mci-response',
  version: 1,
  track: 'mci',
  title: 'MCI response: declare, count, move, transport',
  summary: 'Declare a mass casualty incident, count patients by triage color in a zone, move them to treatment, send an ambulance and stand down.',
  release: 'preview',
  seed: () => festivalBoard('mci-response'),
  practice: [
    'Declare a new MCI with a treatment location of your own, then tag and quick-move patients one at a time with the small + in the Moved column.',
    'Fill in a patient box (age, sex, chief complaint) in the First Aid Tent and give it a transport priority.',
    'Open the Logistics tab and add a hospital, then transport patients to it.',
  ],
  steps: [
    {
      id: 'intro',
      section: 'Declare',
      title: 'The scenario',
      body: 'A barrier collapses at the front of the **North Lawn** crowd. Triage teams are reporting several injured. You will declare an MCI, count patients as teams tag them, move them to the First Aid Tent and send them to hospital.',
      estSec: 20,
    },
    {
      id: 'open-declare',
      section: 'Declare',
      title: 'Open Declare MCI',
      body: 'Click **Declare MCI**.',
      anchor: 'mci-declare-button',
      placement: 'bottom',
      estSec: 10,
      doneWhenVisible: 'mci-declare-modal',
      intents: ['declare mci', 'mass casualty', 'start mci', 'multiple patients'],
      liveSafe: true,
    },
    {
      id: 'declare',
      section: 'Declare',
      title: 'Zones and treatment',
      body: 'Tick **North Lawn** and **South Lawn** as zones: they are where patients are found and tagged. The **First Aid Tent** is already ticked as a treatment location. Click **Declare MCI**.',
      anchors: ['mci-declare-modal', 'mci-declare-button'],
      placement: 'left',
      estSec: 40,
      intents: ['mci zones', 'treatment location'],
      done: (e) => isMciActive(e) && !!zoneStats(e),
      apply: (e) => {
        const zones = getVenueZones(e.venue).map((z) => ({ id: z.id, name: z.name, venueZoneId: z.id }));
        return { ...e, ...declareMci(e, { zones, areas: [{ id: CLINIC_ID, name: AREA, clinicId: CLINIC_ID }], trackPatients: true }, Date.now()) };
      },
    },
    {
      id: 'tag-red',
      section: 'Count patients',
      title: 'Tag three red',
      body: 'Triage reports **3 red** (immediate) patients on the North Lawn. Click the **+** on the red row three times.',
      anchor: `mci-zone-${ZONE}-red-add`,
      placement: 'right',
      estSec: 20,
      intents: ['tag patients', 'count patients', 'triage count', 'add red patient'],
      done: (e) => (zoneStats(e)?.tagged.red ?? 0) >= 3,
      apply: (e) => patched(e, tagPatch(e, zoneId(e), 'red', 3 - (zoneStats(e)?.tagged.red ?? 0), ctx())),
    },
    {
      id: 'tag-yellow',
      section: 'Count patients',
      title: 'Tag two yellow',
      body: 'And **2 yellow** (delayed). Click the **+** on the yellow row twice.',
      anchor: `mci-zone-${ZONE}-yellow-add`,
      placement: 'right',
      estSec: 15,
      done: (e) => (zoneStats(e)?.tagged.yellow ?? 0) >= 2,
      apply: (e) => patched(e, tagPatch(e, zoneId(e), 'yellow', 2 - (zoneStats(e)?.tagged.yellow ?? 0), ctx())),
    },
    {
      id: 'in-zone',
      section: 'Count patients',
      title: 'Still in the zone',
      body: 'The right-hand column counts patients still lying in the zone: tagged, not yet moved. It is what tells you whether the zone needs more hands.',
      anchor: `mci-zone-${ZONE}-inzone-total`,
      placement: 'left',
      estSec: 15,
    },
    {
      id: 'open-move',
      section: 'Move to treatment',
      title: 'Move to treatment',
      body: 'Teams are carrying all five to the First Aid Tent. Click **Move to treatment** on the North Lawn card.',
      anchor: `mci-zone-move-${ZONE}`,
      placement: 'top',
      estSec: 10,
      doneWhenVisible: 'mci-move-modal',
      intents: ['move patients', 'move to treatment'],
      liveSafe: true,
    },
    {
      id: 'move',
      section: 'Move to treatment',
      title: 'Confirm the move',
      body: 'The counts start at everyone still in the zone, going to the First Aid Tent. Click **Move**.',
      anchors: ['mci-move-confirm', `mci-zone-move-${ZONE}`],
      placement: 'top',
      estSec: 15,
      done: (e) => (zoneStats(e)?.movedTotal ?? 0) >= 5,
      apply: (e) => patched(e, movePatch(e, zoneId(e), areaId(e), { red: 3, yellow: 2 }, ctx())),
    },
    {
      id: 'clear-zone',
      section: 'Move to treatment',
      title: 'Mark the zone clear',
      body: 'Nobody is left on the North Lawn. Click **Clear?** on its card so everyone knows it has been swept.',
      anchor: `mci-zone-clear-${ZONE}`,
      placement: 'bottom',
      estSec: 10,
      intents: ['zone clear', 'mark zone clear'],
      done: (e) => !!zoneStats(e)?.cleared,
      apply: (e) => patched(e, clearZonePatch(e, zoneId(e), ctx())),
      liveSafe: true,
    },
    {
      id: 'open-transport',
      section: 'Transport',
      title: 'An ambulance arrives',
      body: 'An ambulance pulls up at the First Aid Tent. Click **Transport** on the First Aid Tent card.',
      anchor: `mci-area-transport-${AREA}`,
      placement: 'top',
      estSec: 10,
      doneWhenVisible: 'mci-transport-modal',
      intents: ['transport mci patients', 'ambulance', 'send to hospital'],
      liveSafe: true,
    },
    {
      id: 'transport',
      section: 'Transport',
      title: 'Send two reds',
      body: 'Type ambulance `A14`, pick **two red** patients, type destination `County General`, then confirm. Reds go first: the list is already in transport order.',
      anchors: ['mci-transport-modal', `mci-area-transport-${AREA}`],
      placement: 'left',
      estSec: 45,
      values: ['A14', 'County General'],
      done: (e) => (areaStats(e)?.transported.red ?? 0) >= 2,
      apply: (e) => patched(e, transportPatch(e, areaId(e), { red: 2 }, { unit: 'A14', destination: 'County General' }, ctx())),
    },
    {
      id: 'stand-down',
      section: 'Stand down',
      title: 'Stand down',
      body: 'Once the scene is handled, click **Stand down** on the MCI tab and confirm. Teams in Triage or Treatment go back to Available, and the patients still in treatment move to the clinic tracker. The counts are kept for the summary.',
      anchor: 'mci-stand-down',
      placement: 'bottom',
      estSec: 20,
      intents: ['stand down mci', 'end mci'],
      // Standing down writes the board's own text (the clinic tracker rows it imports), so the gate is off here.
      free: true,
      done: (e) => !!e.mci && !isMciActive(e),
      apply: (e) => ({ ...e, ...standDownMci(e, Date.now()) }),
      liveSafe: true,
    },
  ],
};

export default mciResponse;

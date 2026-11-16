import type { Event } from '@/app/types';
import { getVenueZones } from '@/lib/zones';
import { clearZonePatch, declareMci, deriveMci, isMciActive, movePatch, standDownMci, tagPatch, transportPatch, type MciWrite } from '@/lib/mci';
import { CLINIC_ID, CLINICS, trainingBoard, POSTS } from '../fixtures';
import type { TrainingModule } from '../types';

const ZONE = 'South Zone';
const AREA = POSTS.clinic;

const ctx = () => ({ now: Date.now() });
const patched = (event: Event, write: MciWrite): Event => ({ ...event, ...write.patch });
const zoneStats = (event: Event) => deriveMci(event).zones.find((z) => z.zone.name === ZONE);
const areaStats = (event: Event) => deriveMci(event).areas.find((a) => a.name === AREA || a.area.clinicId === CLINIC_ID);
const zoneId = (event: Event) => event.mci?.zones.find((z) => z.name === ZONE)?.id ?? '';
const areaId = (event: Event) => areaStats(event)?.area.id ?? CLINIC_ID;

/** Mass casualty incident, start to finish, from the dispatcher's board. */
const mciResponse: TrainingModule = {
  id: 'mci-response',
  version: 3,
  track: 'mci',
  title: 'Declare and run an MCI',
  summary: "Declare an MCI, count patients by triage color, move them to treatment, send an ambulance and end the MCI.",
  release: 'preview',
  seed: () => trainingBoard('mci-response'),
  practice: [
    'Declare a new MCI with a treatment location of your own, then tag and quick-move patients one at a time with the small + in the Moved column.',
    'Fill in a patient box (age, sex, chief complaint) in the Dwinelle Tent and give it a transport priority.',
    'Open the Logistics tab and add a hospital, then transport patients to it.',
  ],
  steps: [
    {
      id: 'intro',
      section: 'Declare an MCI',
      title: 'Read the scenario',
      body: "A railing gives way near Sather Gate in the **South Zone** and several people are hurt. You will declare an MCI, count patients, move them to the Dwinelle Tent and send them to hospital.",
      estSec: 20,
    },
    {
      id: 'open-declare',
      section: 'Declare an MCI',
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
      section: 'Declare an MCI',
      title: 'Declare an MCI',
      body: "Tick every zone (**Glade**, **Campanile** and **South Zone**). Zones are where patients are found. The three clinics are already ticked as treatment locations. Click **Declare MCI**.",
      anchors: ['mci-declare-modal', 'mci-declare-button'],
      placement: 'left',
      estSec: 40,
      intents: ['mci zones', 'treatment location'],
      done: (e) => isMciActive(e) && !!zoneStats(e),
      apply: (e) => {
        const zones = getVenueZones(e.venue).map((z) => ({ id: z.id, name: z.name, venueZoneId: z.id }));
        return { ...e, ...declareMci(e, { zones, areas: CLINICS.map((c) => ({ id: c.id, name: c.name, clinicId: c.id })), trackPatients: true }, Date.now()) };
      },
    },
    {
      id: 'tag-red',
      section: 'Tag patients',
      title: 'Tag red patients',
      body: "Triage reports **3 red** patients (most urgent) in the South Zone. Click **+** on the red row 3 times.",
      anchor: `mci-zone-${ZONE}-red-add`,
      placement: 'right',
      estSec: 20,
      intents: ['tag patients', 'count patients', 'triage count', 'add red patient'],
      done: (e) => (zoneStats(e)?.tagged.red ?? 0) >= 3,
      apply: (e) => patched(e, tagPatch(e, zoneId(e), 'red', 3 - (zoneStats(e)?.tagged.red ?? 0), ctx())),
    },
    {
      id: 'tag-yellow',
      section: 'Tag patients',
      title: 'Tag yellow patients',
      body: "Then **2 yellow** patients (can wait). Click **+** on the yellow row 2 times.",
      anchor: `mci-zone-${ZONE}-yellow-add`,
      placement: 'right',
      estSec: 15,
      done: (e) => (zoneStats(e)?.tagged.yellow ?? 0) >= 2,
      apply: (e) => patched(e, tagPatch(e, zoneId(e), 'yellow', 2 - (zoneStats(e)?.tagged.yellow ?? 0), ctx())),
    },
    {
      id: 'in-zone',
      section: 'Tag patients',
      title: 'Read the In zone count',
      body: "This column shows how many patients are still in the zone and not yet moved.",
      anchor: `mci-zone-${ZONE}-inzone-total`,
      placement: 'left',
      estSec: 15,
    },
    {
      id: 'open-move',
      section: 'Move patients to treatment',
      title: 'Open Move to treatment',
      body: "Teams carry all 5 patients to the Dwinelle Tent. Click **Move to treatment** on the South Zone card.",
      anchor: `mci-zone-move-${ZONE}`,
      placement: 'top',
      estSec: 10,
      doneWhenVisible: 'mci-move-modal',
      intents: ['move patients', 'move to treatment'],
      liveSafe: true,
    },
    {
      id: 'move',
      section: 'Move patients to treatment',
      title: 'Move patients to treatment',
      body: "The numbers and **Dwinelle Tent** are already filled in. Click **Move**.",
      anchors: ['mci-move-confirm', `mci-zone-move-${ZONE}`],
      placement: 'top',
      estSec: 15,
      done: (e) => (zoneStats(e)?.movedTotal ?? 0) >= 5,
      apply: (e) => patched(e, movePatch(e, zoneId(e), areaId(e), { red: 3, yellow: 2 }, ctx())),
    },
    {
      id: 'clear-zone',
      section: 'Move patients to treatment',
      title: 'Mark a zone clear',
      body: "No one is left in the South Zone. Click **Clear?** to mark the zone empty.",
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
      section: 'Transport patients',
      title: 'Open Transport',
      body: "An ambulance arrives at the Dwinelle Tent. Click **Transport** on the Dwinelle Tent card.",
      anchor: `mci-area-transport-${AREA}`,
      placement: 'top',
      estSec: 10,
      doneWhenVisible: 'mci-transport-modal',
      intents: ['transport mci patients', 'ambulance', 'send to hospital'],
      liveSafe: true,
    },
    {
      id: 'transport',
      section: 'Transport patients',
      title: 'Transport patients',
      body: "Type ambulance `A14`, pick **two red** patients, type destination `County General`, then confirm. The most urgent patients are listed first.",
      anchors: ['mci-transport-modal', `mci-area-transport-${AREA}`],
      placement: 'left',
      estSec: 45,
      values: ['A14', 'County General'],
      done: (e) => (areaStats(e)?.transported.red ?? 0) >= 2,
      apply: (e) => patched(e, transportPatch(e, areaId(e), { red: 2 }, { unit: 'A14', destination: 'County General' }, ctx())),
    },
    {
      id: 'end-mci',
      section: 'End the MCI',
      title: 'End the MCI',
      body: "When the incident is over, click **End MCI** and confirm. Teams go back to Available and any patients still being treated move to the clinic tab. The counts are kept.",
      anchor: 'mci-stand-down',
      placement: 'bottom',
      estSec: 20,
      intents: ['end mci', 'stand down mci', 'mci over'],
      // Ending the MCI writes the board's own text (the clinic tracker rows it imports), so the gate is off here.
      free: true,
      done: (e) => !!e.mci && !isMciActive(e),
      apply: (e) => ({ ...e, ...standDownMci(e, Date.now()) }),
      liveSafe: true,
    },
  ],
};

export default mciResponse;

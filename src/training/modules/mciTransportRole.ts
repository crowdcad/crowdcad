import type { Event } from '@/app/types';
import { byTransportOrder, deriveMci } from '@/lib/mci';
import { asRole, HOSPITALS, mciRoleBoard } from '../mciScenario';
import type { TrainingModule } from '../types';

const UNIT = 'MRC5';
const as = (e: Event, action: Parameters<typeof asRole>[3]) => asRole(e, 'transport', UNIT, action);
const waiting = (e: Event) => deriveMci(e).patients.filter((p) => p.transportedAt === undefined).sort(byTransportOrder);
const left = (e: Event) => deriveMci(e).patients.filter((p) => p.transportedAt !== undefined);
const NEW_HOSPITAL = 'Highland';

/** The Transport role login on a phone: records each patient leaving by ambulance. */
const mciTransportRole: TrainingModule = {
  id: 'mci-role-transport',
  version: 1,
  track: 'mci',
  title: 'Transport login: send patients to hospital',
  summary: 'Record each patient leaving by ambulance, with the ambulance and the hospital, from a phone.',
  release: 'stable',
  device: 'phone',
  surface: { role: 'transport', unit: UNIT },
  seed: () => mciRoleBoard('mci-role-transport'),
  practice: ['Transport the last waiting patient to Alta Bates.', 'Open the Left tab and check where each patient went.'],
  steps: [
    {
      id: 'intro',
      section: 'Record transports',
      title: 'Read the scenario',
      body: 'MRC5 holds the **Transport** login at the ambulance loading point. You record each patient who leaves, so the dispatcher, Logistics and Incident Command know who went where.',
      estSec: 20,
    },
    {
      id: 'waiting',
      section: 'Record transports',
      title: 'Read the waiting list',
      body: 'Every patient still at a treatment location is listed, in the order the Treatment Lead set: red first, then yellow and green. **#1** goes next.',
      anchor: 'role-transport-row',
      placement: 'bottom',
      estSec: 15,
      intents: ['transport waiting list'],
    },
    {
      id: 'pick',
      section: 'Record transports',
      title: 'Open Transport on #1',
      body: 'An ambulance is ready. Tap **Transport** on patient #1.',
      anchor: 'role-transport-pick',
      placement: 'left',
      estSec: 10,
      doneWhenVisible: 'role-transport-sheet',
    },
    {
      id: 'record',
      section: 'Record transports',
      title: 'Record the transport',
      body: 'Type ambulance `A14`, tap **County General** (the numbers are patients sent and its capacity), then tap **Record transport**.',
      anchors: ['role-transport-unit', `role-transport-hospital-${HOSPITALS[0]}`, 'role-transport-record'],
      placement: 'top',
      estSec: 25,
      intents: ['record transport', 'ambulance number', 'destination'],
      done: (e) => left(e).length > 0,
      apply: (e) => as(e, { type: 'transport', patientId: waiting(e)[0].id, unit: 'A14', destination: HOSPITALS[0] }),
    },
    {
      id: 'new-hospital',
      section: 'A hospital not on the list',
      title: 'Send to a new hospital',
      body: 'The next ambulance is going to a hospital nobody added. Tap **Transport** on the new #1, type ambulance `M7` and destination `Highland`, then **Record transport**. Highland is added to the hospitals in Logistics.',
      anchors: ['role-transport-destination', 'role-transport-pick'],
      placement: 'top',
      estSec: 30,
      intents: ['new hospital', 'hospital not on the list'],
      done: (e) => (e.mci?.logistics?.hospitals ?? []).some((h) => h.name.trim().toLowerCase() === NEW_HOSPITAL.toLowerCase()),
      apply: (e) => as(e, { type: 'transport', patientId: waiting(e)[0].id, unit: 'M7', destination: NEW_HOSPITAL }),
    },
    {
      id: 'left',
      section: 'A hospital not on the list',
      title: 'Check who has left',
      body: 'Tap **Left** to see each patient who has gone, with the ambulance, hospital and time.',
      anchor: 'role-transport-tab-left',
      placement: 'bottom',
      estSec: 10,
      doneWhenVisible: 'css:[data-testid="role-transport-tab-left"][aria-selected="true"]',
    },
  ],
};

export default mciTransportRole;

import { mciRoleBoard } from '../mciScenario';
import type { TrainingModule } from '../types';

const FRESH = 'css:[data-testid^="role-login-fresh-"]';

/** Making the MCI role logins and sending them to teams, from the dispatcher's MCI Logistics tab. */
const mciLogins: TrainingModule = {
  id: 'mci-logins',
  version: 1,
  track: 'mci',
  title: 'Make role logins and send them to teams',
  summary: "Give each team a role login for the MCI, send it to them, and send it again when it's lost.",
  release: 'stable',
  seed: () => mciRoleBoard('mci-logins'),
  practice: ['Change a login’s role after it is made.', 'Note who holds a login in its holder box.', 'Disable a login, then enable it again.'],
  steps: [
    {
      id: 'intro',
      section: 'What logins are for',
      title: 'Read about role logins',
      body: 'During an MCI, teams can work from their own phones. Each team or supervisor gets a login for one role, and everything it sends is logged under its name. **Responder**: triage counts and treatment. **Treatment Lead**: runs a treatment location and its transport order. **Transport**: records patients leaving by ambulance. **Logistics**: staff, hospitals and equipment. **Incident Command**: sees everything, changes nothing.',
      estSec: 45,
      intents: ['role logins', 'what roles', 'mci roles'],
    },
    {
      id: 'open-logistics',
      section: 'Make logins',
      title: 'Open MCI Logistics',
      body: 'Click the **MCI Logistics** tab.',
      anchor: 'logistics-tab-button',
      placement: 'bottom',
      estSec: 10,
      doneWhenVisible: 'logistics-tab',
      liveSafe: true,
    },
    {
      id: 'open-logins',
      section: 'Make logins',
      title: 'Open Logins',
      body: 'Click **Logins**.',
      anchor: 'logistics-logins-toggle',
      placement: 'bottom',
      estSec: 10,
      doneWhenVisible: 'role-logins',
      intents: ['make logins', 'create login', 'send login to team'],
      liveSafe: true,
    },
    {
      id: 'pick-roles',
      section: 'Make logins',
      title: 'Pick a role for each team',
      body: 'Every team and supervisor has a row. Teams start as **Responder** and supervisors as **No login**. Set **MRC4** to **Treatment Lead**, **MRC5** to **Transport** and **Sup 1** to **Logistics**, then click Next.',
      anchors: ['role-assign-MRC4-role', 'role-login-list'],
      placement: 'left',
      estSec: 40,
    },
    {
      id: 'create',
      section: 'Make logins',
      title: 'Create the logins',
      body: 'Click **Create logins** (the button counts them). One login is made for every row with a role. In practice they are made up and sign in nowhere.',
      anchor: 'role-login-create-assigned',
      placement: 'bottom',
      estSec: 10,
      doneWhenVisible: FRESH,
      doClicks: ['role-login-create-assigned'],
    },
    {
      id: 'send',
      section: 'Send them',
      title: 'Send each login',
      body: 'Each new login shows a username and password, with buttons to send it: **Copy message**, **Email**, **Copy link** (a link that signs the phone straight in) and, on a phone, **Share**. Send each one to its team now: the password is never shown again. **Copy all** copies every message at once.',
      anchor: FRESH,
      placement: 'left',
      estSec: 30,
      intents: ['share login', 'login link', 'copy login'],
    },
    {
      id: 'sign-in',
      section: 'Send them',
      title: 'How teams sign in',
      body: 'A team opens the link, or types the username and password at the sign-in page, and sees only its role. The tutorials for each role are listed under Mass Casualty Incident Features.',
      estSec: 15,
    },
    {
      id: 'reset',
      section: 'Lost logins',
      title: 'Send a login again',
      body: "If a team loses its message or hands the phone to someone else, click **Reset password** on its row. That makes a new password to send, and the old one stops working. **Disable** stops a login within moments; every login stops when the event ends.",
      anchors: ['css:[data-testid^="role-login-reset-"]', 'role-login-list'],
      placement: 'left',
      estSec: 25,
      intents: ['reset password', 'lost login', 'disable login'],
    },
  ],
};

export default mciLogins;

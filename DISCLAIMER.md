# Deployment Disclaimer

Last updated: 2026-09-08

This document sets forth the terms under which CrowdCAD is made
available to organizations that deploy it. It should be reviewed
before CrowdCAD is used in connection with any live event or
operational activity.

## 1. No Warranty

CrowdCAD is open source software provided under the GNU Affero General
Public License v3.0 (AGPL-3.0) license. It is provided "as is," without
warranty of any kind, express or implied, including without limitation
any warranty of merchantability or fitness for a particular purpose.
The full terms of the license are set forth in the LICENSE file
included with this repository. The decision to use CrowdCAD in
connection with a live event is made solely by the deploying
organization, at its own risk.

## 2. Role of the Deploying Organization

An organization that deploys CrowdCAD does so as the operator of that
deployment. The deploying organization:

(a) operates CrowdCAD on infrastructure that it controls;

(b) is the data controller, as that term is used under applicable
privacy law, for all information entered into its deployment, as
further described in PRIVACY.md;

(c) is responsible for configuring, securing and maintaining its
deployment, including applying updates;

(d) is responsible for complying with any regulatory requirements,
licensing requirements or medical direction requirements applicable
to its operations in its jurisdiction.

CrowdCAD is a coordination and documentation tool. It does not render
clinical or triage decisions, and its use does not substitute for the
deploying organization's own medical direction, protocols or clinical
judgment.

## 3. Support

CrowdCAD is maintained by an open source community. No service level
agreement, guaranteed response time or on call support is provided in
connection with the use of CrowdCAD. Issues may be reported at
https://github.com/crowdcad/crowdcad/issues. Organizations deploying
CrowdCAD for a live event are advised to maintain an independent
contingency plan, such as a paper or radio based backup, that does not
depend on the availability of the software.

## 4. Security

Procedures for reporting a security vulnerability are set forth in
SECURITY.md. Organizations are advised to review CrowdCAD's deployment
guidance, including its guidance on configuring Firebase Firestore
and Storage security rules, or PocketBase collection access rules, for
a self-hosted deployment (see docs/DEPLOYMENT.md, docs/SETUP_FIREBASE.md
and docs/SETUP_POCKETBASE.md), and to follow that guidance rather than
deploying with default or unsecured configurations.

## 5. Contact

Questions concerning this document may be directed to
support@crowdcad.org or submitted as an issue at
https://github.com/crowdcad/crowdcad.

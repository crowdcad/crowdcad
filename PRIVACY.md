# Privacy and Data Handling

Last updated: 2026-09-08

This document describes how CrowdCAD, the software, handles data. It
is intended for organizations evaluating whether to deploy CrowdCAD
and for parties assessing CrowdCAD against privacy frameworks,
including the General Data Protection Regulation (GDPR) and the
Digital Public Goods Standard.

## 1. Summary

CrowdCAD is self-hosted software. When an organization deploys
CrowdCAD, it does so on infrastructure that the organization controls.
All data entered into a deployment, including patient encounter
records, dispatch records and personnel information, is stored on
that infrastructure.

The maintainers of CrowdCAD do not receive, store, access or
otherwise have visibility into any data processed by a deployed
instance of CrowdCAD. For that reason, the maintainers do not act as a
data processor under the GDPR or comparable frameworks with respect to
data handled within a deployment.

The deploying organization is the data controller for any personal
data processed by its deployment of CrowdCAD and is responsible for
complying with the privacy and regulatory requirements applicable to
its operations and jurisdiction.

## 2. Data Storage

CrowdCAD stores data in the backend selected by the deploying
organization.

(a) Firebase (default). If an organization deploys CrowdCAD using the
default Firebase backend, data is stored and processed within that
organization's own Google Cloud or Firebase project, under the
organization's own agreement with Google. The maintainers of CrowdCAD
have no access to that project.

(b) PocketBase (self-hosted, opt-in). If an organization enables the
PocketBase backend by setting NEXT_PUBLIC_BACKEND=pocketbase, data is
stored entirely on infrastructure operated by that organization, and
no third party is involved in storage.

## 3. Third Party Services

As of this writing, the CrowdCAD application makes no outbound calls
to third party services other than the backend selected by the
deploying organization. 

## 4. Modifications and Forks

This document describes the CrowdCAD codebase as maintained by the
project. An organization that modifies its deployment or adds
integrations not described in this document is responsible for
assessing and documenting the resulting data flows.

## 5. Contributor Obligations

Contributors to CrowdCAD agree not to introduce data collection,
telemetry or third party calls that are not disclosed in this
document. A contributor proposing a change that introduces such a call
must disclose it in the relevant pull request so that this document
can be updated accordingly.

## 6. Contact

Questions concerning this document may be directed to
support@crowdcad.org or submitted as an issue at
https://github.com/crowdcad/crowdcad.

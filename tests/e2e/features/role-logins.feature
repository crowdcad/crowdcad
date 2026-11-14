@authenticated @firebase-only
Feature: MCI role logins
  A dispatcher gives a team a Responder login; whoever uses it works from
  their own phone view, every change logged under the team, and the
  dispatcher can disable it at any time.

  Background:
    Given I have created an event and am on the dispatch page
    And I open the add team modal
    And I create a team named "Alpha" with a member "Sam" certified as "EMT-B"

  Scenario: A Responder submits counts that the board shows under their team, then is disabled
    When I declare an MCI and keep the role logins open
    And I create the role logins as assigned
    Then a new role login for "Alpha" should be shown with its password
    When the new role login signs in on another device
    Then the other device should show the Responder view for "Alpha"
    When the other device picks zone "Zone A" and submits 2 "red" after confirming
    Then the dispatch MCI log should show an entry by "Alpha"
    When I disable the new role login
    Then the other device should show that the login has been disabled

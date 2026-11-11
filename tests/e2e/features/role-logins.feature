@authenticated @firebase-only
Feature: MCI role logins
  A dispatcher hands out a login for one role on one event; whoever uses it
  sees only that, and the dispatcher can disable it at any time.

  Background:
    Given I have created an event and am on the dispatch page

  Scenario: Hand out a Treatment login, then disable it
    When I declare an MCI and keep the role logins open
    And I create a role login for the default role
    Then the new role login should be shown with its password
    When the new role login signs in on another device
    Then the other device should show the "Treatment" role
    When I disable the new role login
    Then the other device should show that the login has been disabled

@authenticated
Feature: Event creation
  Tests for the event creation stepper at /events/[id]/create

  Background:
    Given I have a venue ready for event creation
    And I have started a new draft event from that venue

  Scenario: Form renders correctly
    Then I should see the "Enter event name" placeholder
    When I fill the event name with "Render Test Event"
    And I go to the "Staff Assignments" step
    Then I should see the heading "Teams"
    And I should see the heading "Supervisors"
    When I go to the "Equipment" step
    Then I should see the heading "Equipment"

  Scenario: Add a team via modal
    When I fill the event name with "Team Modal Event"
    And I go to the "Staff Assignments" step
    And I click the add team button
    And I fill the "Team Name" field with "Alpha"
    And I fill the "Member name" field with "John"
    And I select "EMT-B" from the "Certification" dropdown
    And I click the "Save & close" button in the modal
    Then I should see the text "Alpha"

  Scenario: Creating event navigates to dispatch
    When I fill the event name with "Test Event"
    And I go to the "Review" step
    And I click the "Create Event" button
    Then the URL should contain "/dispatch"

  Scenario: Equipment step renders correctly
    When I fill the event name with "Equipment Render Event"
    And I go to the "Equipment" step
    Then I should see the heading "Equipment"

  Scenario: A supervisor can be added during event creation
    When I fill the event name with "Supervisor Add Event"
    And I go to the "Staff Assignments" step
    And I click the add event supervisor button
    And I fill the supervisor call sign with "Lead-1"
    And I select event supervisor certification "EMT-B"
    And I click the "Save & close" button in the modal
    Then I should see the text "Lead-1"

  Scenario: Event name field accepts input
    When I fill the event name with "My Custom Event"
    Then I should see the "Enter event name" placeholder

  Scenario: Non-linear navigation preserves entered data across steps
    When I fill the event name with "Preserved Event"
    And I click the "Advanced settings" button
    And I fill the surge limit with "85"
    And I go to the "Staff Assignments" step
    And I go to the "Event Configuration" step
    Then the event name input should show "Preserved Event"
    When I click the "Advanced settings" button
    Then the surge limit input should show "85"

  Scenario: Advancing a step moves focus to the new step's content
    When I fill the event name with "Focus Test Event"
    And I go to the "Equipment" step
    Then the focused element should be labeled "Equipment"

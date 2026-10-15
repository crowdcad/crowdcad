@authenticated
Feature: Dispatch board — advanced (venue with locations and equipment)
  Tests for dispatch features that require a venue pre-configured with locations and equipment.

  Background:
    Given I have a venue with location "Medical Tent" and equipment "Wheelchair 1" and am on the dispatch page

  Scenario: Equipment section shows configured venue equipment
    When I switch to the "Equipment" section
    Then I should see the text "Wheelchair 1"

  Scenario: Equipment status can be changed on the dispatch board
    When I switch to the "Equipment" section
    And I change equipment "Wheelchair 1" status to "In Use"
    Then the equipment "Wheelchair 1" should show status "In Use"

  Scenario: An equipment run goes fetch, carry, hand off, then back to staging
    When I open the add team modal
    And I create a team named "Care" with a member "Ann Ray" certified as "CPR"
    And I open the add team modal
    And I create a team named "Runner" with a member "Bo Lin" certified as "CPR"
    And I open the quick call modal
    And I log a call assigned to team "Care" at location "Section 104" with complaint "Ankle"
    And I send team "Runner" with equipment "Wheelchair 1" on the latest call
    Then the team "Runner" should have status "Retrieving"
    When I switch to the "Equipment" section
    Then the equipment "Wheelchair 1" should show custody "Being retrieved by Runner from Staging"
    When I change team "Runner" status on the call to "En Route"
    Then the equipment "Wheelchair 1" should show custody "With Runner"
    When I change team "Runner" status on the call to "Delivered"
    Then the equipment "Wheelchair 1" should show custody "With care team (Care)"
    When I change team "Care" status on the call to "Refusal"
    Then the equipment "Wheelchair 1" should show custody "Returning with Care"
    When I switch to the "Teams" section
    Then the team "Runner" should have status "Available"
    And the team "Care" should have status "Returning"
    When I set team "Care" card status to "Available"
    And I switch to the "Equipment" section
    Then the equipment "Wheelchair 1" should show status "Available"
    And the equipment "Wheelchair 1" should show no custody line

  Scenario: The dispatcher can move equipment by hand
    When I open the add team modal
    And I create a team named "Hotel" with a member "Cy Dee" certified as "CPR"
    And I switch to the "Equipment" section
    And I move equipment "Wheelchair 1" to "Hotel"
    Then the equipment "Wheelchair 1" should show custody "With Hotel"
    When I mark equipment "Wheelchair 1" returned
    Then the equipment "Wheelchair 1" should show status "Available"
    And the equipment "Wheelchair 1" should show no custody line

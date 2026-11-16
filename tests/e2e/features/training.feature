@public
Feature: CrowdCAD Training
  The training catalog and every module, walked end to end on the real dispatch board.
  A module that a UI change breaks (a moved control, a renamed test id) fails here.
  See docs/TRAINING.md.

  Scenario: The catalog lists tracks with durations
    Given I open the training catalog
    Then I should see the training track "start"
    And I should see the training track "dispatcher"
    And every listed module should show an estimated time

  Scenario Outline: Module "<module>" can be completed step by step
    Given I open the training module "<module>"
    When I complete every step with "Do it for me"
    Then the training module should be complete
    And the board should be in free practice

    Examples:
      | module            |
      | orientation       |
      | call-assignment   |
      | clinic-patients   |
      | surge-and-log     |
      | mci-response      |
      | tak-live-tracking |

  Scenario: The board takes only the script's values while a lesson is guided
    Given I open the training module "call-assignment"
    When I advance the training to the "fill-call" step
    And I add a call at "Jane Doe's house" with complaint "Chest pain"
    Then the training board should turn the write away
    And no call should be logged

  Scenario: After the lesson the board takes anything
    Given I open the training module "call-assignment"
    When I complete every step with "Do it for me"
    And I add a call at "Riverbank Bench" with complaint "Sprained ankle"
    Then a call at "Riverbank Bench" should be logged

  Scenario: The steps menu restarts a later section with its board set up
    Given I open the training module "call-assignment"
    When I open the training steps menu and pick section 3
    Then the training step should be "Set On Scene"
    And a call at "Sather Gate" should be logged

  Scenario: Help finds a step and points at it on the board
    Given I open the training module "call-assignment"
    When I search Help for "add a call"
    Then the first Help result should offer "Show me"
    When I pick "Show me" on the first Help result
    Then the Help guide should point at "add-call-button"

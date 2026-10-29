@authenticated
Feature: MCI mode on the dispatch board
  Tests for declaring an MCI, counting patients by zone, moving them to treatment, standing down and the summary.

  Background:
    Given I have created an event and am on the dispatch page

  Scenario: An event with no MCI shows no MCI tab
    Then I should see a "Declare MCI" button
    And I should not see the text "Duration"

  Scenario: Run an MCI from declaration to the summary
    When I declare an MCI with zones "Zone A" and "Zone B" and the default clinic
    Then I should see the text "Duration"
    When I tag 3 "red" patients in zone "Zone A"
    And I tag 2 "yellow" patients in zone "Zone A"
    Then zone "Zone A" should show 3 "red" patients in the zone
    When I move all patients from zone "Zone A" to "Clinic"
    Then the treatment location "Clinic" should read "0 regular + 5 MCI"
    And zone "Zone A" should show 0 "red" patients in the zone
    When I mark zone "Zone A" clear
    Then I should see the text "Zone clear"
    When I transport 2 "red" patients from "Clinic" in ambulance "A14"
    Then the treatment location "Clinic" should read "0 regular + 3 MCI"
    When I stand down the MCI
    Then I should see the text "This MCI has stood down"
    When I open the MCI summary from the event summary
    Then the MCI summary should list zone "Zone A" with 5 tagged and 5 moved
    And the MCI summary should list treatment location "Clinic" with 2 transported

  Scenario: Track patients in a treatment location
    When I declare an MCI with zones "Zone A" and "Zone B" and the default clinic
    And I tag 2 "red" patients in zone "Zone A"
    And I tag 1 "yellow" patients in zone "Zone A"
    And I quick move 2 "red" patients from zone "Zone A"
    And I quick move 1 "yellow" patients from zone "Zone A"
    Then zone "Zone A" should show 0 "red" patients in the zone
    And the treatment location "Clinic" should read "0 regular + 3 MCI"
    When I enter age "34" sex "m" and complaint "chest pain" for "red" patient 1 in "Clinic"
    Then "red" patient 1 in "Clinic" should read age "34" sex "M" and complaint "chest pain"
    When I set the priority of "red" patient 2 in "Clinic" to 1
    And I set the priority of "red" patient 2 in "Clinic" to 2
    Then "red" patient 2 in "Clinic" should have priority "2"
    When I mark "red" patient 1 in "Clinic" transported in ambulance "A14"
    Then "red" patient 1 in "Clinic" should have priority "1"
    And "red" patient 1 in "Clinic" should read age "34" sex "M" and complaint "chest pain"
    When I retriage "yellow" patient 1 in "Clinic" to "red" with note "worse breathing"
    Then the "red" column in "Clinic" should list 2 patients
    And the "yellow" column in "Clinic" should list 0 patients
    And the treatment location "Clinic" should read "0 regular + 2 MCI"
    And the MCI log should mention "worse breathing"
    When I stand down the MCI
    And I open the MCI summary from the event summary
    Then the MCI summary patients should include "chest pain"
    And the MCI summary patients should include "A14"

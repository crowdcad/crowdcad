@public
Feature: Lite keeps events in the browser
  Lite events are stored only in this browser and are never sent anywhere.

  Scenario: A Lite event's data never leaves the browser, and it can be deleted here
    Given I record every request the page makes
    And I am on the Lite start page
    Then I should see the Lite storage notice
    When I start a Lite event with a unique name
    Then no request carried the Lite event's name
    When I open the Lite start page again
    Then the Lite event is listed as stored in this browser
    When I delete the Lite event from this browser
    Then the Lite event is no longer listed
    And no request carried the Lite event's name

@authenticated
Feature: Event records
  The event owner's full record export and legal hold, on the summary page.

  Background:
    Given I have ended an event and am on the summary page

  Scenario: The owner exports the event's full record
    Then clicking "Full Record" should download the event's full record

  Scenario: The owner places and releases a legal hold
    When I place a legal hold on the event
    Then the event shows a legal hold
    When I reload the page
    Then the event shows a legal hold
    When I release the legal hold
    Then the event shows no legal hold

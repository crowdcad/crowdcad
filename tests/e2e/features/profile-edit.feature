@authenticated
Feature: Profile edit modal
  Tests for the Edit Profile modal on /profile — editing user profile information.

  Background:
    Given I navigate to "/profile"
    And the profile page is loaded
    When I click the "Edit Profile" button

  Scenario: Edit profile modal renders form fields
    Then I should see the heading "Edit Profile"
    And I should see the "Your full name" placeholder
    And I should see the "+1 555 555 5555" placeholder

  Scenario: Save and Cancel buttons are visible
    Then I should see a "Save Changes" button in the modal
    And I should see a "Cancel" button in the modal

  Scenario: Cancel closes the modal
    When I click the "Cancel" button in the modal
    Then the "Full name" field should not be visible in the modal
    And the URL should be "/profile"

  Scenario: Display name can be updated
    When I fill the "Your full name" placeholder with "E2E Test User"
    And I click the "Save Changes" button in the modal
    Then the "Full name" field should not be visible in the modal
    And I should see the text "E2E Test User"

  Scenario: Phone number help is a tooltip, not a description
    Then I should not see the text "Phone numbers are saved to your profile document."

  Scenario: The old edit page opens the modal
    Given I navigate to "/profile/edit"
    Then the URL should be "/profile"
    And I should see the heading "Edit Profile"

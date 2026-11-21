@authenticated
Feature: Profile page
  Tests for the /profile page — authenticated user.

  Background:
    Given I navigate to "/profile"
    And the profile page is loaded

  Scenario: Profile info section shows the logged in user email
    Then I should see the logged in user email

  Scenario: Edit Profile button opens the edit modal
    When I click the "Edit Profile" button
    Then I should see the heading "Edit Profile"
    And the URL should be "/profile"

  Scenario: Password fields are collapsed behind a Change Password button by default
    Then I should see the heading "Security"
    And I should see a "Change Password" button
    And I should not see the text "Enter current password"

  Scenario: Change Password button reveals the password fields
    When I click the "Change Password" button
    Then I should see the "Enter current password" placeholder
    And I should see the "Enter new password" placeholder
    And I should see the "Confirm new password" placeholder
    And I should see an "Update Password" button

  Scenario: Data & Account section shows export, delete, and sign out actions
    Then I should see the heading "Data & Account"
    And I should see a "Export Data" button
    And I should see a "Delete Account" button
    And I should see a "Sign Out" button

  Scenario: Preferences section shows the reduce motion toggle
    Then I should see the heading "Preferences"
    And I should see the text "Reduce motion"

  Scenario: Admin section is not shown to a non-admin user
    Then I should not see the text "Manage Admins"

  Scenario: Profile is accessible via the navbar profile dropdown
    Given I navigate to "/"
    When I click the "Open profile menu" button
    And I click the "Profile" menu item
    Then the URL should be "/profile"
    And the profile page is loaded

  Scenario: Sign Out transitions the page to the not-signed-in state
    When I click the "Sign Out" button
    Then I should see the text "You are not signed in."

  Scenario: Password change shows error when passwords do not match
    When I click the "Change Password" button
    And I fill the "Enter current password" placeholder with "SomePassword123!"
    And I fill the "Enter new password" placeholder with "NewPass123!"
    And I fill the "Confirm new password" placeholder with "DifferentPass456!"
    And I click the "Update Password" button
    Then I should see the text "New passwords do not match"

  Scenario: Password change shows error when current password is empty
    When I click the "Change Password" button
    And I fill the "Enter new password" placeholder with "NewPass123!"
    And I fill the "Confirm new password" placeholder with "NewPass123!"
    And I click the "Update Password" button
    Then I should see the text "Enter your current password"

  Scenario: Delete Account button opens confirmation dialog
    When I click the "Delete Account" button
    Then I should see the text "This action cannot be undone"

  Scenario: Delete Account cancel closes the dialog
    When I click the "Delete Account" button
    And I click the "Cancel" button
    Then I should not see the text "This action cannot be undone"

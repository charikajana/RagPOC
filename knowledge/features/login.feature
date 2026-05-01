Feature: User Login
  As a registered user
  I want to log into the application
  So that I can access my dashboard

  Background:
    Given the application is running
    And I am on the login page

  @smoke @login @US-1001
  Scenario: Successful login with valid credentials
    When I enter username "testuser@example.com"
    And I enter password "ValidPass123!"
    And I click the login button
    Then I should be redirected to the dashboard
    And I should see the welcome message "Welcome, Test User"

  @negative @login @US-1001
  Scenario: Login fails with incorrect password
    When I enter username "testuser@example.com"
    And I enter password "WrongPassword"
    And I click the login button
    Then I should see the error message "Invalid credentials"
    And I should remain on the login page

  @negative @login @US-1001
  Scenario: Login fails with empty fields
    When I click the login button
    Then I should see validation errors
    And the username field should show "Username is required"
    And the password field should show "Password is required"

  @data-driven @login @US-1001
  Scenario Outline: Login with various invalid inputs
    When I enter username "<username>"
    And I enter password "<password>"
    And I click the login button
    Then I should see the error message "<error>"

    Examples:
      | username                | password      | error                        |
      | not-an-email            | ValidPass123! | Invalid email format         |
      | testuser@example.com    |               | Password is required         |
      |                         | ValidPass123! | Username is required         |
      | unknown@example.com     | ValidPass123! | Invalid credentials          |

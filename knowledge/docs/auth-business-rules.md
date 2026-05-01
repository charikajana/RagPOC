# Business Rules: User Authentication Module

## Overview
This document outlines the business rules governing user authentication across the platform.

## Password Policy
- Minimum 8 characters
- At least one uppercase letter (A-Z)
- At least one lowercase letter (a-z)
- At least one digit (0-9)
- At least one special character (!@#$%^&*)
- Cannot be the same as the last 5 passwords

## Account Lockout
- After 5 consecutive failed login attempts, the account is locked for 30 minutes
- An email notification is sent to the user upon lockout
- Admin can manually unlock accounts

## Session Management
- Sessions expire after 8 hours of inactivity
- Users can have a maximum of 3 active sessions simultaneously
- Session tokens are rotated on every privileged action

## Multi-Factor Authentication (MFA)
- MFA is mandatory for all Admin users
- Standard users can opt-in to MFA via their profile settings
- Supported MFA methods: TOTP (Google Authenticator), SMS OTP

## Password Reset Flow
1. User clicks "Forgot Password" on the login page
2. User enters their registered email address
3. System sends a reset link valid for 15 minutes
4. User clicks link, enters new password, and confirms it
5. All existing sessions are terminated upon successful reset

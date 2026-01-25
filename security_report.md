# Security Audit Report

**Project**: 104-plugin
**Date**: 2026-01-23
**Auditor**: Gemini Security Expert

## Executive Summary
The application demonstrates a security-conscious design with implemented AES-256 encryption for sensitive tokens, rate limiting for API endpoints, and the use of an ORM (Prisma) to mitigate SQL injection. However, several areas require attention to harden the security posture, particularly regarding Cross-Site Scripting (XSS) risks due to raw HTML rendering, input validation for API parameters, and secure handling of encryption keys.

## 1. Hardcoded Secrets & Credentials

*   **Finding 1.1: Hardcoded Password in Test File**
    *   **Severity:** Low
    *   **Location:** `test/api-test.ts` (Line 23)
    *   **Description:** The string `'any_password'` is hardcoded. While this is a test file, it's good practice to use environment variables for all credentials to prevent accidental exposure if test files are deployed or committed to public repositories.
    *   **Recommendation:** Use `process.env.TEST_PASSWORD` or similar.

*   **Finding 1.2: Insecure Encryption Key Fallback**
    *   **Severity:** Medium
    *   **Location:** `src/server/encryption.ts` (Line 17)
    *   **Description:** The code falls back to a hardcoded `default_password` salt if `ENCRYPTION_KEY` is invalid.
    *   **Risk:** If the environment variable configuration fails in production, the system will silently default to a weak, known key, compromising all encrypted data.
    *   **Recommendation:** The application should **fail to start** (crash) if the encryption key is missing or invalid, rather than falling back to an insecure default.

## 2. Access Control & Authorization

*   **Finding 2.1: Reliance on `lineUserId` for Authorization**
    *   **Severity:** Medium
    *   **Description:** Most APIs authorize users based solely on the `lineUserId` query or body parameter.
    *   **Risk:** If an attacker can guess or spoof a `lineUserId`, they can access that user's data (IDOR - Insecure Direct Object Reference). While LIFF provides some protection, the backend API itself trusts the client-provided ID without verifying a session token or signature from LINE.
    *   **Recommendation:** Implement proper session management. Verify the LINE ID Token on the backend using the LINE API, or issue a secure session cookie/JWT after the initial binding/login, rather than trusting `lineUserId` in every request.

## 3. Input Validation

*   **Finding 3.1: Missing Strict Input Validation**
    *   **Severity:** Low
    *   **Location:** Various API endpoints in `src/server/index.ts`
    *   **Description:** Parameters like `companyID`, `empId`, `year`, `id` are checked for existence and type (string), but not for format, length, or allowed characters.
    *   **Risk:** Unexpected input could cause application errors or be used for denial-of-service or logic bypass attacks.
    *   **Recommendation:** Use a validation library like `zod` or `joi` to define and enforce strict schemas for all API inputs (e.g., `year` must be 4 digits, `companyID` must be numeric or specific format).

## 4. Sensitive Data Handling (XSS)

*   **Finding 4.1: Usage of `dangerouslySetInnerHTML`**
    *   **Severity:** High
    *   **Location:** `src/client/pages/SettingsPage.tsx` (Line 77) & `src/client/pages/SalaryPage.tsx` (Line 97)
    *   **Description:** The application renders HTML content received from the 104 API directly into the DOM.
    *   **Risk:** Stored Cross-Site Scripting (XSS). If the 104 system is compromised or returns malicious scripts in the `ShowData` field, those scripts will execute in the user's browser.
    *   **Recommendation:**
        1.  **Sanitize:** Use a library like `dompurify` on the frontend to sanitize the HTML string before rendering it.
        2.  **Parse & Render:** Ideally, parse the HTML on the backend into a JSON structure and render it using React components, avoiding `dangerouslySetInnerHTML` entirely.

## 5. Logging

*   **Finding 5.1: Potential Sensitive Data Leakage in Logs**
    *   **Severity:** Low
    *   **Location:** `src/server/index.ts`
    *   **Description:** The application uses `console.log` and `console.error` extensively. While you have improved this by avoiding template literals for variables (fixing the Format String vulnerability), ensure that `error.message` or object dumps do not contain PII (like full names, raw tokens, or session IDs) in production logs.
    *   **Recommendation:** Use a structured logging library (e.g., `winston`, `pino`) with redaction capabilities for sensitive fields.

## 6. Other Observations

*   **XML/HTML Parsing:** The backend uses `cheerio` and regex for parsing. Ensure that `cheerio` is kept up-to-date to avoid any prototype pollution or parsing vulnerabilities found in older versions.

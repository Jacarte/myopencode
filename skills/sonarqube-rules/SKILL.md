---
name: sonarqube-rules
description: "Apply SonarQube-aligned coding rules during implementation and review. Use when: (1) writing or reviewing production code, (2) checking maintainability/security issues before a PR, (3) enforcing low-complexity functions, input validation, secret safety, structured error handling, and strong coverage on new code. Triggers: 'follow sonar rules', 'sonarqube', 'sonar qube', 'code quality gate', 'new code coverage', 'avoid duplication'."
compatibility: opencode
---

# SonarQube Rules

Apply these instructions when writing, modifying, or reviewing code that should pass SonarQube-style maintainability and security expectations.

## Core Rule

Optimize for code that is easy to understand, easy to test, safe at boundaries, and unlikely to fail a quality gate on new code.

## Quick Checklist

- [ ] Avoid duplicated logic; extract shared behavior once repetition becomes visible
- [ ] Keep functions small and easy to follow; target complexity under 10 unless the repo uses a different threshold
- [ ] Validate and sanitize all external inputs at the boundary
- [ ] Never hardcode secrets, credentials, tokens, or private keys
- [ ] Use structured error handling; never swallow failures silently
- [ ] Ensure tests cover new code, with new-code coverage at or above 80% when the repo measures it

## How to Apply the Rules

### 1. Avoid duplicated logic

Treat duplication as a maintainability issue. If the same branching, parsing, mapping, validation, or transformation logic appears more than once, extract a helper, shared function, or reusable object.

Prefer eliminating duplication in **new or touched code** first. Do not perform broad refactors unless they are necessary for the task.

**Sonar nuance:** SonarQube measures duplication through metrics and quality gates on new code. The built-in Sonar way gate commonly expects new-code duplication to stay below 3%, but duplication is evaluated as a metric, not a single universal language rule.

### 2. Limit function complexity

Prefer short functions, early returns, flattened control flow, and small helper functions over deep nesting.

Use this local target:

- Aim for function complexity below 10
- Split functions when they mix parsing, validation, business rules, and output formatting
- Reduce nested conditionals with guard clauses
- Give complex boolean logic a named helper so intent is obvious

**Sonar nuance:** SonarQube tracks cyclomatic and cognitive complexity, but “under 10” is a practical team target, not a universal Sonar default.

### 3. Validate all external inputs

Treat all inbound data as untrusted until validated.

Validate at boundaries:

- HTTP request params, query strings, headers, and bodies
- CLI arguments
- Environment variables
- Webhook payloads
- Database results from untyped layers
- Third-party API responses
- File contents and user-provided text

Use explicit schemas or validation functions whenever possible. Reject invalid input early with a clear, typed error path.

Sanitize or encode input for the destination sink when required, especially for SQL, shell commands, HTML rendering, templates, and serialization boundaries.

### 4. No hardcoded secrets

Never commit or inline:

- API keys
- Passwords
- Tokens
- Connection strings with credentials
- Private keys
- Cloud secrets

Load secrets from environment variables, secret managers, or secure runtime configuration.

If sample values are required, use obvious placeholders like `YOUR_API_KEY_HERE` rather than realistic-looking credentials.

### 5. Use structured error handling

Catch errors only when you can add context, translate them, clean up resources, or return a controlled failure.

Preferred behavior:

- Preserve the original cause when rethrowing or wrapping
- Add useful context for logs and callers
- Return typed/domain-specific errors where the codebase supports them
- Log once at the correct boundary instead of repeatedly at every layer
- Fail closed for security-sensitive paths

Forbidden patterns:

- Empty catch blocks
- Ignoring returned errors
- Returning vague generic failures when better context is available
- Logging secrets or sensitive payloads

### 6. Coverage on new code

Add or update tests whenever new production behavior is added or changed.

Focus coverage on:

- Main success path
- Expected failure paths
- Boundary conditions
- Validation behavior
- Error translation or retry behavior

Target **80% or greater coverage on new code** when the repository imports coverage into SonarQube.

**Sonar nuance:** SonarQube reads coverage reports from external test tooling. It evaluates the reported coverage; it does not generate tests itself.

## Implementation Guidance for Agents

When this skill is loaded:

1. Check whether the task introduces repeated logic and extract shared code if it improves clarity
2. Keep each new or edited function focused on one responsibility
3. Add input validation at the first trusted boundary
4. Replace any secret literals with configuration or placeholders
5. Use explicit, non-silent error paths
6. Add or update tests for every new code path you introduce
7. When summarizing work, call out any remaining risk to duplication, complexity, validation, secrets, or coverage

## Review Comments to Leave

Use comments like these during review:

- `Maintainability`: This logic duplicates an existing branch/path and should be extracted into a shared helper.
- `Complexity`: This function is doing too much at once; split validation, transformation, and side effects into smaller units.
- `Input Validation`: This value crosses a trust boundary without validation or sanitization.
- `Security`: This introduces a hardcoded secret or realistic credential-like value.
- `Error Handling`: This catch path suppresses failure details instead of handling or propagating them cleanly.
- `Testing`: New behavior was added without enough coverage to protect the changed path.

## Anti-Patterns to Flag

### Critical

- Hardcoded credentials or tokens
- Unvalidated external input reaching dangerous sinks
- Silent exception swallowing
- New production code without tests

### High Priority

- Large functions with deeply nested branches
- Copy-pasted validation or transformation logic
- Generic errors where structured domain errors are expected

### Medium Priority

- Repeated conditionals that should become a helper
- Branch-heavy code that would be clearer with guard clauses
- Tests that cover only the happy path but not validation or failure behavior

## Source Grounding

These instructions are intentionally SonarQube-aligned, not blindly Sonar-branded.

- Duplication and new-code coverage thresholds align with SonarQube quality-gate guidance
- Complexity guidance aligns with SonarQube complexity metrics, while keeping the exact threshold configurable by repo/profile
- Input validation and hardcoded secret avoidance align with SonarSource security guidance
- Structured error handling is a Sonar-aligned maintainability and security practice, but exact rules are language-specific

Primary references used while authoring this skill:

- SonarQube quality gates: https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-quality-gates/introduction-to-quality-gates
- SonarQube metrics definitions: https://docs.sonarsource.com/sonarqube-server/user-guide/code-metrics/metrics-definition
- SonarQube rules overview: https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-rules/rules
- SonarQube security-related rules: https://docs.sonarsource.com/sonarqube-server/quality-standards-administration/managing-rules/security-related-rules
- SonarQube security hotspots: https://docs.sonarsource.com/sonarqube-server/user-guide/security-hotspots
- SonarQube test coverage overview: https://docs.sonarsource.com/sonarqube-server/analyzing-source-code/test-coverage/overview

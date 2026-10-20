# Architecture - {{name}}

**Version:** 1 · **Date:** {{date}} · **Specification:** docs/SPEC.md

## 1. Overview

<!-- One sentence about the system + a diagram (ASCII or Mermaid) of the components. -->

## 2. Technology stack

| Layer | Choice | Why (ADR) |
|---|---|---|

## 3. Project structure

```
<directory tree>
```

## 4. Components and responsibilities

## 5. Data model

## 6. API / interfaces

<!-- Main endpoints or screens - the details of each task are in the Dev mini-spec. -->

## 7. User interface

<!-- Component library and CSS approach (ADR), where the shared layout and components live.
     The binding UI rules are in docs/UI.md. Write "none" for projects without a UI. -->

## 8. Security

<!-- Authentication, authorization, secrets (never in git - only env files outside the repo or secrets),
     input validation, OWASP risks relevant to the project. -->

## 9. Test strategy

<!-- Unit / integration / e2e (Playwright), accessibility (axe) for UI projects. Which test project covers what.
     Test naming convention - stable and unique, because satory makes sure no test ever disappears. -->

## 10. Environments and deploy

| Environment | Where | URL | How it is updated |
|---|---|---|---|
| staging | local Docker, project `<name>-staging` | http://localhost:8081 | automatically after every task (and for QA) |
| prod | local Docker, project `<name>-prod` | http://localhost:8080 | only via /satory-devteam:release, with your approval |

The image is built once (tag = git SHA) and the same image that passed staging goes to prod.

## 11. CI (GitHub Actions)

## 12. Decisions (ADR)

<!-- List of links to docs/adr/NNN-*.md -->

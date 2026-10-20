# UI guide - {{name}}

**Version:** 1 · **Date:** {{date}} · **Specification:** docs/SPEC.md (section "User interface")

Binding for everyone who builds or reviews the UI. Dev builds with it, the UI reviewer checks against it.
Change it deliberately (bump the version) and keep it in sync with the shared components in the code.

## 1. Direction

<!-- 2-4 sentences: audience, tone, the feel we aim for, reference products. -->

## 2. Foundation

| Item | Choice |
|---|---|
| Component library / CSS approach | <!-- e.g. MudBlazor, shadcn/ui + Tailwind, Bootstrap 5 - see ADR --> |
| Icons | |
| Fonts | |
| Theme | <!-- light / dark / both --> |

## 3. Design tokens

<!-- The only allowed values. Name them as they are named in the code (CSS variables, theme object). -->

| Token | Value | Use |
|---|---|---|
| color-primary | | primary actions, links |
| color-surface | | page and card backgrounds |
| color-text / color-text-muted | | |
| color-success / warning / danger | | statuses, validation |
| font-size scale | | |
| spacing scale | | |
| radius, shadow | | |

## 4. Layout and navigation

<!-- App shell (header, sidebar, content width), navigation pattern, page title and breadcrumbs,
     where primary actions go. -->

## 5. Components

<!-- Shared components and when to use each: buttons (primary / secondary / destructive), forms and
     validation messages, tables and lists (sorting, paging, mobile behaviour), cards, dialogs,
     notifications/toasts, badges, empty states. Name the code location of each. -->

## 6. States

| State | How it looks |
|---|---|
| Loading | |
| Empty | |
| Error | |
| Success / confirmation | |
| Destructive action | |

## 7. Content

<!-- UI language, tone, terminology glossary, number/date/currency formats, capitalisation. -->

## 8. Responsive behaviour

Viewports every page must work at, without horizontal scrolling or clipped content:
375×812 (mobile), 768×1024 (tablet), 1280×800 (desktop).

<!-- How layout, navigation and tables adapt at each. -->

## 9. Accessibility

- No `serious` or `critical` axe violations (checked by QA tests and the UI reviewer).
- Text contrast at least WCAG 2.2 AA (4.5:1; 3:1 for large text and UI controls).
- Every interactive element is reachable and usable with the keyboard and has a visible focus style.
- Every input has a label; errors are announced next to the field.
- Touch targets at least 44×44 px on mobile.

---
name: frontend-development-standards
description: Comprehensive front-end standards covering visual design, code architecture, build workflow, and QA/accessibility. Use this any time the user asks to build, generate, edit, or review front-end UI code — React/Vue/Next.js components, pages, dashboards, forms, landing pages, or any HTML/CSS/Tailwind output — even if they don't explicitly mention design quality, architecture, or testing. Also use when reviewing or refactoring existing front-end code for polish, accessibility, or maintainability. Covers typography/spacing rules, responsive breakpoints (375/768/1440px), micro-interactions and loading states, Tailwind class ordering, TypeScript prop/state typing, loading/empty/error state handling, component file structure and size limits, a plan-before-coding step, a no-placeholder-code rule, and a pre-ship QA checklist (cognitive load, ARIA/semantic HTML, color contrast, lazy-loaded images, OpenGraph tags).
---

# Frontend Development Standards

Apply all four sections below to every front-end deliverable — a single component, a full page, or a feature. Treat this as the default bar for front-end work in this account, not an opt-in checklist.

## 1. Visual Design

**Typography & spacing**
- Strong size/weight contrast between headings and body text — headings should never look like slightly-bigger body text.
- Always set an explicit line-height on body copy (`leading-relaxed` or an explicit value like `leading-[1.6]`). Never rely on the browser default.
- At least 24–32px of vertical space between distinct sections (`py-6`/`py-8`+ in Tailwind, or more for page-level sections). Never let elements crowd each other.
- Generous internal padding on cards, modals, and form fields — `p-6` minimum for content containers, more for primary cards.

**Modern interaction patterns**
- Every interactive element gets a visible hover, focus, and active state, animated with a short transition (`transition-all duration-200` or similar) rather than an instant snap.
- Any async content gets a skeleton/shimmer loading state shaped like the eventual content — not a bare spinner floating in empty space.
- Avoid harsh 1px borders as the primary way to separate surfaces; prefer soft shadows (`shadow-sm`/`shadow-md`) or a subtle gradient.

**Responsiveness (mobile-first)**
- Write the base, no-prefix Tailwind classes for the 375px layout first, then layer `sm:` / `md:` / `lg:` on top for 768px and 1440px.
- Before calling a layout done, mentally check it at 375px, 768px, and 1440px for overflow, awkward wrapping, or squashed text.
- Use `flex-wrap`, `min-w-0`, and `truncate` / `line-clamp-*` so long or dynamic text degrades gracefully instead of breaking the layout.

## 2. Architecture & Code Quality

**Tailwind class ordering** — group className strings as Layout → Spacing → Typography → Visuals → Interactive states:
```
className="flex items-center gap-4 px-6 py-4 text-sm font-medium text-slate-700 bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow"
```
If the same class cluster shows up in more than one place, extract it into a shared component instead of repeating it.

**State & types**
- Every component prop gets an explicit TypeScript type or interface — no implicit `any`.
- Every API response gets a typed shape (interface, or a runtime schema like zod) before it's consumed elsewhere.
- Keep state as local as possible; lift it to a shared/parent scope only when two or more components genuinely need it.
- Any component that fetches data must explicitly handle and render its loading, empty, and error states — not just the happy path.

**File structure**
- `/components/ui/` — generic, reusable primitives (Button, Card, Input, Modal) with no page-specific logic.
- `/components/features/` — page- or feature-specific composed components that assemble `ui/` primitives.
- Keep each component file under 150 lines. If it grows past that, extract a subcomponent or pull logic into a hook.

## 3. Workflow

Before writing code for any non-trivial feature:
1. Break the task into 3–5 concrete steps.
2. List the exact file paths that will be created or modified.
3. Only then write the code.

For every new feature, state how it would be verified — a short manual test script ("click X, expect Y"), or actual test cases (Jest/RTL/Playwright/etc.) if the project already has a test setup in place.

Never leave `// TODO` comments or placeholder stubs in delivered code. Every code block should be complete, production-ready, and fit the existing project's import conventions, naming, and file layout — don't invent a parallel pattern alongside what's already there.

## 4. QA Checklist (run before calling anything finished)

- **Cognitive load** — any nested loop or 3+ level deep if/else chain? Refactor into guard clauses, early returns, or an extracted helper function.
- **Accessibility** — semantic tags (`<main>`, `<nav>`, `<article>`, `<header>`, `<footer>`) instead of generic `<div>` soup; correct ARIA roles/labels on custom interactive widgets; text/background contrast meets WCAG AA (4.5:1 for body text).
- **Performance** — non-above-the-fold images use native `loading="lazy"` or the framework's image component (e.g. `next/image`).
- **SEO** — every page-level view ships a title, meta description, and basic OpenGraph tags (`og:title`, `og:description`, `og:image`).

If any check fails, fix it before presenting the code as finished rather than flagging it as a follow-up.

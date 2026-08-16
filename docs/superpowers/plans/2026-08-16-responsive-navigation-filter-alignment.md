# Responsive Navigation and Filter Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align navigation, list controls, sorting and filters consistently on desktop and mobile, with an accessible collapsible two-column mobile menu.

**Architecture:** Keep one dynamically generated `#family-tabs` navigation source and add a mobile-only controller button around it. Use shared CSS container variables for every top-level control. Keep mobile sort chips, while desktop gets a synchronized compact sort select plus direction button so all five desktop filter columns share one control height.

**Tech Stack:** Static HTML, CSS media queries, vanilla browser JavaScript, Node.js built-in test runner.

## Global Constraints

- Desktop starts at 641 px; mobile ends at 640 px.
- Desktop content width is at most 820 px with one shared safe-area-aware gutter.
- Mobile navigation is inline, two columns, multi-row, and never an overlay.
- Mobile navigation closes after selection and on Escape; Escape restores focus to the toggle.
- Interactive mobile controls are at least 44 px high.
- Existing hash routes and the single generated navigation list remain unchanged.

---

### Task 1: Add the responsive navigation and desktop sort contracts

**Files:**
- Modify: `index.html`
- Modify: `test/priority-ui.test.mjs`

**Interfaces:**
- Produces: `#mobile-menu-toggle`, `#mobile-menu-label`, `#sort-select`, and `#sort-direction` elements consumed by `app.js` and `styles.css`.

- [ ] **Step 1: Write failing markup tests**

Add assertions that require a button with `aria-controls="family-tabs"`, `aria-expanded="false"`, an active-label span, a sort select, and a direction button with an accessible label.

```js
assert.match(html, /id="mobile-menu-toggle"[^>]*aria-controls="family-tabs"[^>]*aria-expanded="false"/s);
assert.match(html, /id="mobile-menu-label"/);
assert.match(html, /id="sort-select"/);
assert.match(html, /id="sort-direction"[^>]*aria-label=/s);
```

- [ ] **Step 2: Verify the test fails for missing markup**

Run: `node --test test/priority-ui.test.mjs`
Expected: FAIL on `mobile-menu-toggle`.

- [ ] **Step 3: Add minimal semantic markup**

Place the mobile button directly before `#family-tabs`, and put the desktop sort select/direction row inside `#sort-field` before the existing chip list. Preserve the chip list for mobile.

- [ ] **Step 4: Verify the markup test passes**

Run: `node --test test/priority-ui.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit the markup contract**

```bash
git add index.html test/priority-ui.test.mjs
git commit -m "test: define responsive control markup"
```

### Task 2: Implement accessible mobile menu behavior and synchronized sort controls

**Files:**
- Modify: `app.js`
- Modify: `test/priority-ui.test.mjs`

**Interfaces:**
- Consumes: the four DOM IDs from Task 1 and existing `state`, `renderTabs()`, `renderSortChips()`, `stateToHash()`, and `render()`.
- Produces: `setMobileMenuOpen(open, { restoreFocus = false } = {})`, `closeMobileMenu()`, active mobile label, synchronized desktop sort controls.

- [ ] **Step 1: Write failing source-behavior tests**

Require the source to update `aria-expanded`, toggle the navigation mobile-open state, close after a tab choice, handle Escape with focus restoration, and synchronize the sort select/direction button.

```js
assert.match(source, /function setMobileMenuOpen\(/);
assert.match(source, /aria-expanded/);
assert.match(source, /event\.key === "Escape"/);
assert.match(source, /mobileMenuToggleEl\.focus\(\)/);
assert.match(source, /sortSelectEl\.addEventListener\("change"/);
assert.match(source, /sortDirectionEl\.addEventListener\("click"/);
```

- [ ] **Step 2: Verify the behavior test fails**

Run: `node --test test/priority-ui.test.mjs`
Expected: FAIL on `setMobileMenuOpen`.

- [ ] **Step 3: Implement the minimal controller**

Add DOM references, derive the active section label from `state.view`, update the menu button from `renderTabs()`, close the menu in every tab click handler, and add document-level Escape handling. Populate the desktop sort select from `SORT_FIELDS`; reuse `DEFAULT_SORT_DIR`, `state.sort`, `state.sortDir`, and `render()` rather than creating a second sort state.

- [ ] **Step 4: Verify behavior and regression tests pass**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit behavior**

```bash
git add app.js test/priority-ui.test.mjs
git commit -m "feat: add responsive navigation controls"
```

### Task 3: Align desktop and mobile layouts through one CSS system

**Files:**
- Modify: `styles.css`
- Create: `test/responsive-layout.test.mjs`

**Interfaces:**
- Consumes: navigation and sort-control classes/IDs from Tasks 1–2.
- Produces: `--content-width`, `--content-gutter`, desktop five-column filters, mobile inline two-column menu, mobile two-column sort chips, and full-width mobile controls.

- [ ] **Step 1: Write a failing CSS contract test**

Read `styles.css` and assert shared variables plus the exact responsive grid declarations.

```js
assert.match(css, /--content-width:\s*820px/);
assert.match(css, /--content-gutter:\s*1\.25rem/);
assert.match(css, /grid-template-columns:\s*repeat\(5,\s*minmax\(0,\s*1fr\)\)/);
assert.match(mobileCss, /\.tabs\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
assert.match(mobileCss, /\.sort-chip-list\s*\{[^}]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/s);
```

- [ ] **Step 2: Verify the CSS test fails**

Run: `node --test test/responsive-layout.test.mjs`
Expected: FAIL on `--content-width`.

- [ ] **Step 3: Implement shared alignment styles**

Replace repeated `820px`/`1.25rem` container values with variables. On desktop, show tabs and desktop sort controls, hide the mobile menu button and sort chips, and use five equal filter columns. At 640 px and below, show the menu button, display tabs only when open as a two-column grid, hide desktop sort controls, show sort chips as a two-column grid, and make controls/selects/buttons full-width and at least 44 px high.

- [ ] **Step 4: Run the focused and full suites**

Run: `node --test test/responsive-layout.test.mjs test/priority-ui.test.mjs`
Expected: PASS.

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 5: Commit CSS alignment**

```bash
git add styles.css test/responsive-layout.test.mjs
git commit -m "fix: align responsive navigation and filters"
```

### Task 4: Verify responsive behavior and deploy

**Files:**
- Modify only if verification exposes a defect: `index.html`, `app.js`, `styles.css`, relevant test.

**Interfaces:**
- Produces: a tested `main` commit and verified GitHub Pages deployment.

- [ ] **Step 1: Run full local verification**

Run: `npm test && git diff --check`
Expected: all tests PASS and no whitespace errors.

- [ ] **Step 2: Inspect rendered widths**

Serve the static app and inspect at 390 px, 640 px, 820 px, and 1280 px. Confirm mobile menu layout/open-close/focus, shared horizontal edges, equal desktop filter columns, full-width mobile dropdowns, and no horizontal overflow.

- [ ] **Step 3: Push `main`**

```bash
git push origin main
```

- [ ] **Step 4: Verify GitHub Pages**

Fetch the deployed `index.html`, `styles.css`, and `app.js`; confirm the new markup, CSS variables, and mobile menu controller are live.

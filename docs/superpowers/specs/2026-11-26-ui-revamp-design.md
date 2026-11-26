# UI and UX revamp: design

Date: 2026-11-26. Status: awaiting owner approval.

This replaces the visual and layout direction of `2026-11-24-better-claude-ui-design.md` and `docs/HANDOFF.md` section 2. Their other decisions still apply. Items marked **[my call]** were decided while writing and have not been discussed with the owner.

## 1. Intent

The owner finds the current UI very simple and generic ("AI slop"). The revamp should make the app look and feel deliberately designed, and easier to use, with a Mac-like character that stays at home on Windows. Apple's Human Interface Guidelines (HIG) are the main reference for hierarchy, consistency, readability and restraint.

## 2. Goals, non-goals, anti-goals

**Goals**
- The approved "C: Glass" look, with the right-hand panel from "B: Workbench".
- All navigation in one place.
- A fully customizable usage widget, plus an optional system tray / menu bar version.
- All existing themes and styles keep working and are readable.

**Non-goals**
- No release or tag. The v0.1.0 gate in `docs/GOALS.md` still applies.
- No custom window frame. No change to how the app talks to the Claude CLI, apart from reading token counts that it already sends.
- No counting of usage from outside this app. No desktop widget outside the app other than the tray / menu bar version.
- No localization or right-to-left work (new layout CSS uses logical properties so it is not made harder). **[my call]**

**Anti-goals (any of these means it failed)**
- A feature that exists today disappears or becomes harder to reach.
- Text is hard to read in any built-in theme.
- A usage number looks live or exact when it is not.
- Waiting for permission becomes easier to miss, or approving becomes easier to do by accident.
- The app becomes noticeably slow or heavy.

## 3. Constraints

- Tauri v2, Rust core, SvelteKit / Svelte 5. The production content security policy is not loosened.
- Windows is built and tested first. macOS and Linux are only covered by CI and remain untested on real hardware.
- Experience tiers keep their current meaning (`src/lib/tier.ts`): what Beginner hides stays hidden, in every new place.
- Never default to bypassing permissions. The existing bypass confirmation stays wherever the mode can be picked.
- The repo is public.

## 4. Approaches

1. **Restyle what exists.** Fastest, but pop-ups and mismatched controls would likely remain.
2. **Shared design system first, then the shell, then each screen.** Slower to start, consistent result, app works at every stage.
3. **Rebuild the UI separately and swap at the end.** Clean start, but nothing usable for a long time and a high risk of lost features.

**The owner picked 2.** Most store, reducer and Rust logic stays.

Looks considered: A (Native), B (Workbench), C (Glass). **The owner picked C plus B's right-hand panel**, including the new items shown in B and C. Mockups (local, not committed): `.superpowers/brainstorm/18613-1795722818/content/directions-v1.html` and `widget-v1.html`. The mockups set direction; where this document differs, this document wins.

## 5. Visual system

**Layers.** Frosted glass is only for the layer that floats over content: sidebar, right panel, toolbar controls, composer, permission prompt, menus, floating widget and tray panel. Conversation, Home, Usage, Settings and other page content sit on solid or near-solid surfaces. (The mockup's frosted Home and Settings cards become solid.) This follows the HIG Materials rule against Liquid Glass in the content layer. The effect is CSS blur inside the window; it does not show the desktop through the window.

**Ambient color.** A soft static glow behind the panels. It turns amber while the visible session waits for permission, and the sidebar marks every waiting session. Color is never the only signal: the prompt, a "Waiting for you" label and a sidebar badge remain. The change is a short fade, instant under reduced motion. No looping background animation.

**Shape and hierarchy.** Floating panels use large rounded corners; controls are capsules; content uses fewer boxes, relying on spacing and type weight. Not everything is a card.

**Type.** The Windows system font (Segoe UI Variable) with the current fallbacks. Apple's fonts and SF Symbols are not shipped. The default text size is at least 13px, and nothing is below 11px. **[my call]**

**Icons.** One open-licensed line icon set (Lucide, ISC license), with only the used icons included in the source and the license noted. It replaces emoji and text characters used as icons. Icon-only buttons have accessible names and tooltips. **[my call: the set]**

**Controls.** Shared components for button, icon button, menu, popover, segmented control, toggle, text field, meter (bar and ring), panel, dialog and list row. Native-looking `select` boxes are replaced by one menu component that supports the keyboard fully. Click targets are at least 28×28px by default and never under 20×20px.

**Accessibility.** Text contrast at least 4.5:1, measured on the worst-case composited background. Visible keyboard focus everywhere. `prefers-reduced-motion`, `prefers-reduced-transparency` (solid surfaces), `prefers-contrast: more` and forced colors are honored from the system, with no duplicate in-app switches.

**Window.** The standard Windows title bar and window buttons, set to light or dark to match the theme. Standard window behavior on other systems.

## 6. Themes and styles

- Keep Match system, all eight built-in themes, custom themes, and the editors, import and export. The saved theme format (12 colors) does not change.
- The glass tints, glow and other new colors are **derived** from those 12. `gate` remains the waiting color and is reserved for it.
- Where the accent or normal glow is close to the waiting color (for example Terminal Amber or High contrast), the normal glow is made neutral so waiting is clearly different.
- High contrast has no glass and no glow: solid surfaces, strong borders, and a heavy border for waiting. **[my call]**
- Fix built-in colors that fail contrast (Solarized Light secondary text is about 2.5:1 on its background). Theme names and character stay.
- Custom themes: the saved colors are never edited. If a pair fails contrast, the app uses an adjusted color on screen and the editor says so. **[my call]**
- Match system stays the default. The HIG advises against an app-specific appearance setting; keeping themes is the owner's decision.
- Keep the four styles (Modern, Terminal, Compact, Reading): font, size, radius, density, column width, message style, tool style and composer symbol. Radius now scales the new shapes, so Terminal stays square.

## 7. Layout and screens

### 7.1 Left sidebar (all navigation; the top tabs are removed)

Order: Chat / Code switch; New chat or New session; Home; Usage; Agent teams (Code only, as today); Archive; Open sessions; Recent; Projects; then at the bottom Capabilities and Instructions (not for Beginner), and Settings. The Claude Code version moves to Settings > General. Close and Forget stay on each row, shown on hover and keyboard focus, and in a right-click menu. The sidebar can be hidden with a toolbar button or Ctrl+B and is shown by default. **[my call: details]**

### 7.2 Toolbar

Sidebar button; title with the folder below it (or "No tools in Chat"); a search bar in the middle that opens the existing command palette (Ctrl+K), shrinking to an icon when narrow; the update and budget chips when relevant; Export and Continue in terminal when a conversation has content; the right panel button. Experience level, model, team and cost leave the top bar.

### 7.3 Right panel (session screens)

- **This session:** model, thinking, permissions, web search (Chat), agent team, project, estimated cost. Tier rules apply.
- **Activity:** this conversation's tool actions in order, with plain-language summaries and status (running, waiting, done, failed). Selecting one scrolls to it. It is built from data already in the transcript.
- **Usage widget**, when placed here.

It can be hidden, remembers that, and hides itself in narrow windows; there it can be opened as an overlay. On Home, Usage, Archive, Settings and the other pages it is not shown, and a widget placed "in the right panel" appears in its compact toolbar form there. The same applies while the panel is hidden. **[my call]** The mockup's Plan allowance and Budgets sections are now provided by the widget, so they are not repeated.

Session controls appear in **one place at a time**: in the panel when it is visible, and as menus in the composer when it is not. **[my call]**

### 7.4 Conversation, composer, permission prompt

- The user's messages sit on the trailing side; replies are unboxed text. Code blocks keep Copy and Preview. Diffs, nested agent output, raw log and "Show earlier" stay. Styles can still change message and tool appearance.
- Composer: attach, dictate, message field, send / stop. Slash menu, paste, drop and shortcuts stay.
- Permission prompt: attached above the composer, amber. Button order becomes Deny, Always allow, Allow, as in the approved mockup. No button gets focus automatically and no single key approves.

### 7.5 Home

A large "What are we working on?" message box, then shortcuts, then the existing customizable Home widgets, restyled. Saved widget lists keep working.

The box has a Chat / Code choice (starts on the sidebar's current mode) and an optional project. Sending opens a new session and sends the message. In Code without a folder, it asks for one first; cancelling keeps the typed text and attachments. If starting fails, the text is kept and the error shown. **[my call: behavior]**

### 7.6 Settings and other pages

Settings becomes a page with categories: **General** (experience level, defaults for new sessions, extra CLI flags, always-allowed tools, Claude Code version), **Appearance**, **Usage and budgets** (budgets and plan-limit auto refresh; also still reachable from Usage), **Usage widget**, **Your data**, **Updates**. Tier rules apply as today. It remembers the last category, opens with Ctrl+, and Escape returns to the previous screen.

Projects, Capabilities and Instructions also become pages. Agent teams, Import, Update, the command palette and code preview stay as dialogs, restyled. **[my call]**

Usage, Archive, the Chat start screens, first-run onboarding, setup wizard and empty and error states get the same system. The owner has not seen mockups of these, so screenshots are shared for review as each is built.

## 8. Usage widget

A small, self-contained widget with a status (Working, Waiting for you, Idle) and a gear.

| Reading | Shown as | Source and honesty rule |
|---|---|---|
| This reply (tokens) | number | New: token counts at the start and end of each model step, added up for the current reply |
| Session tokens | number | Usage ledger plus the reply in progress |
| Session cost | number | `result` event only; labelled as an estimate as of the last finished reply |
| 5-hour limit | bar, ring, number | Existing limits snapshot, with its age and reset handling from `limits.ts` |
| Weekly limit | bar, ring, number | Same |
| Today (cost) | bar, ring, number | Ledger, against the daily budget |
| This month (cost) | bar, ring, number | Ledger, against the monthly budget |
| Tokens today | number | Ledger |
| Daily spend | chart | Ledger, 30 days |

- "Tokens" means input + output + cache read + cache write, as Home and Usage count them today. The second line shows the split, including cached. **[my call]**
- With no budget set, budget readings show the amount and "No budget set". With no limit data (including accounts that report none), limits say "No reading yet". No value is ever invented, and cost is not estimated mid-reply.
- Session readings follow the active session; with none, they say so. Account and ledger readings cover this app's data (limits cover the whole plan, as of the last reading).
- The widget never makes a paid request on its own. The existing opt-in auto refresh is unchanged.

**Customization:** choose readings; reorder; bar / ring / number where the table allows; size (Compact, Regular, Large); position (right panel, floating, toolbar, hidden). Floating can be dragged, or moved with arrow keys, stays inside the window, and remembers its position. Toolbar shows the first three chosen readings (not the chart). When hidden, it can be turned on again in Settings and from the command palette. Defaults: This reply, Session cost, 5-hour, Weekly, Today; Regular; right panel.

**Token events (implementation note).** The recorded fixtures show `message_start` and `message_delta` stream events carrying `usage`. All parsing goes in `cli/events.rs`; unknown or missing fields must not crash. Before building the reading, capture a real run to confirm: whether counts within a step are cumulative (do not add start and delta blindly), how subagent events (`parent_tool_use_id`) report usage, and whether the finished total agrees with the `result` event. If it cannot be made to agree, the finished reply uses the `result` numbers and the difference is documented.

## 9. System tray / menu bar

- Off by default. Settings > Usage widget has **Show in the system tray / menu bar** and **Keep running when I close the window** (off; only available while the tray is on). With the second off, closing the window quits, as today.
- Its own choice of readings, order, display and size. Defaults: 5-hour, Weekly, Today, This month. On macOS the first chosen reading with a short value is shown next to the icon.
- Windows and macOS: a click opens a small panel (a second borderless window) with the readings, gear, Open BetterClaudeUI and Quit. It closes on Escape or when it loses focus. A right-click shows a native menu with Open and Quit. The HIG prefers a menu for menu bar extras unless the content is too complex; bars, rings and charts are the reason for the panel.
- Linux: a native menu with readings as text lines, Open and Quit, if the desktop supports tray icons.
- The icon has a normal and a **waiting** version, and its tooltip says when Claude is waiting in any session. This matters most when the window is closed to the tray. Open shows the window, where the sidebar badge leads to the prompt. Nothing can be approved from the tray panel. **[my call]**
- The icon does not draw a live percentage. (The mockup's ring-shaped icon was a placeholder.) **[my call]**
- Quit from the tray while Claude is replying or waiting asks for confirmation. **[my call]**
- It only works while the app is running. If the tray cannot be created, the app says so and closing the window quits (the window must never become unreachable).
- Verify that updates still reach the tray while the main window is hidden.

## 10. Saved settings

New fields in `AppConfig`, all with defaults so old config files load: sidebar and panel visibility, last Settings category, widget settings (readings with order, display and enabled; size; position; floating coordinates), tray settings (enabled, keep running, readings, size). The UI sanitizes them like themes: unknown ids are dropped and bad values fall back. They are included in data export like the rest of the config; restoring a backup does not turn on **Keep running**. **[my call]**

## 11. Testing and quality

- Test first for new logic: contrast and theme derivation, widget settings and reading formats, token parsing and accumulation, config defaults, Home message box behavior.
- A test checks contrast for every built-in theme.
- Component tests for the shared controls (keyboard use and accessible names), permission prompt order and focus, and tier hiding in the new places.
- Existing UI and Rust tests keep passing. The E2E scenarios (`tools/e2e.mjs`) depend on the current layout and are updated with it. Follow the safety rules in `docs/HANDOFF.md` 10i; use a throwaway profile (`BCU_CONFIG_DIR`) where a scenario allows it.
- Before each UI change is merged: screenshots in dark, light and High contrast, at the minimum window size (720×480) and the default size.
- Measure idle memory and launch time on a Windows release build before and after (about 157 MB and 0.9 s were recorded before). If blur causes visible lag, reduce it rather than ship it.

## 12. Delivery

One pull request per stage, each leaving the app usable; squash-merge when CI is green. Update `docs/PROGRESS.md` in each, and `docs/HANDOFF.md` and README screenshots at the end.

1. Design tokens, theme derivation and contrast fixes, icons, shared components.
2. New shell: sidebar, toolbar, glass and glow, title bar theme.
3. Conversation, composer, permission prompt, right panel.
4. Home with the message box; Usage.
5. Settings and other pages; remaining dialogs and screens.
6. In-app usage widget, including token events.
7. Tray / menu bar, with a decision record in `docs/DECISIONS/`.

Between stages 1 and 5 some screens may mix old and new styling. All features keep working.

## 13. Left to the builder

Exact spacing, sizes, blur and tint values, fade timing, breakpoints, component file layout and how state reaches the tray window, within the rules above.

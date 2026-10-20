# UX sanity guide

This is the acceptance contract for the desktop pets, their controls, and conversations.
Use it before adding another activity. A feature is ready when a person can discover it,
understand what happened, interrupt it, and return to a stable state.

## Start here as a user

- Double-click a figure or choose **Talk** from its menu. Settings → **Chat** shows the same
  conversation. Select a name for a private chat; **All figures** cannot send a private message.
- **Enter** sends; **Shift+Enter** adds a line. A message can contain up to 4,000 characters.
  Closing chat preserves its draft for that figure during this app session.
- Talk normally while a figure reads or plays. To change its activity, ask directly:
  “read a book”, “dance”, or “play Pong”. “I read a book today” is conversation.
  **Stop** cancels the current activity and queued conversation requests, including delayed AI actions.
- Picking up a tool means carrying it. **Use** explicitly activates its cursor controls.
  **Carry**, **Drop**, and **Escape** provide exits. Trash has **Undo**.
- **Export chat** saves the currently retained transcript as a text file. **New conversation**
  clears that figure’s transcript and chat context after confirmation. Notes in **Mind → Memories**
  are separate and remain until removed there.
- General → **Experience guide** keeps the basic controls available inside the app.

## Conversations without keys

**Ready immediately:** leave Brain set to **Offline**. The local dialogue engine tracks topics,
details you share, follow-up turns, character personality, and branching stories. Try:

1. “My name is Sam.”
2. “I am building a tiny platform game.”
3. “Why?” / “What about you?” / “The jumping feels awkward.”
4. “What do you remember about me?”
5. “Tell me a story.”
6. “Take the brass key to the tower.” → “Go to the garden.” → “Go home.”

Supported topics include your day, making things, games, friends and desktop life. This is authored
dialogue with stored context, not an unrestricted language model. Unknown subjects ask for direction;
they do not fabricate factual answers. Story actions affect the fictional story, not desktop tools.
Use “change the topic” to leave a story and return to ordinary conversation/actions.

**Open-ended local AI:** install [Ollama](https://ollama.com/download) separately and download a
model suitable for your computer. In General → Brain, choose **Ollama (local, no key)**, use
**Find models**, select the installed model, and choose **Chat**. The adapter connects only to
`127.0.0.1:11434`; it sends no API key and never reads the cloud-key store for this provider.
The app does not install Ollama or download a model. Local inference uses additional RAM/CPU/GPU.
If the server is unavailable, the app explains the failure and answers with built-in dialogue.
Full mode also allows autonomous model requests; Chat confines model calls to your conversations.

History is saved per stable figure identity on this device, including visits and returns. Retention
is bounded to 240 entries and 120,000 text characters; oldest entries are removed first. An entry
may be a message or a system note. Topic facts and the current story are saved separately so a
trimmed opening does not reset the conversation. Export before starting fresh if you want a copy.
Drafts are session-only. Optional model context uses the latest 32 turns within a 16,000-character
budget plus the character’s existing state/memories. It is not unlimited recall.

## Interaction contract

| Area | Required behavior | Reject the change if… |
| --- | --- | --- |
| Scope | A selected name owns its messages, settings, items and history. Bulk controls state their scope. | Chat broadcasts to All, or switching a name carries another figure’s draft. |
| Intent | Physical actions require a direct request or an explicit control. | A question, story choice, negated clause or activity mention starts a desktop action. |
| Continuity | Ordinary chat preserves a settled activity and the exact owned original. | Saying hello makes a reader stand up or replaces its book. |
| Cancellation | Stop invalidates pending work; Escape exits the focused interaction. | An old model response restarts an activity after Stop or New conversation. |
| Feedback | Explain unavailable requirements, offline capability and connection errors accurately. | Offline says “won’t understand”, or a stopped local server is described as a missing cloud key. |
| Stable layout | User controls open/close previews; controls keep their location. | A timer makes a court flash open, moves buttons, or hides a focused target. |
| Reading | Full text remains selectable and scrollable; new replies preserve history scroll position. | Long answers disappear into bubbles, force a scroll jump or rebuild a live region every frame. |
| Input | Multiline, IME composition, visible focus, useful labels and keyboard exits work. | Enter submits a half-composed word or typing R reloads a weapon. |
| Recovery | Destructive chat reset confirms its exact scope; trash offers Undo. | Closing chat discards a draft or an innocent click clears history. |
| Bounds | Panels remain inside the viewport and reserve room for controls. | Small screens clip the send/close controls or a transcript blocks its own composer. |

## Motion contract

Keep the existing procedural figures, proportions and chosen movement presets. Read a motion as
**notice → prepare → reach → contact → act → release → settle**. The timing can be quick, but contact
and recovery must be visible. A neutral resting stance should look relaxed, not like a permanent pose.

For every changed activity, inspect opening, mid-action, interruption and recovery in both facings,
with each preset and with 1, 2 and 5 figures. Use actual hands, feet and visible surfaces as anchors.
A book’s held cover is an outer edge; its spine is the interior depth reference. Face sorting should
use actual projected depth, and grip tests should prove contact with the real hand. Do not “fix” a
pose by weakening an acceptance assertion without explaining the actual geometry.

Check that hands reach, feet stay supported, furniture keeps its shape, and bystanders remain free.
Interrupt with Talk, Stop, Take, drag, removal of the supporting furniture and a participant leaving.
The same original item, bookmark, magazine and shared claims must survive or release appropriately.
Settings honors reduced-motion preferences for interface transitions; this is not a global reduction
of the physics simulation. Dense speech bubbles and approximate model/limb depth ordering remain
known limits requiring visual judgment.

## Repeatable acceptance

Run `npm run typecheck`, `npm run sim`, and the affected focused suites. The conversation-specific
checks are `npm run conversationcheck`, `node scripts/local-brain-check.mjs`, and (after a build)
`node scripts/conversation-ui-check.mjs`. `npm run browsercheck` exercises actual Chromium controls
and rendered activity/preset sequences; `npm run sanitycheck` checks physical/social invariants.
General → Development checks → **Check live world** runs the existing read-only runtime audit.

The chat UI check uses actual Chromium keyboard/input, reload, bounds and scroll behavior. Its
Settings bridge is simulated and labeled as such. The provider check uses a fake HTTP responder;
it does not establish actual local-model quality or speed. Native focus/click-through, macOS
permissions/Spaces, Windows DPI/helpers and real local inference still need hardware acceptance.
The earlier hinged-book prototype remains unfinished beyond the checks recorded in the handoff.

Next cleanup priorities: crowded bubble placement, richer action-specific anticipation/recovery,
extreme-scale crowded contact, and hardware focus/return behavior. Keep those separate from any
new Chrome/Finder integration milestone.

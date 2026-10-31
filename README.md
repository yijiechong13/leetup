# LeetUP — CS3249 Assignment 1 Prototype

## Prototyping method

LeetUP is a coded, interactive hybrid conversational and graphical interface built with React, TypeScript, and Vite.

The prototype uses prepared conversations to demonstrate the intended learning interaction for a Two Sum-style problem. It includes a problem panel, conversation panel, and reasoning checklist.

## How to run

Requirements: Node.js 24 LTS and npm. Internet access is required to install dependencies.

1. Extract the ZIP and open a terminal in the `leetup` folder.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the prototype:

   ```bash
   npm run dev
   ```

4. Open the local address displayed in the terminal, normally `http://localhost:5173`.

No API key or `.env` file is required. The submitted demonstration runs in scripted mode by default.

## How to demonstrate

1. Choose a scenario using the **Demo** dropdown.
2. Click **Start** if the opening screen is displayed.
3. Click **Next demo line** above the message input to submit each prepared learner response.
4. Read the tutor’s reply and observe changes to the reasoning checklist.
5. Continue to the feedback summary and optional reference code.

Scenario B demonstrates a complete interaction with progressive support. Scenarios A and C demonstrate alternative learner situations.

| Scenario | What it demonstrates |
|---|---|
| **A — An existing approach** | The learner proposes a hash map. Follow-up questions draw out their reasoning, correctness, edge cases, and complexity. |
| **B — An uncertain start** | The learner receives small questions, light and stronger hints, and a guided explanation when needed. Feedback records where support was provided. |
| **C — Repairing an approach** | The learner proposes sorting but loses the original indices. The tutor helps them repair their own approach rather than requiring a hash-map solution. |

The reasoning checklist represents areas of reasoning, not a mandatory order of questions. The prepared scenarios illustrate the intended progression.

## Prototype scope

The demonstration uses scripted responses rather than live LLM assessment. Use **Next demo line** to follow each scenario; unrecognised input produces a demo notice without advancing the conversation.

Optional LLM-related code is included, but configuring it is not required to review this prototype.

Voice input, code execution, and progress tracking across sessions are not implemented.

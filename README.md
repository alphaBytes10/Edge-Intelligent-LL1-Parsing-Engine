# ParseForge Edge - An Edge-Intelligent LL(1) Parsing Engine

> Client-side, zero-latency compiler intelligence. Grammar transformation, predictive analysis, and syntax validation - all computed at the edge (browser), no server needed.

### Why Edge Intelligence?

- **Zero-Latency Reasoning:** No API calls. `FIRST`, `FOLLOW`, `Parse Table` computed instantly in-browser.
- **Intelligent Transformation:** Auto-detects and fixes non-LL(1) issues - left recursion & common prefixes - like an intelligent co-pilot for grammars.
- **Predictive Parsing:** Uses 1-token lookahead intelligence to decide productions without backtracking.

### From Visualizer to Intelligence Engine
This is not a visualizer that just draws. It *reasons* about your grammar:
`Grammar -> Analyzes Flaws -> Auto-Corrects -> Validates LL(1) -> Parses`

![React](https://img.shields.io/badge/React-19-blue)
![Compiler Design](https://img.shields.io/badge/Subject-Compiler%20Design-orange)

### Live Demo Features

This is not just a parser. It implements the full LL(1) pipeline:

1.  **Grammar Input:** Supports `->` and `|` notation. Use `eps` for epsilon (ε).
2.  **Left Recursion Elimination:** Automatic detection & removal (both indirect and direct) - `elimLR()`
3.  **Left Factoring:** Removes common prefixes - `leftFactor()`
4.  **FIRST & FOLLOW:** Computes FIRST and FOLLOW sets iteratively
5.  **LL(1) Parse Table:** Builds `M[NT, T]` table and detects conflicts
6.  **Step-by-Step Parsing:** Shows full stack, input remaining, and action trace
7.  **Parse Tree Visualization:** SVG tree rendered with Knuth-style layout

### Visual Walkthrough

**1. Grammar Input & Transformations**
![Grammar Input & Transformations](LL1%20images/1.input.png)

**2. LL(1) Parse Table**
![LL(1) Parse Table](LL1%20images/2.Parse%20Table.png)

**3. Conflict Checker & FIRST/FOLLOW Sets**
![Conflict Checker & FIRST/FOLLOW Sets](LL1%20images/3.%20conflict%20checker.png)

**4. Parse Result: Input accepted, valid string of language**
![Parse Result: Input accepted, valid string of language](LL1%20images/4.%20Parse%20result.png)

**5. Collision Detection & Error Handling**
![Collision Detection & Error Handling](LL1%20images/collision/5.%20collision%20detection.png)

### Quick Start

#### Option 1: Online Compiler 

1. Open any react online compiler
2. Create new React project
3. Replace `App.jsx` with this code
4. Click Run -> Click `▶ RUN PARSER`

No installs, no terminal.

#### Option 2: Local Editor (VS Code)

Prerequisites: Node.js installed

1. Create project:
```bash
npm create vite@latest ll1-parser -- --template react
cd ll1-parser
```
2. Replace content of `src/App.jsx` with this code

3. Run:
```bash
npm install
npm run dev
```
4. Open link shown in terminal:
http://localhost:5173

### Grammar Format

One rule per line:
E -> E + T | T
T -> T * F | F
F -> ( E ) | id
- Terminals: `id`, `+`, `*`, `(`, `)` - anything not defined as Non-Terminal
- Use space to separate tokens: `id + id` not `id+id`
- For epsilon: `A -> eps` or `A -> epsilon`

### Example Input

Grammar:
E -> E + T | T
T -> T * F | F
F -> ( E ) | id
Input String:
id + id * id
Result: ✓ Accepted, Parse Tree Generated

### Tech Stack

- React (useState only, no external deps)
- Pure JS implementation of compiler algorithms
- SVG for tree visualization
- Dark theme: #0c0c15 background with #e8a020 accent

### Project Structure
```
App.jsx
├── parseGrammarText()  -> Parses text to grammar object
├── elimLR()            -> Left Recursion Elimination
├── leftFactor()        -> Left Factoring
├── computeFirst()      -> FIRST sets
├── computeFollow()     -> FOLLOW sets
├── buildTable()        -> LL(1) Parsing Table
├── ll1Parse()          -> Stack-based parser
└── layoutTree()        -> SVG Tree layout
```

### Additional Info

- What is LL(1)? L->R scan, Leftmost derivation, 1 lookahead
- Why remove left recursion? LL(1) can't handle it, leads to infinite loop
- Why left factoring? To avoid backtracking, makes grammar predictive
- When is grammar LL(1)? When parsing table has no conflicts

---
Made for Compiler Design Lab

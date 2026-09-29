import { useState } from "react";

// ─────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────
const EPS = "ε";
const DOLLAR = "$";

// ─────────────────────────────────────────────────────
// GRAMMAR PARSING
// ─────────────────────────────────────────────────────
function parseGrammarText(text) {
  const grammar = {};
  const order = [];
  for (const line of text.trim().split("\n")) {
    const t = line.trim();
    if (!t || !t.includes("->")) continue;
    const arrow = t.indexOf("->");
    const lhs = t.slice(0, arrow).trim();
    const rhs = t.slice(arrow + 2).trim();
    if (!lhs || !rhs) continue;
    const prods = rhs
      .split("|")
      .map((p) =>
        p
          .trim()
          .split(/\s+/)
          .filter(Boolean)
          .map((s) => (s === "eps" || s === "epsilon" ? EPS : s))
      )
      .filter((p) => p.length > 0);
    if (!grammar[lhs]) { grammar[lhs] = []; order.push(lhs); }
    grammar[lhs].push(...prods);
  }
  return { grammar, order, start: order[0] || null };
}

function getNTs(grammar) { return Object.keys(grammar); }

function getTerms(grammar) {
  const nts = new Set(getNTs(grammar));
  const terms = new Set();
  for (const prods of Object.values(grammar))
    for (const prod of prods)
      for (const s of prod)
        if (s !== EPS && !nts.has(s)) terms.add(s);
  return [...terms].sort();
}

function gToStr(grammar) {
  return Object.entries(grammar)
    .map(([lhs, prods]) => `${lhs} → ${prods.map((p) => p.join(" ")).join(" | ")}`)
    .join("\n");
}

function deepCopy(grammar) {
  const g = {};
  for (const [k, v] of Object.entries(grammar)) g[k] = v.map((p) => [...p]);
  return g;
}

// ─────────────────────────────────────────────────────
// FIRST OF SEQUENCE
// ─────────────────────────────────────────────────────
function firstOfSeq(seq, firstSets, nts) {
  const res = new Set();
  if (!seq || seq.length === 0) { res.add(EPS); return res; }
  let allEps = true;
  for (const sym of seq) {
    if (sym === EPS) break;
    if (!nts.has(sym)) { res.add(sym); allEps = false; break; }
    const f = firstSets[sym] || new Set();
    for (const s of f) if (s !== EPS) res.add(s);
    if (!f.has(EPS)) { allEps = false; break; }
  }
  if (allEps) res.add(EPS);
  return res;
}

// ─────────────────────────────────────────────────────
// COMPUTE FIRST SETS
// ─────────────────────────────────────────────────────
function computeFirst(grammar) {
  const nts = new Set(getNTs(grammar));
  const first = {};
  for (const nt of nts) first[nt] = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const [A, prods] of Object.entries(grammar))
      for (const prod of prods)
        for (const s of firstOfSeq(prod, first, nts))
          if (!first[A].has(s)) { first[A].add(s); changed = true; }
  }
  return first;
}

// ─────────────────────────────────────────────────────
// COMPUTE FOLLOW SETS
// ─────────────────────────────────────────────────────
function computeFollow(grammar, start, first) {
  const nts = new Set(getNTs(grammar));
  const follow = {};
  for (const nt of nts) follow[nt] = new Set();
  if (start) follow[start].add(DOLLAR);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [A, prods] of Object.entries(grammar)) {
      for (const prod of prods) {
        for (let i = 0; i < prod.length; i++) {
          const B = prod[i];
          if (!nts.has(B)) continue;
          const beta = prod.slice(i + 1);
          const fBeta = firstOfSeq(beta, first, nts);
          for (const s of fBeta)
            if (s !== EPS && !follow[B].has(s)) { follow[B].add(s); changed = true; }
          if (fBeta.has(EPS))
            for (const s of follow[A])
              if (!follow[B].has(s)) { follow[B].add(s); changed = true; }
        }
      }
    }
  }
  return follow;
}

// ─────────────────────────────────────────────────────
// ELIMINATE LEFT RECURSION
// ─────────────────────────────────────────────────────
function elimLR(grammar, order) {
  const g = deepCopy(grammar);
  const ord = [...order];
  const steps = [];

  for (let i = 0; i < ord.length; i++) {
    const Ai = ord[i];
    // Substitute Aj (j < i) into Ai
    for (let j = 0; j < i; j++) {
      const Aj = ord[j];
      const newProds = [];
      let substituted = false;
      for (const prod of g[Ai]) {
        if (prod[0] === Aj) {
          substituted = true;
          for (const ajp of g[Aj]) {
            const rest = prod.slice(1);
            if (ajp[0] === EPS) newProds.push(rest.length ? rest : [EPS]);
            else newProds.push([...ajp, ...rest]);
          }
        } else {
          newProds.push(prod);
        }
      }
      if (substituted) {
        g[Ai] = newProds;
        steps.push(`Substituted ${Aj} → {${g[Aj].map((p) => p.join(" ")).join(", ")}} into ${Ai}`);
      }
    }
    // Remove direct left recursion
    const rec = g[Ai].filter((p) => p[0] === Ai);
    const nonRec = g[Ai].filter((p) => p[0] !== Ai);
    if (rec.length > 0) {
      if (nonRec.length === 0) {
        steps.push(`⚠ ${Ai} has only left-recursive productions — skipped`);
        continue;
      }
      let prime = Ai + "'";
      while (g[prime]) prime += "'";
      g[Ai] = nonRec.map((p) => (p[0] === EPS ? [prime] : [...p, prime]));
      g[prime] = [...rec.map((p) => [...p.slice(1), prime]), [EPS]];
      ord.push(prime);
      steps.push(`Removed left recursion in ${Ai} → created ${prime}`);
    }
  }
  return { grammar: g, order: ord, steps };
}

// ─────────────────────────────────────────────────────
// LEFT FACTORING
// ─────────────────────────────────────────────────────
function lcpOf(prods) {
  if (!prods || !prods.length) return [];
  let prefix = [...prods[0]];
  for (let i = 1; i < prods.length; i++) {
    let len = 0;
    while (len < prefix.length && len < prods[i].length && prefix[len] === prods[i][len]) len++;
    prefix = prefix.slice(0, len);
    if (!prefix.length) break;
  }
  return prefix;
}

function leftFactor(grammar, order) {
  const g = deepCopy(grammar);
  let ord = [...order];
  const steps = [];
  let changed = true;
  while (changed) {
    changed = false;
    const toAdd = {};
    for (const A of [...ord]) {
      if (!g[A]) continue;
      // Group by first symbol
      const groups = {};
      for (const prod of g[A]) {
        const key = prod[0];
        if (!groups[key]) groups[key] = [];
        groups[key].push(prod);
      }
      const newProds = [];
      for (const [, group] of Object.entries(groups)) {
        if (group.length === 1) { newProds.push(group[0]); continue; }
        const prefix = lcpOf(group);
        if (!prefix.length) { newProds.push(...group); continue; }
        let prime = A + "'";
        while (g[prime] || toAdd[prime]) prime += "'";
        newProds.push([...prefix, prime]);
        toAdd[prime] = group.map((p) => {
          const rest = p.slice(prefix.length);
          return rest.length ? rest : [EPS];
        });
        steps.push(`Left factored ${A} on prefix "${prefix.join(" ")}" → created ${prime}`);
        changed = true;
      }
      g[A] = newProds;
    }
    for (const [k, v] of Object.entries(toAdd)) { g[k] = v; ord.push(k); }
  }
  return { grammar: g, order: ord, steps };
}

// ─────────────────────────────────────────────────────
// PARSING TABLE
// ─────────────────────────────────────────────────────
function buildTable(grammar, first, follow) {
  const nts = new Set(getNTs(grammar));
  const table = {};
  const conflicts = new Set();

  for (const [A, prods] of Object.entries(grammar)) {
    if (!table[A]) table[A] = {};
    for (const prod of prods) {
      const fa = firstOfSeq(prod, first, nts);
      // For each terminal a in FIRST(prod)
      for (const a of fa) {
        if (a === EPS) continue;
        if (table[A][a]) {
          conflicts.add(`M[${A}, ${a}]`);
          if (!Array.isArray(table[A][a][0])) table[A][a] = [table[A][a]];
          if (!table[A][a].some((p) => p.join(" ") === prod.join(" "))) table[A][a].push(prod);
        } else {
          table[A][a] = prod;
        }
      }
      // If ε in FIRST(prod), add for each b in FOLLOW(A)
      if (fa.has(EPS)) {
        for (const b of follow[A] || []) {
          if (table[A][b]) {
            conflicts.add(`M[${A}, ${b}]`);
            if (!Array.isArray(table[A][b][0])) table[A][b] = [table[A][b]];
            if (!table[A][b].some((p) => p.join(" ") === prod.join(" "))) table[A][b].push(prod);
          } else {
            table[A][b] = prod;
          }
        }
      }
    }
  }
  return { table, isLL1: conflicts.size === 0, conflicts: [...conflicts] };
}

// ─────────────────────────────────────────────────────
// PARSE NODE
// ─────────────────────────────────────────────────────
let _nid = 0;
class PNode {
  constructor(sym) { this.sym = sym; this.children = []; this.id = _nid++; }
}

// ─────────────────────────────────────────────────────
// LL(1) PARSE
// ─────────────────────────────────────────────────────
function ll1Parse(inputStr, grammar, table, start) {
  _nid = 0;
  const tokens = inputStr.trim().split(/\s+/).filter(Boolean);
  tokens.push(DOLLAR);
  const nts = new Set(getNTs(grammar));
  const root = new PNode(start);
  const stack = [{ sym: DOLLAR, node: null }, { sym: start, node: root }];
  let pos = 0;
  const steps = [];
  let error = null;

  while (stack.length > 1) {
    const top = stack[stack.length - 1];
    const a = tokens[pos] !== undefined ? tokens[pos] : DOLLAR;
    const stackStr = [...stack].map((s) => s.sym).reverse().join(" ");
    const inputLeft = tokens.slice(pos).join(" ");

    if (top.sym === a) {
      steps.push({ stack: stackStr, input: inputLeft, action: `match '${a}'`, ok: true });
      stack.pop();
      pos++;
    } else if (nts.has(top.sym)) {
      const entry = table[top.sym]?.[a];
      if (!entry) {
        steps.push({ stack: stackStr, input: inputLeft, action: `ERROR: no rule for [${top.sym}, ${a}]`, ok: false });
        error = `Parse error: no entry in table for [${top.sym}, ${a}]`;
        break;
      }
      // entry is always a single production here (we only call when isLL1=true)
      const prod = Array.isArray(entry[0]) ? entry[0] : entry;
      steps.push({ stack: stackStr, input: inputLeft, action: `${top.sym} → ${prod.join(" ")}`, ok: true });
      stack.pop();
      if (prod[0] !== EPS) {
        const children = prod.map((s) => new PNode(s));
        top.node.children = children;
        for (let i = children.length - 1; i >= 0; i--)
          stack.push({ sym: prod[i], node: children[i] });
      } else {
        top.node.children = [new PNode(EPS)];
      }
    } else {
      steps.push({ stack: stackStr, input: inputLeft, action: `ERROR: expected '${top.sym}', got '${a}'`, ok: false });
      error = `Expected '${top.sym}', got '${a}'`;
      break;
    }
  }

  if (!error && pos < tokens.length && tokens[pos] === DOLLAR)
    steps.push({ stack: DOLLAR, input: DOLLAR, action: "✓ ACCEPT", ok: true });
  else if (!error)
    error = `Extra tokens after parse: '${tokens[pos]}'`;

  return { ok: !error, error, steps, tree: root };
}

// ─────────────────────────────────────────────────────
// TREE LAYOUT (Knuth-style leaf-counter)
// ─────────────────────────────────────────────────────
function layoutTree(root) {
  const nodes = [],
    edges = [];
  const cnt = { v: 0 };

  function place(n, depth) {
    if (!n.children.length) {
      n._x = cnt.v++ * 78;
      n._y = depth * 72;
    } else {
      for (const c of n.children) place(c, depth + 1);
      n._x = (n.children[0]._x + n.children[n.children.length - 1]._x) / 2;
      n._y = depth * 72;
    }
    nodes.push(n);
    for (const c of n.children)
      edges.push({ x1: n._x, y1: n._y, x2: c._x, y2: c._y });
  }

  place(root, 0);
  const minX = Math.min(...nodes.map((n) => n._x));
  const maxX = Math.max(...nodes.map((n) => n._x));
  const maxY = Math.max(...nodes.map((n) => n._y));
  const off = -minX + 50;
  return { nodes, edges, width: maxX - minX + 100, height: maxY + 80, off };
}

// ─────────────────────────────────────────────────────
// DEFAULTS
// ─────────────────────────────────────────────────────
const DEFAULT_GRAMMAR = `E -> E + T | T
T -> T * F | F
F -> ( E ) | id`;
const DEFAULT_INPUT = `id + id * id`;

// ─────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────
export default function App() {
  const [gText, setGText] = useState(DEFAULT_GRAMMAR);
  const [inText, setInText] = useState(DEFAULT_INPUT);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState("");
  const [tab, setTab] = useState(0);

  function run() {
    try {
      setErr("");
      const { grammar: og, order: oo, start } = parseGrammarText(gText);
      if (!start) throw new Error("No valid grammar found. Check your input format: A -> α | β");
      const ntsCheck = new Set(Object.keys(og));
      // Validate all RHS symbols resolve
      const { grammar: g1, order: o1, steps: lrSteps } = elimLR(og, oo);
      const { grammar: g2, order: o2, steps: lfSteps } = leftFactor(g1, o1);
      const first = computeFirst(g2);
      const follow = computeFollow(g2, start, first);
      const { table, isLL1, conflicts } = buildTable(g2, first, follow);
      const terms = getTerms(g2);
      const nts = getNTs(g2);
      let parseResult = null;
      if (isLL1 && inText.trim()) parseResult = ll1Parse(inText, g2, table, start);
      setResult({ og, oo, g1, o1, lrSteps, g2, o2, lfSteps, first, follow, table, isLL1, conflicts, terms, nts, start, parseResult });
      setTab(0);
    } catch (e) {
      setErr(e.message);
    }
  }

  const ss = (s) => [...s].sort().join(", ");
  const tabs = ["Transformations", "FIRST & FOLLOW", "Parse Table", "Parse Result"];

  return (
    <div style={{ fontFamily: "'JetBrains Mono','Fira Code','Cascadia Code',monospace", background: "#0c0c15", color: "#b8b8cc", minHeight: "100vh" }}>
      {/* ── Header ── */}
      <div style={{ background: "#10101e", borderBottom: "1px solid #22223a", padding: "18px 28px" }}>
        <div style={{ fontSize: "10px", color: "#44446a", letterSpacing: "3px", textTransform: "uppercase" }}>System Software & Compiler Design</div>
        <div style={{ fontSize: "20px", color: "#e8a020", fontWeight: 700, marginTop: "3px" }}>ParseForge Edge — Edge-Intelligent LL(1) Engine</div>
        <div style={{ fontSize: "10px", color: "#44446a", marginTop: "3px" }}>Left Recursion Elimination · Left Factoring · FIRST/FOLLOW · Parse Table · Parse Tree</div>
      </div>

      {/* ── Input Grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "18px", padding: "22px 28px 0" }}>
        <div>
          <Label>Grammar Rules</Label>
          <textarea
            value={gText}
            onChange={(e) => setGText(e.target.value)}
            rows={7}
            style={{ width: "100%", background: "#10101e", border: "1px solid #22223a", color: "#b8b8cc", padding: "12px", fontSize: "13px", fontFamily: "inherit", resize: "vertical", outline: "none", boxSizing: "border-box", lineHeight: 1.6 }}
            placeholder={"E -> E + T | T\nT -> T * F | F\nF -> ( E ) | id"}
          />
          <Hint>One rule per line. Use | for alternatives. Use eps for ε.</Hint>
        </div>
        <div>
          <Label>Input String (space-separated tokens)</Label>
          <input
            value={inText}
            onChange={(e) => setInText(e.target.value)}
            style={{ width: "100%", background: "#10101e", border: "1px solid #22223a", color: "#b8b8cc", padding: "12px", fontSize: "13px", fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
            placeholder="id + id * id"
          />
          <Hint style={{ marginBottom: "14px" }}>Tokens must match terminals in the grammar exactly.</Hint>
          <button
            onClick={run}
            style={{ background: "#e8a020", color: "#0c0c15", border: "none", padding: "10px 30px", fontSize: "11px", fontFamily: "inherit", fontWeight: 700, letterSpacing: "2px", textTransform: "uppercase", cursor: "pointer" }}
          >
            ▶ RUN PARSER
          </button>
        </div>
      </div>

      {err && (
        <div style={{ margin: "16px 28px 0", padding: "10px 14px", background: "#1e0808", border: "1px solid #4a1010", color: "#e05050", fontSize: "12px" }}>
          ✗ {err}
        </div>
      )}

      {/* ── Results ── */}
      {result && (
        <div style={{ margin: "22px 28px 0" }}>
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #22223a" }}>
            {tabs.map((t, i) => (
              <button
                key={i}
                onClick={() => setTab(i)}
                style={{ background: "transparent", color: tab === i ? "#e8a020" : "#44446a", border: "none", borderBottom: tab === i ? "2px solid #e8a020" : "2px solid transparent", padding: "9px 18px", fontSize: "10px", letterSpacing: "1.5px", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit", transition: "color 0.15s" }}
              >
                {t}
              </button>
            ))}
          </div>

          <div style={{ background: "#10101e", border: "1px solid #22223a", borderTop: "none", padding: "22px" }}>
            {/* ── TAB 0: Transformations ── */}
            {tab === 0 && (
              <div>
                <Sec title="Original Grammar">
                  <Pre>{gToStr(result.og)}</Pre>
                </Sec>

                <Sec title={`Step 1 — Left Recursion Elimination${result.lrSteps.length === 0 ? " (none detected)" : ""}`}>
                  {result.lrSteps.length > 0 ? (
                    <>
                      <Steps steps={result.lrSteps} />
                      <Pre>{gToStr(result.g1)}</Pre>
                    </>
                  ) : (
                    <Muted>No left recursion found in the grammar.</Muted>
                  )}
                </Sec>

                <Sec title={`Step 2 — Left Factoring${result.lfSteps.length === 0 ? " (none needed)" : ""}`}>
                  {result.lfSteps.length > 0 ? (
                    <>
                      <Steps steps={result.lfSteps} />
                      <Pre>{gToStr(result.g2)}</Pre>
                    </>
                  ) : (
                    <Muted>No common prefixes found — no left factoring needed.</Muted>
                  )}
                </Sec>

                <Sec title="Final Transformed Grammar">
                  <Pre>{gToStr(result.g2)}</Pre>
                </Sec>
              </div>
            )}

            {/* ── TAB 1: FIRST & FOLLOW ── */}
            {tab === 1 && (
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: "12px" }}>
                <thead>
                  <tr>
                    {["Non-Terminal", "FIRST Set", "FOLLOW Set"].map((h) => (
                      <th key={h} style={{ padding: "8px 14px", background: "#0c0c15", color: "#44446a", fontSize: "10px", letterSpacing: "1px", textAlign: "left", borderBottom: "1px solid #22223a" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.nts.map((nt) => (
                    <tr key={nt}>
                      <TD accent bold>{nt}</TD>
                      <TD>{"{ " + ss(result.first[nt] || new Set()) + " }"}</TD>
                      <TD>{"{ " + ss(result.follow[nt] || new Set()) + " }"}</TD>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {/* ── TAB 2: Parse Table ── */}
            {tab === 2 && (
              <div>
                <div style={{ marginBottom: "14px" }}>
                  {result.isLL1 ? (
                    <Badge green>✓ Grammar IS LL(1) — no conflicts detected in the parsing table</Badge>
                  ) : (
                    <Badge red>{`✗ Grammar is NOT LL(1) — conflicts at: ${result.conflicts.join(", ")}`}</Badge>
                  )}
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ borderCollapse: "collapse", fontSize: "11px" }}>
                    <thead>
                      <tr>
                        <th style={{ padding: "8px 14px", background: "#0c0c15", color: "#44446a", fontSize: "10px", letterSpacing: "1px", textAlign: "left", borderBottom: "1px solid #22223a", whiteSpace: "nowrap" }}>NT \ a</th>
                        {[...result.terms, DOLLAR].map((t) => (
                          <th key={t} style={{ padding: "8px 14px", background: "#0c0c15", color: "#44446a", fontSize: "10px", letterSpacing: "1px", textAlign: "center", borderBottom: "1px solid #22223a", whiteSpace: "nowrap" }}>{t}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.nts.map((nt) => (
                        <tr key={nt}>
                          <TD accent bold>{nt}</TD>
                          {[...result.terms, DOLLAR].map((t) => {
                            const cell = result.table[nt]?.[t];
                            const isConflict = result.conflicts.some((c) => c === `M[${nt}, ${t}]`);
                            if (!cell) return <TD key={t} muted>—</TD>;
                            let display;
                            if (Array.isArray(cell[0])) {
                              display = cell.map((p) => `${nt}→${p.join(" ")}`).join(" / ");
                            } else {
                              display = `${nt}→${cell.join(" ")}`;
                            }
                            return <TD key={t} conflict={isConflict} center>{display}</TD>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* ── TAB 3: Parse Result ── */}
            {tab === 3 && (
              <div>
                {!result.isLL1 && <Badge red>Cannot parse: grammar is not LL(1).</Badge>}
                {result.isLL1 && !result.parseResult && <Muted>No input provided.</Muted>}
                {result.parseResult && (
                  <>
                    <div style={{ marginBottom: "18px" }}>
                      {result.parseResult.ok ? (
                        <Badge green>✓ Input accepted — valid string of the language</Badge>
                      ) : (
                        <Badge red>{`✗ Input rejected — ${result.parseResult.error}`}</Badge>
                      )}
                    </div>

                    <Sec title="Parsing Steps (Stack Trace)">
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ borderCollapse: "collapse", fontSize: "11px", width: "100%" }}>
                          <thead>
                            <tr>
                              {["#", "Stack", "Input Remaining", "Action"].map((h) => (
                                <th key={h} style={{ padding: "7px 12px", background: "#0c0c15", color: "#44446a", fontSize: "10px", letterSpacing: "1px", textAlign: "left", borderBottom: "1px solid #22223a", whiteSpace: "nowrap" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {result.parseResult.steps.map((s, i) => (
                              <tr key={i}>
                                <TD muted>{i + 1}</TD>
                                <TD>{s.stack}</TD>
                                <TD>{s.input}</TD>
                                <TD
                                  accept={s.action.includes("ACCEPT")}
                                  conflict={!s.ok}
                                >
                                  {s.action}
                                </TD>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Sec>

                    {result.parseResult.ok && (
                      <Sec title="Parse Tree">
                        <ParseTreeSVG root={result.parseResult.tree} />
                      </Sec>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────────────
function Label({ children }) {
  return <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#e8a020", textTransform: "uppercase", marginBottom: "7px" }}>{children}</div>;
}
function Hint({ children, style }) {
  return <div style={{ fontSize: "10px", color: "#33334e", marginTop: "5px", ...style }}>{children}</div>;
}
function Sec({ title, children }) {
  return (
    <div style={{ marginBottom: "22px" }}>
      <div style={{ fontSize: "10px", letterSpacing: "2px", color: "#55557a", textTransform: "uppercase", marginBottom: "8px", borderLeft: "2px solid #e8a020", paddingLeft: "8px" }}>{title}</div>
      {children}
    </div>
  );
}
function Pre({ children }) {
  return <pre style={{ background: "#0a0a12", border: "1px solid #1c1c30", padding: "12px 14px", fontSize: "12px", color: "#9090b0", overflowX: "auto", margin: 0, lineHeight: 1.7 }}>{children}</pre>;
}
function Steps({ steps }) {
  return (
    <div style={{ marginBottom: "10px" }}>
      {steps.map((s, i) => (
        <div key={i} style={{ fontSize: "11px", color: "#55557a", padding: "2px 0 2px 8px" }}>→ {s}</div>
      ))}
    </div>
  );
}
function Muted({ children }) {
  return <div style={{ fontSize: "12px", color: "#33334e", fontStyle: "italic" }}>{children}</div>;
}
function Badge({ green, red, children }) {
  return (
    <span style={{ display: "inline-block", padding: "5px 14px", fontSize: "11px", background: green ? "#0c220c" : "#220c0c", border: `1px solid ${green ? "#1a4a1a" : "#4a1a1a"}`, color: green ? "#38c038" : "#c03838" }}>
      {children}
    </span>
  );
}
function TD({ children, accent, bold, muted, conflict, accept, center }) {
  return (
    <td
      style={{
        padding: "6px 12px",
        borderBottom: "1px solid #161628",
        color: conflict ? "#c03838" : accept ? "#38c038" : accent ? "#e8a020" : muted ? "#33334e" : "#9090b0",
        fontWeight: bold ? 700 : 400,
        fontSize: "12px",
        whiteSpace: "nowrap",
        background: conflict ? "#160808" : "transparent",
        textAlign: center ? "center" : "left",
        fontFamily: "'JetBrains Mono','Fira Code',monospace",
      }}
    >
      {children}
    </td>
  );
}

// ─────────────────────────────────────────────────────
// PARSE TREE SVG
// ─────────────────────────────────────────────────────
function ParseTreeSVG({ root }) {
  if (!root) return null;
  const { nodes, edges, width, height, off } = layoutTree(root);
  const svgW = Math.max(width + 100, 400);
  const svgH = height + 60;

  return (
    <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "520px", background: "#0a0a12", border: "1px solid #1c1c30", padding: "10px" }}>
      <svg width={svgW} height={svgH} style={{ display: "block" }}>
        {/* Edges */}
        {edges.map((e, i) => (
          <line key={i} x1={e.x1 + off} y1={e.y1 + 40} x2={e.x2 + off} y2={e.y2 + 40} stroke="#25254a" strokeWidth="1.5" />
        ))}
        {/* Nodes */}
        {nodes.map((n) => {
          const isInternal = n.children.length > 0;
          const isEps = n.sym === EPS;
          const cx = n._x + off;
          const cy = n._y + 40;
          return (
            <g key={n.id}>
              <circle
                cx={cx} cy={cy} r={20}
                fill={isEps ? "#0d0d1a" : isInternal ? "#181830" : "#0d1e14"}
                stroke={isEps ? "#33334e" : isInternal ? "#e8a020" : "#38c07a"}
                strokeWidth="1.5"
              />
              <text
                x={cx} y={cy + 4}
                textAnchor="middle"
                fontSize={n.sym.length > 2 ? "9" : "11"}
                fill={isEps ? "#44446a" : isInternal ? "#e8a020" : "#38c07a"}
                fontFamily="monospace"
                fontWeight={isInternal ? "700" : "400"}
              >
                {n.sym}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

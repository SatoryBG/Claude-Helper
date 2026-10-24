export const meta = {
  name: 'satory-build',
  description: 'Satory: runs the tasks from .satory/plan.json autonomously - Dev → Reviewer → QA → UI → Security → Docs → commit/push, with a limited number of rounds per task',
  whenToUse: 'Started by /satory-devteam:build after the SPEC and the plan are approved. Optional arguments: project=<path> milestone=<M2> max=<number of tasks> rounds=<rounds>',
  phases: [
    { title: 'Prepare', detail: 'reads and validates the plan' },
    { title: 'Dev', detail: 'implementation + build/lint' },
    { title: 'Review', detail: 'code review against the SPEC and the mini-spec' },
    { title: 'QA', detail: 'staging, new tests, the whole test suite' },
    { title: 'UI', detail: 'browser review against docs/UI.md: viewports, accessibility, consistency' },
    { title: 'Security', detail: 'scanners + audit' },
    { title: 'Full tests', detail: 'the whole e2e suite (experimental e2e_task_first only)' },
    { title: 'Docs', detail: 'documentation, merge, push, staging' },
    { title: 'Milestone review', detail: 'data rules across the finished milestone; questions for the user' },
    { title: 'Planning', detail: 'tasks for the questions the user answered' },
  ],
}

// ------------------------------------------------------------------ config --

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw
  const out = {}
  for (const tok of String(raw || '').split(/\s+/).filter(Boolean)) {
    const i = tok.indexOf('=')
    if (i > 0) out[tok.slice(0, i)] = tok.slice(i + 1)
    else if (tok.includes('/')) out.project = tok
    else if (/^M\d+$/i.test(tok)) out.milestone = tok
  }
  return out
}

const A = parseArgs(args)
const MODELS = {
  dev: 'opus', devops: 'opus', reviewer: 'opus', qa: 'opus', 'ui-reviewer': 'opus', security: 'opus', docs: 'sonnet', auditor: 'opus', planner: 'opus',
  'code-health': 'opus',
  // runnerLong runs the steps that can take tens of minutes (build, tests, deploy): it has to wait for a
  // Bash call that moved to the background instead of returning early, which haiku does not do reliably
  runner: 'haiku', runnerLong: 'sonnet',
  ...(A.models || {}),
}
const MAX_TASKS = Number(A.max || A.maxTasks || 1000)
const MILESTONE = A.milestone || null
const QA_ATTEMPTS = 3
const WAIT_SECONDS = 540  // one `satory wait` call, below the 600 s Bash limit
const WAIT_CALLS = 20     // up to 3 hours for one long step
const q = s => "'" + String(s).replace(/'/g, `'\\''`) + "'"
// python3 explicitly: the executable bit does not survive commits from Windows (core.filemode=false)
const BIN = A.bin ? `python3 ${q(A.bin)}` : 'satory'
const AGENTS_DIR = A.agentsDir || null  // for the role-file fallback
let PROJECT = A.project || null
let MAX_ROUNDS = 33
let UI_REVIEW = false
let LANG = 'en'  // the project's documentation language: also for the questions to the user

// ----------------------------------------------------------------- schemas --

const RUN_SCHEMA = {
  type: 'object',
  properties: { exit_code: { type: 'integer' }, stdout: { type: 'string' } },
  required: ['exit_code', 'stdout'],
}
// Questions for the user that never stop the workflow (see `satory question`)
const GAP_ITEMS = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
      title: { type: 'string', description: 'One line, in the documentation language' },
      detail: { type: 'string', description: 'What is undefined, what can go wrong with which data, what was done meanwhile' },
      options: { type: 'array', items: { type: 'string' }, description: '2-4 possible answers, the recommended one first' },
      refs: { type: 'array', items: { type: 'string' }, description: 'R-/AC- ids, files' },
    },
    required: ['severity', 'title', 'detail'],
  },
}
const DEV_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string', description: 'What you did in this round (2-6 sentences)' },
    changes: { type: 'array', items: { type: 'string' }, description: 'Short list of the changes' },
    mini_spec_updated: { type: 'boolean' },
    disputes: {
      type: 'array',
      items: { type: 'object', properties: { test: { type: 'string' }, reason: { type: 'string' } }, required: ['test', 'reason'] },
    },
    blocked_question: { type: 'string', description: 'Empty, unless the task cannot continue without a business decision by the user' },
    assumptions: { ...GAP_ITEMS, description: 'New in this round: product behaviour the SPEC does not define and you chose yourself, for the user to confirm later (does not stop the task)' },
  },
  required: ['summary', 'changes', 'mini_spec_updated', 'disputes', 'blocked_question'],
}
const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['approve', 'changes_requested'] },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          file: { type: 'string' }, line: { type: 'integer' }, issue: { type: 'string' }, fix: { type: 'string' },
        },
        required: ['severity', 'file', 'issue', 'fix'],
      },
    },
    spec_gaps: { ...GAP_ITEMS, description: 'New in this round: data rules the SPEC does not define (questions for the user; they do not stop the task)' },
  },
  required: ['verdict', 'summary', 'findings'],
}
const QA_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    summary: { type: 'string' },
    mini_spec_complete: { type: 'boolean' },
    tests_added: { type: 'array', items: { type: 'string' } },
    failures: {
      type: 'array',
      items: {
        type: 'object',
        properties: { test: { type: 'string' }, expected: { type: 'string' }, actual: { type: 'string' }, repro: { type: 'string' } },
        required: ['test', 'expected', 'actual'],
      },
    },
    findings: {
      type: 'array',
      description: 'Defects from the exploratory testing or an incomplete mini-spec',
      items: {
        type: 'object',
        properties: { severity: { type: 'string', enum: ['blocker', 'major', 'minor'] }, description: { type: 'string' }, repro: { type: 'string' } },
        required: ['severity', 'description'],
      },
    },
    spec_gaps: { ...GAP_ITEMS, description: 'New in this round: data rules the SPEC does not define (questions for the user; they do not stop the task)' },
  },
  required: ['verdict', 'summary', 'mini_spec_complete', 'tests_added', 'failures', 'findings'],
}
const UI_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    summary: { type: 'string' },
    pages_checked: { type: 'array', items: { type: 'string' }, description: 'Routes and states that were checked' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['blocker', 'major', 'minor', 'nit'] },
          page: { type: 'string' }, viewport: { type: 'string' }, screenshot: { type: 'string' },
          issue: { type: 'string' }, fix: { type: 'string' },
        },
        required: ['severity', 'page', 'issue', 'fix'],
      },
    },
  },
  required: ['verdict', 'summary', 'pages_checked', 'findings'],
}
const SEC_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    summary: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          severity: { type: 'string', enum: ['critical', 'high', 'medium', 'low', 'info'] },
          category: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer' },
          issue: { type: 'string' }, attack: { type: 'string' }, fix: { type: 'string' },
        },
        required: ['severity', 'category', 'file', 'issue', 'fix'],
      },
    },
  },
  required: ['verdict', 'summary', 'findings'],
}
const AUDIT_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: ['question', 'decision', 'fix', 'test'] },
          ...GAP_ITEMS.items.properties,
        },
        required: ['kind', 'severity', 'title', 'detail'],
      },
    },
  },
  required: ['summary', 'items'],
}
const HEALTH_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    title: { type: 'string', description: 'The title of the refactoring task, in the documentation language' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' }, kind: { type: 'string', enum: ['duplication', 'efficiency', 'naming', 'dead_code', 'consistency'] },
          impact: { type: 'string', enum: ['major', 'minor'] }, description: { type: 'string' },
          files: { type: 'array', items: { type: 'string' } }, ui: { type: 'boolean' },
        },
        required: ['title', 'kind', 'impact', 'description', 'files', 'ui'],
      },
    },
  },
  required: ['summary', 'title', 'items'],
}
const PLANNER_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    tasks: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ref: { type: 'string', description: 'Your name for the task, for depends_on/depends (e.g. "fix-currency")' },
          title: { type: 'string' }, milestone: { type: 'string' },
          owner: { type: 'string', enum: ['dev', 'devops'] }, ui: { type: 'boolean' },
          depends_on: { type: 'array', items: { type: 'string' } },
          requirements: { type: 'array', items: { type: 'string' } },
          description: { type: 'string' }, acceptance: { type: 'array', items: { type: 'string' } },
          questions: { type: 'array', items: { type: 'string' }, description: 'Question ids the task covers' },
          insert_before: { type: 'string', description: 'A task to do that comes after this one' },
          subtasks: {
            type: 'array',
            description: 'The fixes of this task, one per group of related answers; all are done in one cycle',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' }, description: { type: 'string' },
                acceptance: { type: 'array', items: { type: 'string' } },
                questions: { type: 'array', items: { type: 'string' } },
              },
              required: ['title', 'description', 'acceptance', 'questions'],
            },
          },
        },
        required: ['ref', 'title', 'milestone', 'owner', 'ui', 'depends_on', 'description', 'acceptance', 'questions'],
      },
    },
    depends: {
      type: 'array',
      items: {
        type: 'object',
        properties: { task: { type: 'string' }, add: { type: 'array', items: { type: 'string' } } },
        required: ['task', 'add'],
      },
    },
    resolved: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'] },
    },
  },
  required: ['summary', 'tasks', 'depends', 'resolved'],
}
const DOCS_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' }, files: { type: 'array', items: { type: 'string' } } },
  required: ['summary', 'files'],
}

// ------------------------------------------------------------------ helpers --

const bullets = items => items.map(x => `- ${x}`).join('\n')
const where = f => (f.line ? `${f.file}:${f.line}` : f.file)
const at = f => [f.page, f.viewport].filter(Boolean).join(' @ ')

// Plugin agents are registered as `satory-devteam:<role>` when a Claude session starts. If they are missing
// (plugin installed mid-session), fall back to a default agent that reads its role from the agent file.
let ROLE_FILES = A.roleFiles === true
async function spawn(role, prompt, opts) {
  if (!ROLE_FILES) {
    try {
      return await agent(prompt, { ...opts, agentType: `satory-devteam:${role}` })
    } catch (e) {
      if (!/not found/i.test(String(e && e.message)) || !AGENTS_DIR) throw e
      ROLE_FILES = true
      log(`The satory-devteam:* agents are not loaded in this session - roles are read from ${AGENTS_DIR} (restart Claude to load them normally).`)
    }
  }
  if (role === 'runner') return agent(prompt, opts)
  return agent(`First read the whole file ${AGENTS_DIR}/${role}.md (without the YAML front matter) - it is your role and your rules; follow them strictly.\n\n${prompt}`, opts)
}

function runPrompt(full) {
  return `Run exactly this bash command once and return its exit code and stdout verbatim.\n\n` +
    `Call the Bash tool with \`timeout: 600000\` (the maximum - the command can take several minutes) and WITHOUT run_in_background. ` +
    `If the tool still reports that the command moved to a background task, wait for that task's completion notification, then return the exit code and the full content of its output file. Never run the command a second time.\n\n` +
    `Return your result only in a later message, after the Bash tool result has arrived - never in the same message as the Bash call, and never with invented or placeholder values.\n\n` +
    `\`\`\`bash\n${full}\n\`\`\``
}

function parseOut(text) {
  text = String(text)
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end < start) return undefined
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch (e) {
    return undefined
  }
}

// A long step also writes its stdout and exit code to .satory/run/sh/<id>.*, so its result survives a
// runner that returns before the step ends (see collect). `satory workflow` empties the folder.
let SH_SEQ = 0
function captured(full, id) {
  const f = `${q(PROJECT)}/.satory/run/sh/${id}`
  return `mkdir -p ${q(PROJECT)}/.satory/run/sh && rm -f ${f}.* && echo $$ > ${f}.pid && { ${full}\n} > ${f}.out 2> ${f}.err; ` +
    `rc=$?; echo $rc > ${f}.done; cat ${f}.out; cat ${f}.err >&2; (exit $rc)`
}

// Waits for a captured step with `satory wait`, in calls short enough to never leave the foreground.
// Returns the step's own JSON, or {wait: 'not_started' | 'died', error} from the CLI.
async function collect(id, label, phase) {
  const prompt = runPrompt(`${BIN} --project ${q(PROJECT)} wait ${id} --timeout ${WAIT_SECONDS}`)
  for (let i = 1; i <= WAIT_CALLS; i++) {
    const w = await spawn('runner', prompt, { phase, label: `satory wait ${label} (${i})`, model: MODELS.runner, schema: RUN_SCHEMA })
    const res = w ? parseOut(w.stdout) : undefined
    if (res && res.wait !== 'pending') return res
  }
  throw new Error(`satory ${label}: no result after waiting ${Math.round(WAIT_CALLS * WAIT_SECONDS / 60)} minutes - see .satory/run/sh/${id}.*`)
}

async function sh(cmd, { phase, label, note, long = false } = {}) {
  let full = `${BIN}${PROJECT ? ` --project ${q(PROJECT)}` : ''} ${cmd}`
  if (note !== undefined) {
    const body = String(note).replace(/^SATORY_EOF$/gm, 'SATORY_EOF_')
    full += ` --note-stdin <<'SATORY_EOF'\n${body}\nSATORY_EOF`
  }
  const id = long && PROJECT ? `${++SH_SEQ}-${cmd.split(' ').slice(0, 3).join('-').replace(/[^\w.-]/g, '')}` : null
  const prompt = runPrompt(id ? captured(full, id) : full)
  const opts = { phase, label: `satory ${label || cmd}`, model: long ? MODELS.runnerLong : MODELS.runner, schema: RUN_SCHEMA }
  for (let attempt = 1; ; attempt++) {
    const r = await spawn('runner', prompt, opts)
    let res = r ? parseOut(r.stdout) : undefined
    if (res === undefined && id) res = await collect(id, label || cmd, phase)
    // run again only when the command surely did not run, never twice
    const notRun = id ? res && res.wait === 'not_started' : !r
    if (notRun && attempt < 2) continue
    if (res && id && res.wait) throw new Error(`satory ${cmd}: ${res.error}`)
    if (res !== undefined) return res
    if (!r) throw new Error(`satory ${cmd}: the runner returned no result`)
    throw new Error(`satory ${cmd}: unparsable output (exit ${r.exit_code}): ${String(r.stdout).slice(0, 300)}`)
  }
}

function must(res, what) {
  if (res && res.error) throw new Error(`${what}: ${res.error}`)
  return res
}

function gateLines(gates) {
  return Object.entries(gates || {})
    .filter(([, g]) => !g.ok)
    .map(([name, g]) => `Check \`${name}\` fails (exit ${g.exit}) - full log: ${g.log}` +
      (g.scope === 'task' ? ' (only this task\'s tests and the smoke tests ran)' : ''))
}

function flakyLog(gates, tag) {
  const flaky = (gates && gates.e2e && gates.e2e.flaky) || []
  if (flaky.length) log(`⚠ ${tag}: ${flaky.length} e2e test(s) passed only on the retry - recorded as flaky for the user`)
}

function context(t, start) {
  return [
    `Project: ${PROJECT}`,
    `Task: ${t.id} - ${t.title} (owner: ${t.owner})`,
    `Task file: docs/tasks/${t.id}.md`,
    `Git branch: ${start.branch}; task base: ${start.base}`,
    `satory CLI: ${BIN}`,
    `Documentation language: ${LANG} - write the task file and every question for the user (titles, details, options) in it`,
  ].join('\n')
}

// What is already in the register of questions, so an agent does not report it again in other words.
// The note is read once per round; the items Dev, the Reviewer and QA add during the round are appended
// with withAdded, so the next agent of the round sees them too (otherwise each reports the same gap).
async function registerNote() {
  try {
    const reg = must(await sh('question list --brief', { phase: 'Dev', label: 'register' }), 'question list')
    return withAdded('', reg.items.filter(x => x.status !== 'dismissed'))
  } catch (e) {
    return ''
  }
}

function withAdded(known, items) {
  if (!items || !items.length) return known
  const head = known || `\n\n## Already in the register of questions\nDo not report these again, not even reworded, ` +
    `from another angle or in another language; report only what is new:`
  return `${head}\n${bullets(items.map(x => `${x.id} [${x.status || 'open'}] ${x.title}`))}`
}

// A task gets a UI review when the project has one enabled, staging runs, and the task touches the UI.
// `ui` in the plan decides; without it, devops tasks are skipped and dev tasks are reviewed.
const needsUi = (t, staging) => UI_REVIEW && !staging.skipped && (typeof t.ui === 'boolean' ? t.ui : t.owner !== 'devops')

// ------------------------------------------------------------------ prompts --

function devPrompt(ctx, round, feedback) {
  return `${ctx}
Round: ${round} of at most ${MAX_ROUNDS}.

${feedback ? `The task was sent back to you. Address EVERY point of the feedback.\n\n## Feedback\n${feedback}` : 'Implement the task.'}

Reminder: tests belong to QA (do not touch them), the mini-spec in the task file must be up to date,
build/lint/test must pass. Do not commit.`
}

function reviewPrompt(ctx, round, base, reviewedAt, prevReview, dev) {
  const prev = prevReview && prevReview.findings.length
    ? `\n## Previous findings - check that they were addressed\n${bullets(prevReview.findings.map(f => `[${f.severity}] ${where(f)}: ${f.issue}`))}`
    : ''
  const disputes = dev.disputes.length
    ? `\n## Dev disputes tests\n${bullets(dev.disputes.map(d => `${d.test}: ${d.reason}`))}` : ''
  return `${ctx}
Round: ${round}.

Full scope of the task: \`git diff ${base}..HEAD\`${reviewedAt ? `\nChanges since the previous review: \`git diff ${reviewedAt}..HEAD\`` : ''}

## Dev reports
${dev.summary}
${bullets(dev.changes)}${prev}${disputes}`
}

function qaPrompt(ctx, round, base, staging, dev, retryNote) {
  const env = staging.skipped
    ? 'The project has no staging environment (not a web app or no deploy) - no e2e and no browser exploration.'
    : `The app is running on staging: ${staging.url} (the same is in SATORY_BASE_URL).`
  const disputes = dev.disputes.length
    ? `\n## Dev disputes these tests (judge them by the SPEC)\n${bullets(dev.disputes.map(d => `${d.test}: ${d.reason}`))}` : ''
  return `${ctx}
Round: ${round}.
${env}

Scope of the changes: \`git diff ${base}..HEAD\`
Run the unit tests and the e2e tests you added or changed, not the whole e2e suite - the orchestrator runs it after you.
Dev reports: ${dev.summary}${disputes}${retryNote ? `\n\n## ATTENTION\n${retryNote}` : ''}`
}

function uiPrompt(ctx, round, base, staging, dev, prevUi) {
  const prev = prevUi && prevUi.findings.length
    ? `\n\n## Previous findings - check that they were fixed\n${bullets(prevUi.findings.map(f => `[${f.severity}] ${at(f)}: ${f.issue}`))}`
    : ''
  return `${ctx}
Round: ${round}.
The app is running on staging: ${staging.url} (the same is in SATORY_BASE_URL).

Scope of the changes: \`git diff ${base}..HEAD\`
Dev reports: ${dev.summary}${prev}`
}

function secPrompt(ctx, round, base, scan) {
  const scans = (scan.scans || []).map(s =>
    `\`${s.cmd}\` → ${s.missing_tool ? 'TOOL IS MISSING' : s.ok ? 'OK' : `problems found (exit ${s.exit})`} - log: ${s.log}`)
  return `${ctx}
Round: ${round}.

Scope of the audit: \`git diff ${base}..HEAD\` (plus the affected context).

## Automatic scanners
${scans.length ? bullets(scans) : '- none configured (commands.security in .satory/project.json)'}`
}

function docsPrompt(ctx, t, base, retryNote) {
  return `${ctx}

The task passed the Reviewer, QA, the UI review and Security. Sources: \`git diff ${base}..HEAD\`, the mini-spec and
"QA: coverage" in the task file. Do (mandatory):
1. CHANGELOG.md - an entry for ${t.id} under \`## [Unreleased]\` in the right subsection (### Added / Changed / Fixed / Security).
   This is ALWAYS done, for every task - "no changes needed" is not a valid result.
2. README.md - if it is missing, create it (what the project is, how to run and use it); if the task changes something
   a user or developer needs to know, reflect it.
3. docs/ - for a new or changed API/behaviour, update or create the matching document (e.g. docs/API.md).
4. In the task file, tick [x] the acceptance criteria that are covered by tests.
Write in the language set by \`language\` in .satory/project.json.${retryNote ? `\n\n## ATTENTION\n${retryNote}` : ''}`
}

// ------------------------------------------------------- journal notes --

const devNote = (who, d) => `${d.summary}\n\n${bullets(d.changes)}` +
  (d.disputes.length ? `\n\nTest disputes:\n${bullets(d.disputes.map(x => `${x.test}: ${x.reason}`))}` : '') +
  (d.mini_spec_updated ? '' : `\n\n(${who} did not update the mini-spec)`)
const reviewNote = r => `${r.summary}` +
  (r.findings.length ? `\n\n${bullets(r.findings.map(f => `[${f.severity}] ${where(f)}: ${f.issue} → ${f.fix}`))}` : '')
const qaNote = r => `${r.summary}` +
  (r.tests_added.length ? `\n\nTests added:\n${bullets(r.tests_added)}` : '') +
  (r.failures.length ? `\n\nFailures:\n${bullets(r.failures.map(f => `${f.test}: expected ${f.expected}, actual ${f.actual}`))}` : '') +
  (r.findings.length ? `\n\nFindings:\n${bullets(r.findings.map(f => `[${f.severity}] ${f.description}`))}` : '')
const uiNote = r => `${r.summary}` +
  (r.pages_checked.length ? `\n\nChecked: ${r.pages_checked.join(', ')}` : '') +
  (r.findings.length ? `\n\n${bullets(r.findings.map(f => `[${f.severity}] ${at(f)}: ${f.issue} → ${f.fix}`))}` : '')
const secNote = r => `${r.summary}` +
  (r.findings.length ? `\n\n${bullets(r.findings.map(f => `[${f.severity}] ${f.category} ${where(f)}: ${f.issue}`))}` : '')

// --------------------------------------------------------------- feedback --

function reviewFeedback(r) {
  const blocking = r.findings.filter(f => f.severity === 'blocker' || f.severity === 'major')
  const rest = r.findings.filter(f => !blocking.includes(f))
  return `### Code review: changes requested\n${r.summary}\n\nRequired:\n` +
    bullets(blocking.map(f => `[${f.severity}] ${where(f)}: ${f.issue}\n  → ${f.fix}`)) +
    (rest.length ? `\n\nOptional:\n${bullets(rest.map(f => `[${f.severity}] ${where(f)}: ${f.issue}`))}` : '')
}

function qaFeedback(r, after) {
  const parts = [`### QA: failed\n${r.summary}`]
  if (!r.mini_spec_complete) parts.push('The mini-spec is incomplete or inaccurate - complete it so it can be tested.')
  if (r.failures.length) parts.push('Failing tests (do NOT change them - change the code; if a test is wrong, dispute it in the task file):\n' +
    bullets(r.failures.map(f => `${f.test}: expected ${f.expected}; actual ${f.actual}${f.repro ? `; reproduce: ${f.repro}` : ''}`)))
  if (r.findings.length) parts.push('Defects:\n' + bullets(r.findings.map(f => `[${f.severity}] ${f.description}${f.repro ? ` (${f.repro})` : ''}`)))
  const gates = gateLines(after.gates)
  if (gates.length) parts.push('Automatic checks (the whole test suite):\n' + bullets(gates))
  return parts.join('\n\n')
}

function uiFeedback(r, blocking) {
  const rest = r.findings.filter(f => !blocking.includes(f))
  return `### UI review: changes requested\n${r.summary}\n\nRequired (see docs/UI.md):\n` +
    bullets(blocking.map(f => `[${f.severity}] ${at(f)}: ${f.issue}${f.screenshot ? ` (screenshot: ${f.screenshot})` : ''}\n  → ${f.fix}`)) +
    (rest.length ? `\n\nOptional:\n${bullets(rest.map(f => `[${f.severity}] ${at(f)}: ${f.issue}`))}` : '')
}

function secFeedback(r, blocking) {
  return `### Security: vulnerabilities found\n${r.summary}\n\n` +
    bullets(blocking.map(f => `[${f.severity}] ${f.category} ${where(f)}: ${f.issue}${f.attack ? `\n  attack: ${f.attack}` : ''}\n  → ${f.fix}`))
}

// --------------------------------------------------------------- one task --

async function block(t, round, reason) {
  must(await sh(`task block ${t.id}`, { phase: 'Docs', label: `block ${t.id}`, note: reason }), `block ${t.id}`)
  log(`⛔ ${t.id} is blocked: ${reason.split('\n')[0]}`)
  return { id: t.id, title: t.title, status: 'blocked', rounds: round, reason }
}

// Never throws: a question that cannot be recorded must not stop the task. Returns the new items ({id, title}).
async function addQuestions(items, kind, source, { task, milestone, phase }) {
  if (!items || !items.length) return []
  const list = items.map(x => ({ kind: x.kind || kind, ...x }))
  try {
    const res = await sh(`question add --source ${q(source)}${task ? ` --task ${task}` : ''}${milestone ? ` --milestone ${milestone}` : ''}`,
      { phase, label: `questions ${source}`, note: JSON.stringify(list) })
    const added = (res && res.added_items) || ((res && res.added) || []).map(id => ({ id, title: '' }))
    if (added.length) log(`❓ ${added.length} new question(s) for the user from ${source} - /satory-devteam:status`)
    return added
  } catch (e) {
    log(`Could not record the questions from ${source}: ${e.message}`)
    return []
  }
}

function auditPrompt(m, tasks, known) {
  return `Project: ${PROJECT}
Milestone: ${m} - all its tasks are done:
${bullets(tasks.map(t => `${t.id} - ${t.title} (docs/tasks/${t.id}.md)`))}

Review the data rules of this milestone together with everything built before it (the whole SPEC and the
code on the current branch). Already in the register - do not repeat them, even reworded:
${known.length ? bullets(known.map(x => `${x.id} [${x.status}] ${x.title}`)) : '- (none)'}`
}

function healthPrompt(m, tasks) {
  return `Project: ${PROJECT}
Documentation language: ${LANG}
Milestone: ${m} - all its tasks are done:
${bullets(tasks.map(t => `${t.id} - ${t.title}`))}

Review the whole code base on the current branch (everything built so far, not only this milestone)
for duplicated logic, inefficient code (database queries first), naming, dead code and consistency.`
}

// The code health findings of a milestone become one refactoring task (one subtask per finding) ahead of
// the work still to do, so the whole cycle runs once for all of them; behaviour stays the same.
async function healthTask(m, tasks, plan) {
  const out = await spawn('code-health', healthPrompt(m, tasks),
    { phase: 'Milestone review', label: `code health ${m}`, model: MODELS['code-health'], schema: HEALTH_SCHEMA })
  if (!out) { log(`The code health review of ${m} returned no result.`); return }
  const items = out.items || []
  if (!items.length) { log(`🧹 ${m} code health: nothing to refactor`); return }
  const next = plan.tasks.find(t => t.status === 'todo')
  const keep = 'Behaviour unchanged: the existing unit and e2e tests pass without changing what they assert'
  const task = {
    ref: `refactor-${m}`, title: out.title,
    milestone: next ? next.milestone : m, owner: 'dev', ui: items.some(x => x.ui), depends_on: [], requirements: [],
    description: `${out.summary}\n\nA refactoring from the code health review of ${m}: the behaviour of the app must stay exactly the same.`,
    acceptance: [keep], questions: [],
    subtasks: items.map(x => ({ title: `${x.title} (${x.kind}, ${x.impact})`, description: `${x.description}\n\nFiles: ${x.files.join(', ') || '-'}`, acceptance: [keep], questions: [] })),
    ...(next ? { insert_before: next.id } : {}),
  }
  const res = must(await sh(`plan add --source code-health-${m}`, {
    phase: 'Milestone review', label: `refactoring task ${m}`,
    note: JSON.stringify({ title: `refactoring after ${m}`, summary: out.summary, tasks: [task], depends: [], resolved: [] }),
  }), 'plan add')
  log(`🧹 ${m} code health: ${items.length} finding(s) → ${res.added.join(', ')}`)
}

// After a milestone is finished: one read-only review of its data rules (its items go to the register of
// questions) and one of the code health (its findings become a refactoring task); the workflow goes on.
async function reviewMilestones(plan) {
  if (plan.milestone_review === false) return plan
  let reg
  try {
    const st = must(await sh('status', { phase: 'Milestone review', label: 'branch' }), 'status')
    if (/^satory\//.test(st.branch || '')) return plan  // a task is in progress: after it, on main
    reg = must(await sh('question list --brief', { phase: 'Milestone review', label: 'questions' }), 'question list')
  } catch (e) {
    log(`Milestone review skipped: ${e.message}`)
    return plan
  }
  const order = [...new Set(plan.tasks.map(t => t.milestone).filter(Boolean))]
  for (const m of order) {
    const tasks = plan.tasks.filter(t => t.milestone === m)
    if (reg.milestones_reviewed.includes(m) || !tasks.every(t => t.status === 'done')) continue
    if (MILESTONE && m !== MILESTONE) continue
    const audit = await spawn('auditor', auditPrompt(m, tasks, reg.items),
      { phase: 'Milestone review', label: `review ${m}`, model: MODELS.auditor, schema: AUDIT_SCHEMA })
    if (!audit) { log(`The milestone review of ${m} returned no result; it runs again next time.`); continue }
    const n = (await addQuestions(audit.items, 'question', `milestone ${m} review`, { milestone: m, phase: 'Milestone review' })).length
    if (plan.code_health_review !== false) {
      try {
        await healthTask(m, tasks, plan)
        plan = must(await sh('plan json', { phase: 'Milestone review', label: 'plan' }), 'plan json')
      } catch (e) { log(`The code health review of ${m} failed (${e.message}); the milestone counts as reviewed.`) }
    }
    await sh(`question reviewed ${m}`, { phase: 'Milestone review', label: `reviewed ${m}` })
    reg.milestones_reviewed.push(m)
    log(`🔎 ${m} reviewed: ${n} new item(s) - ${audit.summary.split('\n')[0]}`)
  }
  return plan
}

function plannerPrompt(answered, plan) {
  const todo = plan.tasks.filter(t => t.status !== 'done')
  return `Project: ${PROJECT}
Answered questions to plan (every one goes into a task or into \`resolved\`; the scenario of each is
in docs/QUESTIONS.md):
${answered.map(x => `- ${x.id} [${x.kind}, ${x.severity}] ${x.title}\n  Answer: ${x.answer || '(accepted)'}${x.refs && x.refs.length ? `\n  Refs: ${x.refs.join(', ')}` : ''}`).join('\n')}

Milestones: ${(plan.milestones || []).map(m => m.id).join(', ') || '(none)'}
Tasks not done yet (in plan order):
${todo.length ? bullets(todo.map(t => `${t.id} [${t.milestone || '-'}, ${t.status}] ${t.title}`)) : '- (none)'}`
}

// Between two tasks, on main: first the queued changes (documents and plan changes from
// /satory-devteam:request and /satory-devteam:status), then the answered questions become tasks. Returns the plan.
async function planAnswers(plan) {
  try {
    const st = must(await sh('status', { phase: 'Planning', label: 'branch' }), 'status')
    if (/^satory\//.test(st.branch || '')) return plan
    const q = must(await sh('queue apply', { phase: 'Planning', label: 'queued changes' }), 'queue apply')
    for (const a of q.applied || []) {
      const tasks = [...a.added, ...a.updated.map(x => `${x} (extended)`)]
      log(`🗂 Queued change applied${a.merged ? ` (documents from ${a.branch})` : ''}${tasks.length ? `: ${tasks.join(', ')}` : ''}`)
    }
    for (const e of q.errors || []) log(`⚠ A queued change could not be applied (${e}); it and the ones after it wait in .satory/run/queue/ - /satory-devteam:status`)
    if ((q.applied || []).length) plan = must(await sh('plan json', { phase: 'Planning', label: 'plan' }), 'plan json')
    const reg = must(await sh('question list --status answered', { phase: 'Planning', label: 'answered questions' }), 'question list')
    const answered = reg.items
    if (!answered.length) return plan
    const out = await spawn('planner', plannerPrompt(answered, plan),
      { phase: 'Planning', label: `plan ${answered.length} answer(s)`, model: MODELS.planner, schema: PLANNER_SCHEMA })
    if (!out) { log('The planner returned no result; it runs again after the next task.'); return plan }
    // bundle: tasks for the same place in the plan become one task with subtasks, so the whole cycle
    // runs once for all the fixes of this planning, not once for each
    const res = must(await sh('plan add', { phase: 'Planning', label: 'add tasks', note: JSON.stringify({ ...out, bundle: true }) }), 'plan add')
    log(`🗂 ${res.added.length} new task(s) for the answered questions${res.added.length ? `: ${res.added.join(', ')}` : ''}` +
      (res.resolved.length ? `; ${res.resolved.length} answer(s) need no task` : ''))
    return must(await sh('plan json', { phase: 'Planning', label: 'plan' }), 'plan json')
  } catch (e) {
    log(`Planning failed (${e.message}); it is tried again after the next task.`)
    return plan
  }
}

async function runTask(t) {
  const start = must(await sh(`task start ${t.id}`, { phase: 'Dev', label: `start ${t.id}` }), `start ${t.id}`)
  const ctx = context(t, start)
  const role = t.owner === 'devops' ? 'devops' : 'dev'
  let round = start.rounds_used || 0
  let feedback = start.resumed
    ? 'The task is resumed after an interruption. Check the task file and the branch\'s `git log` to see how far it got, and finish it.'
    : ''
  let reviewedAt = null, prevReview = null, prevUi = null, lastStage = ''

  while (round < MAX_ROUNDS) {
    round++
    const tag = `${t.id} r${round}`

    // ---- Dev ----------------------------------------------------------
    let known = await registerNote()
    const dev = await spawn(role, devPrompt(ctx, round, feedback) + known,
      { phase: 'Dev', label: `${role} ${tag}`, model: MODELS[role], schema: DEV_SCHEMA })
    if (!dev) return block(t, round, `The ${role} agent returned no result in round ${round}.`)
    if (dev.blocked_question.trim()) return block(t, round, `Question from ${role}: ${dev.blocked_question.trim()}`)
    known = withAdded(known, await addQuestions(dev.assumptions, 'decision', `${role} ${tag}`, { task: t.id, milestone: t.milestone, phase: 'Dev' }))
    const ad = must(await sh(`step after-dev ${t.id} --round ${round} --owner ${t.owner}`,
      { phase: 'Dev', label: `checks ${tag}`, note: devNote(role, dev), long: true }), `after-dev ${tag}`)
    if (!ad.ok) {
      lastStage = 'build/lint'
      feedback = `### Automatic checks after your changes\n${bullets([...ad.violations.map(v => `Violation: ${v}`), ...gateLines(ad.gates)])}`
      continue
    }
    const devViolations = ad.violations.length
      ? `\n\nNote: these changes of yours were reverted automatically:\n${bullets(ad.violations)}` : ''

    // ---- Review -------------------------------------------------------
    const rev = await spawn('reviewer', reviewPrompt(ctx, round, start.base, reviewedAt, prevReview, dev) + known,
      { phase: 'Review', label: `review ${tag}`, model: MODELS.reviewer, schema: REVIEW_SCHEMA })
    if (!rev) return block(t, round, `The Reviewer returned no result in round ${round}.`)
    known = withAdded(known, await addQuestions(rev.spec_gaps, 'question', `reviewer ${tag}`, { task: t.id, milestone: t.milestone, phase: 'Review' }))
    const revBlocking = rev.findings.some(f => f.severity === 'blocker' || f.severity === 'major')
    const revVerdict = revBlocking ? 'changes_requested' : 'approve'
    must(await sh(`step readonly ${t.id} --round ${round} --stage reviewer --verdict ${revVerdict}`,
      { phase: 'Review', label: `journal review ${tag}`, note: reviewNote(rev) }), `review ${tag}`)
    reviewedAt = ad.checkpoint
    prevReview = rev
    if (revBlocking) {
      lastStage = 'review'
      feedback = reviewFeedback(rev) + devViolations
      continue
    }

    // ---- QA -----------------------------------------------------------
    const staging = must(await sh(`step pre-qa ${t.id} --round ${round}`, { phase: 'QA', label: `staging ${tag}`, long: true }), `staging ${tag}`)
    if (!staging.ok) {
      lastStage = 'staging'
      feedback = `### The app does not start on staging\nStage: ${staging.stage}. Log: ${staging.log}` +
        (staging.health_url ? `\nHealth check: ${staging.health_url}` : '')
      continue
    }
    let qa = null, aq = null, retryNote = ''
    for (let attempt = 1; ; attempt++) {
      qa = await spawn('qa', qaPrompt(ctx, round, start.base, staging, dev, retryNote) + known,
        { phase: 'QA', label: `qa ${tag}${attempt > 1 ? ` attempt ${attempt}` : ''}`, model: MODELS.qa, schema: QA_SCHEMA })
      if (!qa) return block(t, round, `QA returned no result in round ${round}.`)
      known = withAdded(known, await addQuestions(qa.spec_gaps, 'question', `qa ${tag}`, { task: t.id, milestone: t.milestone, phase: 'QA' }))
      aq = must(await sh(`step after-qa ${t.id} --round ${round} --verdict ${qa.verdict} --split-e2e`,
        { phase: 'QA', label: `checks qa ${tag}`, note: qaNote(qa), long: true }), `after-qa ${tag}`)
      if (!aq.qa_violation) break
      flakyLog(aq.gates, tag)
      if (attempt >= QA_ATTEMPTS) return block(t, round, `QA broke the "add only" rule ${QA_ATTEMPTS} times:\n${bullets(aq.violations)}`)
      retryNote = `Your previous attempt broke the "tests are only added" rule and the affected files were restored:\n` +
        `${bullets(aq.violations)}\nRestore the missing tests exactly as they were and add the new ones without touching the existing ones. ` +
        `Only if this task's requirements contradict a test from an earlier task may you adapt it - list the file with the reason in the "QA: adapted tests" section of the task file (see your rules).`
    }
    const qaFailed = !aq.ok || qa.verdict !== 'pass' || !qa.mini_spec_complete
    if (qaFailed) {
      lastStage = 'qa'
      feedback = qaFeedback(qa, aq)
      continue
    }

    // ---- UI -----------------------------------------------------------
    if (needsUi(t, staging)) {
      const ui = await spawn('ui-reviewer', uiPrompt(ctx, round, start.base, staging, dev, prevUi),
        { phase: 'UI', label: `ui ${tag}`, model: MODELS['ui-reviewer'], schema: UI_SCHEMA })
      if (!ui) return block(t, round, `The UI reviewer returned no result in round ${round}.`)
      const uiBlocking = ui.findings.filter(f => f.severity === 'blocker' || f.severity === 'major')
      must(await sh(`step readonly ${t.id} --round ${round} --stage ui --verdict ${uiBlocking.length ? 'fail' : 'pass'}`,
        { phase: 'UI', label: `journal ui ${tag}`, note: uiNote(ui) }), `ui ${tag}`)
      prevUi = ui
      if (uiBlocking.length) {
        lastStage = 'ui'
        feedback = uiFeedback(ui, uiBlocking)
        continue
      }
    }

    // ---- Security -----------------------------------------------------
    const scan = must(await sh(`step security-scan ${t.id} --round ${round}`, { phase: 'Security', label: `scanners ${tag}`, long: true }), `scan ${tag}`)
    const sec = await spawn('security', secPrompt(ctx, round, start.base, scan),
      { phase: 'Security', label: `security ${tag}`, model: MODELS.security, schema: SEC_SCHEMA })
    if (!sec) return block(t, round, `The Security auditor returned no result in round ${round}.`)
    const secBlocking = sec.findings.filter(f => ['critical', 'high', 'medium'].includes(f.severity))
    must(await sh(`step readonly ${t.id} --round ${round} --stage security --verdict ${secBlocking.length ? 'fail' : 'pass'}`,
      { phase: 'Security', label: `journal security ${tag}`, note: secNote(sec) }), `security ${tag}`)
    if (secBlocking.length) {
      lastStage = 'security'
      feedback = secFeedback(sec, secBlocking)
      continue
    }

    // ---- Full e2e (experimental e2e_task_first) ------------------------
    if (aq.gates && aq.gates.e2e && aq.gates.e2e.scope === 'task') {
      const full = must(await sh(`step full-e2e ${t.id} --round ${round}`,
        { phase: 'Full tests', label: `full e2e ${tag}`, long: true }), `full-e2e ${tag}`)
      flakyLog(full.gates, tag)
      if (!full.ok) {
        lastStage = 'full e2e'
        feedback = `### The whole e2e suite fails
This task's own tests pass, but tests of earlier features fail - ` +
          `most likely a regression caused by this task.
${bullets(gateLines(full.gates))}`
        continue
      }
    }

    // ---- Docs + finish -------------------------------------------------
    let docs = null, docsCheck = null, docsNote = ''
    for (let attempt = 1; attempt <= 2; attempt++) {
      docs = await spawn('docs', docsPrompt(ctx, t, start.base, docsNote),
        { phase: 'Docs', label: `docs ${t.id}${attempt > 1 ? ' attempt 2' : ''}`, model: MODELS.docs, schema: DOCS_SCHEMA })
      docsCheck = must(await sh(`step docs-check ${t.id} --round ${round}`, { phase: 'Docs', label: `check docs ${t.id}` }), `docs-check ${t.id}`)
      if (docsCheck.ok) break
      docsNote = `The previous attempt did not add an entry for ${t.id} to CHANGELOG.md under [Unreleased]. This is mandatory - add it.`
    }
    const docsSummary = docs ? `${docs.summary}\n\n${bullets(docs.files)}` : 'The technical writer returned no result.'
    const fin = must(await sh(`task finish ${t.id}`,
      { phase: 'Docs', label: `merge+push ${t.id}`, long: true,
        note: docsCheck.ok ? docsSummary : `${docsSummary}\n\n⚠ CHANGELOG.md was not updated even after a retry.` }),
    `finish ${t.id}`)
    log(`✓ ${t.id} done in ${round} round(s)${fin.pushed ? ', pushed' : ''}${fin.staging && fin.staging.url ? `, staging: ${fin.staging.url}` : ''}`)
    return { id: t.id, title: t.title, status: 'done', rounds: round, commit: fin.commit, pushed: fin.pushed,
             push_error: fin.push_error, staging: fin.staging }
  }
  return block(t, round, `All ${MAX_ROUNDS} rounds used; last sent back by: ${lastStage}.\n\nLast feedback to Dev:\n${feedback}`)
}

// ------------------------------------------------------------------- main --

// A milestone has started once one of its tasks is done or in progress.
const started = (plan, m) => !m || plan.tasks.some(x => x.milestone === m && (x.status === 'done' || x.status === 'in_progress'))

// held: open critical questions keep the milestones that have not started yet from starting
function pickNext(plan, attempted, held = false) {
  const status = Object.fromEntries(plan.tasks.map(t => [t.id, t.status]))
  const ready = plan.tasks.filter(t =>
    (t.status === 'todo' || t.status === 'in_progress') && !attempted.has(t.id) &&
    (!MILESTONE || t.milestone === MILESTONE) &&
    (!held || started(plan, t.milestone)) &&
    t.depends_on.every(d => status[d] === 'done'))
  return ready.find(t => t.status === 'in_progress') || ready[0] || null
}

// Open critical questions (0 when the gate is off or the register cannot be read).
async function criticalOpen(plan) {
  if (plan.critical_questions_gate === false) return 0
  try {
    return must(await sh('question list --open', { phase: 'Prepare', label: 'critical questions' }), 'question list').critical_open || 0
  } catch (e) {
    log(`Could not read the questions: ${e.message}`)
    return 0
  }
}

phase('Prepare')
let plan = await sh('plan json', { phase: 'Prepare', label: 'plan' })
if (plan.error) throw new Error(`Not a satory project: ${plan.error}`)
if (plan.errors && plan.errors.length) throw new Error(`The plan is invalid:\n${bullets(plan.errors)}`)
PROJECT = plan.root
MAX_ROUNDS = Number(A.rounds || plan.max_rounds || 33)
UI_REVIEW = plan.ui_review === true
LANG = plan.language || 'en'
if (plan.experimental && plan.experimental.length) log(`⚗ Experimental settings on: ${plan.experimental.join(', ')} (remove "experimental" from .satory/project.json to turn them off)`)
log(`${plan.name}: ${plan.tasks.length} tasks, up to ${MAX_ROUNDS} rounds per task${UI_REVIEW ? ', UI review on' : ''}${MILESTONE ? `, milestone ${MILESTONE} only` : ''}`)

plan = await reviewMilestones(plan)
plan = await planAnswers(plan)

const results = []
const attempted = new Set()
let stopped = null, waiting = null
while (results.length < MAX_TASKS) {
  const critical = await criticalOpen(plan)
  const t = pickNext(plan, attempted, critical > 0)
  if (!t) {
    // the started milestones are finished, but a new one waits for answers to critical questions
    const next = critical > 0 && pickNext(plan, attempted)
    if (next) {
      waiting = { critical, milestone: next.milestone, task: next.id }
      log(`⏸ ${next.milestone} does not start while ${critical} critical question(s) are open - answer them with /satory-devteam:status, then run /satory-devteam:build`)
    }
    break
  }
  attempted.add(t.id)
  log(`▶ ${t.id} - ${t.title}`)
  try {
    results.push(await runTask(t))
  } catch (e) {
    stopped = `${t.id}: ${e.message}`
    log(`Stopping: ${stopped}`)
    break
  }
  plan = must(await sh('plan json', { phase: 'Docs', label: 'plan' }), 'plan json')
  plan = await reviewMilestones(plan)
  plan = await planAnswers(plan)
}

let questions = null
try {
  const reg = must(await sh('question list --open', { phase: 'Docs', label: 'open questions' }), 'question list')
  questions = { open: reg.open, critical: reg.critical_open }
  if (reg.open) log(`❓ ${reg.open} open question(s) for the user (${reg.critical_open} critical) - /satory-devteam:status`)
} catch (e) { /* the summary goes on without the count */ }

const left = plan.tasks.filter(t => t.status !== 'done' && (!MILESTONE || t.milestone === MILESTONE))
return {
  project: PROJECT,
  done: results.filter(r => r.status === 'done'),
  blocked: results.filter(r => r.status === 'blocked'),
  stopped_on_error: stopped,
  waiting_for_answers: waiting,
  questions,
  remaining: left.map(t => ({ id: t.id, title: t.title, status: t.status, waits_for: t.depends_on.filter(d => plan.tasks.find(x => x.id === d).status !== 'done') })),
}

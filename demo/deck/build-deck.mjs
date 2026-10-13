// Builds demo/build/deploy-sentinel-deck.pdf (16:9) from real report output and captured CLI output.
// Run demo/capture.sh first. Set REPO_URL to the public GitHub repository.
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {launch} from '../browser.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const build = path.join(root, 'demo', 'build')
const capture = path.join(build, 'capture')
const repoUrl = process.env.REPO_URL ?? 'github.com/<your-username>/deploy-sentinel'
const author = {name: 'Neelabh Krishna', role: 'Senior Quality Assurance Consultant, Salesforce'}

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'})[c])
const read = (file) => fs.readFileSync(path.join(capture, file), 'utf8').replace(/\s+$/, '')
const url = (file) => pathToFileURL(file).href
const colorize = (text) =>
  esc(text)
    .replace(/\b(RED)\b/g, '<span class="red">$1</span>')
    .replace(/\b(passed)\b/g, '<span class="grn">$1</span>')
    .replace(/(\d+ failed)/g, '<span class="red">$1</span>')
    .replace(/(SIMULATION:[^\n]*)/, '<span class="amb">$1</span>')

const reportShot = path.join(root, 'demo', 'build', 'deck-report.png')
const evidenceShot = path.join(root, 'out', 'demo', 'evidence', 'close-opportunity-as-won.png')
const reportText = read('report.txt')
const planText = read('plan.txt')
const selected = planText.slice(planText.indexOf('Smoke tests selected'), planText.indexOf('\nCopado CI/CD'))

const slide = (body, cls = '') => `<section class="slide ${cls}"><div class="glow"></div>${body}
<footer><b>Deploy Sentinel</b> · ${esc(author.name)} · Agentia™ Headless Virtual Hackathon 2026</footer></section>`

const who = `<div class="who"><div class="avatar">NK</div><div><div class="n">${esc(author.name)}</div><div class="r">${esc(author.role)}</div></div></div>`

const slides = [
  slide(`<div class="center"><div class="eyebrow">Agentia™ Headless Virtual Hackathon 2026</div><h1>Deploy Sentinel</h1>
    <p class="lead">Post-deployment smoke testing, evidence capture and bug filing for Copado promotions, built on the Agentia CLI.</p>${who}</div>`),
  slide(`<div class="eyebrow">The problem</div><h2>Deployed is not the same as verified</h2>
    <div class="grid3">
      <div class="card"><div class="num" style="background:#f43f5e">1</div><h3>Green is not healthy</h3><p>A successful deployment proves the metadata was accepted. It does not prove that sales reps can still close an Opportunity or agents can still route a Case.</p></div>
      <div class="card"><div class="num" style="background:#f59e0b">2</div><h3>Late detection</h3><p>QA clicks through the same smoke flows after every promotion, or waits for a nightly regression run. Breakages surface hours later, sometimes from business users.</p></div>
      <div class="card"><div class="num" style="background:#a855f7">3</div><h3>Thin bug reports</h3><p>Failures arrive without screenshots, logs, the target org, or the change that caused them, so developers spend time reproducing before they can fix.</p></div>
    </div>`),
  slide(`<div class="eyebrow">The solution</div><h2>Verify every promotion in minutes, automatically</h2>
    <div class="flow">
      <div class="box" style="--c:#3b82f6"><div class="k">Plugin command</div><h3>Plan</h3><code>agentia sentinel plan</code><p>Reads the user story through the Agentia host, maps changed metadata to business smoke areas and Robot Framework tags.</p></div>
      <div class="arrow">→</div>
      <div class="box" style="--c:#22d3ee"><div class="k">Built-in command · MCP</div><h3>Run</h3><code>agentia testing test run</code><p>Copado Robotic Testing runs only the selected tags and saves the xUnit report and artifacts.</p></div>
      <div class="arrow">→</div>
      <div class="box" style="--c:#22c55e"><div class="k">Plugin command</div><h3>Report</h3><code>agentia sentinel report</code><p>Release verdict, root-cause groups, likely cause, evidence report and Jira-ready bugs. <code>--gate</code> blocks a RED release.</p></div>
    </div>
    <p class="note">An agent skill orchestrates the three steps, so a developer can simply ask: "Smoke test the UAT promotion for US-0001234."</p>`),
  slide(`<div class="eyebrow">Architecture</div><h2>How the pieces connect</h2>
    <div class="arch">
      <div class="lane"><div class="lt">Coding agent (Cursor, or any agent)</div><div class="chipx">SKILL.md: deploy-sentinel</div><div class="chipx">Agentia managed skills</div></div>
      <div class="lane"><div class="lt">Agentia CLI</div><div class="chipx strong">agentia sentinel plan / report (plugin)</div><div class="chipx">agentia testing · agentia cicd</div><div class="chipx">agentia mcp start</div></div>
      <div class="lane"><div class="lt">Agentia plugin host API</div><div class="chipx">work.getWorkItem</div><div class="chipx">auth.status</div><div class="chipx">format.table</div></div>
      <div class="lane"><div class="lt">Copado and tooling</div><div class="chipx">Copado CI/CD user stories and promotions</div><div class="chipx">Copado Robotic Testing</div><div class="chipx">Git</div><div class="chipx">Jira</div><div class="chipx">Slack (summary.md)</div></div>
    </div>
    <p class="note">The plugin never receives credentials: it uses only reviewed host methods. Jira posting reads its token from the environment, and only after the user approves.</p>`),
  slide(`<div class="eyebrow">Use of Agentia™ extensibility</div><h2>Commands, skills and MCP working together</h2>
    <table><tr><th>Extension point</th><th>What Deploy Sentinel adds</th></tr>
    <tr><td><b>Commands</b></td><td><code>agentia sentinel plan</code> and <code>agentia sentinel report</code>, built with <code>@copado/agentia-plugin-sdk</code> and <code>AgentiaCommand</code>: <code>--json</code> envelopes, spinners, and tables rendered with the CLI's own formatter.</td></tr>
    <tr><td><b>Host API</b></td><td><code>work.getWorkItem</code> for the user story and base branch; <code>auth.status</code> to check CRT readiness before a run.</td></tr>
    <tr><td><b>Skills</b></td><td><code>.cursor/skills/deploy-sentinel/SKILL.md</code>: readiness check, plan, run, unpack evidence, report, rerun failed tests, file bugs only with approval.</td></tr>
    <tr><td><b>MCP</b></td><td>The agent drives Copado CI/CD and CRT through the built-in <code>agentia mcp start</code> tools. Plugins cannot register MCP tools yet, so the skill bridges plugin commands and MCP tools.</td></tr>
    <tr><td><b>Built-in commands</b></td><td>The plan emits the exact <code>agentia testing test run --include &lt;tag&gt; --xunit --save-artifacts</code> command, and the report reads its output.</td></tr></table>`),
  slide(`<div class="eyebrow">Demo · Step 1</div><h2>Only the smoke tests this change needs</h2>
    <div class="two"><div><p class="body">The sample user story adds discount approval to Opportunity closing. Nine changed files become <b>seven components</b>. Sentinel selects <b>three of six smoke areas</b> and explains why each one runs.</p>
    <p class="body">The critical path always runs. Areas with no changed metadata are skipped, so the run stays fast.</p><p class="sample">Shown on bundled sample data: no Copado org was connected for this demo.</p></div>
    <pre class="term">${colorize(selected)}</pre></div>`),
  slide(`<div class="eyebrow">Demo · Step 3</div><h2>Four failures, three root causes</h2>
    <div class="two"><div><p class="body">Sentinel parses the Robot Framework xUnit report from CRT, classifies each failure, and groups the same cause on different records into one bug.</p>
    <table class="small"><tr><th>Category</th><th>Suspect metadata</th></tr><tr><td>Validation rule</td><td>ValidationRule, CustomField</td></tr><tr><td>Flow failure</td><td>Flow</td></tr><tr><td>Apex exception</td><td>ApexClass, ApexTrigger</td></tr><tr><td>Access or permissions</td><td>Profile, PermissionSet, RecordType</td></tr><tr><td>UI element missing</td><td>FlexiPage, Layout, LWC, Aura</td></tr><tr><td>Timeout</td><td>Possible flake: rerun first</td></tr></table></div>
    <pre class="term">${colorize(reportText)}</pre></div>`),
  slide(`<div class="eyebrow">Evidence</div><h2>A report and a Jira bug for every root cause</h2>
    <div class="two"><img class="shot" src="${url(reportShot)}"><div><img class="shot" src="${url(evidenceShot)}">
    <ul class="bul"><li>Self-contained <code>report.html</code> with verdict, selection reasons, failures, screenshots and changed components</li><li>One Jira REST payload per root cause in <code>bugs/</code>; <code>--post-jira</code> creates the issues and attaches evidence</li><li>Slack-ready <code>summary.md</code> for the release channel</li></ul></div></div>`),
  slide(`<div class="eyebrow">Impact</div><h2>What changes for a delivery team</h2>
    <div class="grid3">
      <div class="card"><h3>Minutes, not hours</h3><p>Every promotion is verified as soon as it lands, instead of waiting for manual checks or a nightly regression run.</p></div>
      <div class="card"><h3>Focused runs</h3><p>Only the business areas the change touches are tested, plus the critical path. In the sample, 3 of 6 areas ran.</p></div>
      <div class="card"><h3>Actionable bugs</h3><p>Each bug names the failing flow, the error, the likely component, the user story and promotion, with screenshots and logs attached.</p></div>
      <div class="card"><h3>Release confidence</h3><p>A single GREEN or RED verdict, with <code>--gate</code> to stop a broken release in the pipeline.</p></div>
      <div class="card"><h3>QA time back</h3><p>QA engineers stop repeating the same smoke clicks and spend time on exploratory and edge-case testing.</p></div>
      <div class="card"><h3>Reusable</h3><p>Areas, tags and Jira settings live in one config file, so any Copado team can adopt it without code changes.</p></div>
    </div>`),
  slide(`<div class="eyebrow">Technical execution</div><h2>Built to be trusted in a pipeline</h2>
    <div class="two"><ul class="bul big">
      <li>TypeScript oclif plugin on the official Agentia plugin SDK, linked with <code>agentia plugins link</code></li>
      <li>Source-format metadata parser for 13 component types, with config-driven globs</li>
      <li>Robot Framework xUnit parser, failure classifier, record-Id-insensitive grouping, and cause ranking</li>
      <li>Simulation mode runs the same code paths on bundled data, clearly labelled</li>
      <li>Safety: no credentials through the host, approval before filing bugs, explicit output paths</li></ul>
    <pre class="term">${colorize(read('tests.txt'))}\n\n$ agentia sentinel report --simulate --gate\nexit code ${esc(read('gate-exit.txt'))}</pre></div>`),
  slide(`<div class="eyebrow">Limits and roadmap</div><h2>What is next</h2>
    <div class="two"><div class="card"><h3>Today</h3><ul class="bul"><li>The plugin host does not expose promotions or CRT runs yet, so the skill runs those steps with built-in commands and MCP tools.</li><li>Demonstrated on bundled sample data, because no Copado org was available.</li><li>Jira posting is tested against a mocked API, not a live Jira site.</li></ul></div>
    <div class="card"><h3>Next</h3><ul class="bul"><li>Write the verdict back to the Copado promotion.</li><li>Use Copado AI to draft the plain-language bug summary.</li><li>Run automatically on promotion events and post to Slack.</li><li>Learn area mappings from past failures.</li></ul></div></div>`),
  slide(`<div class="center"><div class="eyebrow">Deploy Sentinel</div><h1>Thank you</h1><p class="lead">From deployed to verified, in minutes.</p>${who}
    <p class="repo">${esc(repoUrl)}</p></div>`),
]

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@page{size:1920px 1080px;margin:0}
:root{--bg:#0b1020;--panel:#121a33;--ink:#eef2ff;--muted:#9aa6c7;--cyan:#22d3ee;--line:#24304f}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:-apple-system,"SF Pro Display","Segoe UI",Helvetica,Arial,sans-serif}
.slide{position:relative;width:1920px;height:1080px;padding:90px 120px 120px;overflow:hidden;page-break-after:always;display:flex;flex-direction:column}
.glow{position:absolute;inset:0;background:radial-gradient(1200px 700px at 80% -10%,rgba(59,130,246,.22),transparent 60%),radial-gradient(900px 600px at -10% 110%,rgba(34,211,238,.15),transparent 60%);z-index:0}
.slide>*{position:relative;z-index:1}.slide>.glow{position:absolute;z-index:0}
.slide>footer{position:absolute;left:120px;bottom:44px;color:var(--muted);font-size:20px}footer b{color:var(--ink)}
.center{margin:auto 0}.eyebrow{color:var(--cyan);font-weight:700;letter-spacing:4px;text-transform:uppercase;font-size:22px}
h1{font-size:110px;margin:16px 0 8px;letter-spacing:-2px}h2{font-size:60px;margin:10px 0 40px;letter-spacing:-1px}h3{font-size:32px;margin:12px 0}
.lead{font-size:38px;color:var(--muted);max-width:1450px;line-height:1.35}.note{font-size:28px;color:var(--muted);margin-top:40px;line-height:1.4}
.who{margin-top:60px;display:flex;align-items:center;gap:24px}.avatar{width:92px;height:92px;border-radius:50%;background:linear-gradient(135deg,#3b82f6,#22d3ee);display:flex;align-items:center;justify-content:center;font-size:36px;font-weight:800}
.who .n{font-size:40px;font-weight:700}.who .r{font-size:28px;color:var(--muted)}.repo{margin-top:46px;font-size:30px;color:var(--cyan);font-family:"SF Mono",Menlo,monospace}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:28px}.card{background:var(--panel);border:1px solid var(--line);border-radius:22px;padding:30px}
.card p{font-size:25px;line-height:1.45;color:#c9d2ee;margin:0}.num{width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:28px}
.flow{display:flex;gap:24px;align-items:stretch}.box{flex:1;background:var(--panel);border:1px solid var(--line);border-top:6px solid var(--c);border-radius:22px;padding:30px}
.box .k{color:var(--c);font-size:20px;font-weight:700;letter-spacing:2px;text-transform:uppercase}.box p{font-size:25px;line-height:1.45;color:#c9d2ee}.arrow{align-self:center;font-size:48px;color:var(--muted)}
code{font-family:"SF Mono",Menlo,monospace;color:var(--cyan);font-size:.85em}
.arch{display:flex;flex-direction:column;gap:20px}.lane{display:flex;align-items:center;gap:16px;background:var(--panel);border:1px solid var(--line);border-radius:18px;padding:22px 26px;flex-wrap:wrap}
.lt{width:430px;font-size:26px;font-weight:700}.chipx{border:1px solid var(--line);background:#0e1530;border-radius:999px;padding:10px 20px;font-size:22px}.chipx.strong{border-color:#22c55e;color:#86efac}
table{border-collapse:collapse;width:100%;font-size:25px}th,td{text-align:left;padding:16px 20px;border-bottom:1px solid var(--line);vertical-align:top;line-height:1.4}th{color:var(--muted);font-size:21px;text-transform:uppercase;letter-spacing:2px}
table.small{font-size:22px;margin-top:20px}table.small td,table.small th{padding:10px 14px}
.two{display:grid;grid-template-columns:0.82fr 1.18fr;gap:40px;align-items:start;flex:1;min-height:0}.body{font-size:30px;line-height:1.45;color:#d6ddf5;margin:0 0 22px}
.sample{display:inline-block;background:rgba(245,158,11,.14);border:1px solid rgba(245,158,11,.5);color:#fcd34d;border-radius:14px;padding:12px 18px;font-size:22px}
pre.term{margin:0;background:#0a0e1a;border:1px solid var(--line);border-radius:18px;padding:22px 22px;font:14.5px/1.4 "SF Mono",Menlo,monospace;white-space:pre;overflow:hidden;color:#d7def7;max-height:780px}
.red{color:#fb7185}.grn{color:#4ade80}.amb{color:#fcd34d}
.shot{width:100%;border-radius:16px;border:1px solid var(--line);display:block;max-height:780px;object-fit:cover;object-position:top}.two>div>.shot{max-height:430px;margin-bottom:22px}
.bul{font-size:25px;line-height:1.45;color:#d6ddf5;padding-left:28px;margin:0}.bul li{margin-bottom:14px}.bul.big{font-size:28px}
</style></head><body>${slides.join('\n')}</body></html>`

const browser = await launch()
const shotPage = await browser.newPage({viewport: {height: 1500, width: 1400}})
await shotPage.goto(url(path.join(root, 'out', 'demo', 'report.html')))
await shotPage.screenshot({clip: {height: 1500, width: 1400, x: 0, y: 0}, path: reportShot})
await shotPage.close()

const deckHtml = path.join(build, 'deck.html')
fs.writeFileSync(deckHtml, html)
const page = await browser.newPage({viewport: {height: 1080, width: 1920}})
await page.goto(url(deckHtml), {waitUntil: 'load'})
const pdf = path.join(build, 'deploy-sentinel-deck.pdf')
await page.pdf({height: '1080px', path: pdf, printBackground: true, width: '1920px'})
for (const [index] of slides.entries()) {
  await page.evaluate((i) => document.querySelectorAll('.slide')[i].scrollIntoView(), index)
  await page.screenshot({path: path.join(build, `deck-slide-${String(index + 1).padStart(2, '0')}.png`)})
}

await browser.close()
console.log(`wrote ${pdf} (${slides.length} slides, ${(fs.statSync(pdf).size / 1_048_576).toFixed(1)} MB)`)

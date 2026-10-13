// Builds demo/build/deploy-sentinel-demo.mp4 from real command output captured by demo/capture.sh.
import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'

import {launch} from '../browser.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..', '..')
const build = path.join(root, 'demo', 'build')
const capture = path.join(build, 'capture')
const audioDir = path.join(build, 'audio')
const framesDir = path.join(build, 'frames')
const FPS = Number(process.env.FPS ?? 12)
const VOICE = process.env.VOICE ?? 'Flo (English (US))'
const RATE = process.env.RATE ?? '182'

const author = {name: 'Neelabh Krishna', role: 'Senior Quality Assurance Consultant, Salesforce'}
const read = (file) => fs.readFileSync(path.join(capture, file), 'utf8').replace(/\s+$/, '')
const fileUrl = (file) => pathToFileURL(file).href

for (const dir of [audioDir, framesDir]) {
  fs.rmSync(dir, {force: true, recursive: true})
  fs.mkdirSync(dir, {recursive: true})
}

// Full-page screenshot of the generated report, scrolled through in the video.
const browser = await launch()
const reportPage = await browser.newPage({deviceScaleFactor: 1, viewport: {height: 900, width: 1400}})
await reportPage.goto(fileUrl(path.join(root, 'out', 'demo', 'report.html')))
const reportShot = path.join(build, 'report-full.png')
await reportPage.screenshot({fullPage: true, path: reportShot})
const reportHeight = await reportPage.evaluate(() => document.documentElement.scrollHeight)
await reportPage.close()

const bug = JSON.parse(fs.readFileSync(path.join(root, 'out', 'demo', 'bugs', 'BUG-01.json'), 'utf8')).fields
const skill = fs.readFileSync(path.join(root, '.cursor', 'skills', 'deploy-sentinel', 'SKILL.md'), 'utf8')
const allSkillLines = skill.split('\n')
const workflowStart = allSkillLines.findIndex((line) => line.startsWith('## Workflow'))
const workflowEnd = allSkillLines.findIndex((line) => line.startsWith('## Pipeline gate'))
const skillLines = allSkillLines
  .slice(workflowStart, workflowEnd)
  .filter((line) => /^(## |\d\. |   `agentia|   - )/.test(line))
  .map((line) => (line.length > 120 ? line.slice(0, 117) + '...' : line))
const focus = skillLines.flatMap((line, index) => (/^\d\. \*\*/.test(line) ? [index] : []))

const crtLine = read('plan.txt').split('\n').find((line) => line.includes('agentia testing test run')).trim()
const wrapCommand = (command) =>
  command.replace(' --include', ' \\\n    --include').replace(' --record', ' \\\n    --record').replace(' --xunit', ' \\\n    --xunit')

const scenes = [
  {
    eyebrow: 'Agentia™ Headless Virtual Hackathon 2026',
    narration: `Hi, I'm Neelabh Krishna, a Senior Quality Assurance Consultant at Salesforce. This is Deploy Sentinel, a post-deployment smoke testing plugin for the Copado Agentia CLI.`,
    subtitle: 'Post-deployment smoke testing, evidence capture and bug filing for Copado promotions',
    title: 'Deploy Sentinel',
    type: 'title',
  },
  {
    eyebrow: 'The problem',
    items: [
      {color: '#f43f5e', icon: '1', text: 'A green deployment only proves the metadata was accepted, not that users can still do their jobs.'},
      {color: '#f59e0b', icon: '2', text: 'QA verifies every promotion by hand, or waits hours for a nightly regression run.'},
      {color: '#a855f7', icon: '3', text: 'Bug reports arrive without screenshots, logs, or the change that caused them.'},
    ],
    narration: `A green deployment only tells you the metadata was accepted. It doesn't tell you that sales reps can still close an opportunity. Today, QA checks this by hand after every promotion, or waits for a nightly regression run. And bug reports often arrive without screenshots, logs, or the change that caused them.`,
    title: 'Deployed is not the same as verified',
    type: 'list',
  },
  {
    boxes: [
      {code: 'agentia sentinel plan', color: '#3b82f6', kind: 'Plugin command', text: 'Reads the user story through the Agentia host, maps changed metadata to smoke areas and Robot tags.', title: 'Plan'},
      {code: 'agentia testing test run', color: '#22d3ee', kind: 'Built-in command · MCP', text: 'Copado Robotic Testing runs only the selected tags and saves xUnit and artifacts.', title: 'Run'},
      {code: 'agentia sentinel report', color: '#22c55e', kind: 'Plugin command', text: 'Verdict, root-cause groups, likely cause, evidence report and Jira-ready bugs.', title: 'Report'},
    ],
    eyebrow: 'How it works',
    narration: `Deploy Sentinel closes that gap in three steps. A plugin command plans the smoke run from the user story and its changes. Copado Robotic Testing runs only the tests that matter, through the built-in Agentia commands and MCP tools. And a second plugin command turns the results into a release verdict and Jira-ready bugs. An agent skill ties it all together.`,
    pills: ['Commands: agentia sentinel', 'Skill: SKILL.md', 'MCP: agentia mcp start'],
    title: 'Commands, a skill, and MCP',
    type: 'flow',
  },
  {
    eyebrow: 'Step 1 · Plan',
    maxLines: 27,
    narration: `I don't have a Copado org for this demo, so I'm running the real plugin on bundled sample data. The user story adds discount approval to opportunity closing. Sentinel maps nine changed files to seven components, and selects three of six smoke areas: the critical path, opportunity management, and access and security.`,
    sample: true,
    steps: [
      {cmd: 'agentia plugins', output: read('plugins.txt')},
      {cmd: 'agentia sentinel plan --simulate --out out/demo', highlight: 'Smoke tests selected', output: read('plan.txt').split('\nCopado CI/CD')[0]},
    ],
    title: 'Which smoke tests does this change need?',
    type: 'terminal',
  },
  {
    eyebrow: 'Step 2 · Run',
    narration: `It also checks Robotic Testing readiness through the Agentia host, and prints the exact Robotic Testing command, with only the selected Robot tags, saving the x-unit report and artifacts. In a real run, the agent skill executes this command, or calls the matching MCP tool.`,
    sample: true,
    steps: [{cmd: 'agentia sentinel plan --simulate --out out/demo   # continued', highlight: '--include', output: 'Copado CI/CD' + read('plan.txt').split('\nCopado CI/CD')[1].replace(crtLine, wrapCommand(crtLine))}],
    title: 'The exact Copado Robotic Testing command',
    type: 'terminal',
  },
  {
    eyebrow: 'Step 3 · Report',
    narration: `Next, the report command reads the test results. Four tests failed, but Sentinel groups them into three root causes: a validation rule, a missing page element, and a permission gap. Each one points to the most likely component in this promotion. The verdict is red.`,
    sample: true,
    steps: [{cmd: 'agentia sentinel report --simulate --out out/demo', highlight: 'Release verdict', output: read('report.txt')}],
    title: 'Four failures, three root causes',
    type: 'terminal',
  },
  {
    eyebrow: 'Evidence report',
    image: fileUrl(reportShot),
    imageHeight: reportHeight,
    narration: `The HTML report shows the verdict, why each smoke area ran, every failure with its screenshot, and the changed components. It is one self-contained folder you can share, or attach to the promotion.`,
    sample: true,
    title: 'out/demo/report.html',
    type: 'scroll',
    viewport: 690,
  },
  {
    bug: {
      causes: ['ValidationRule Opportunity.Discount_Requires_Approval', 'CustomField Opportunity.Discount_Percent__c'],
      deployment: ['User story: US-0001234', 'Target environment: UAT', 'Promotion: P-00042 (Dev -> UAT)', 'CRT build: sim-build-7781'],
      error: bug.description.match(/\{noformat\}([\s\S]*?)\{noformat\}/)[1],
      hint: 'A validation rule or required field is rejecting data the business flow used to accept.',
      key: 'BUG-01',
      labels: bug.labels,
      priority: bug.priority.name,
      project: bug.project.key,
      screenshot: fileUrl(path.join(root, 'out', 'demo', 'evidence', 'close-opportunity-as-won.png')),
      screenshotName: 'close-opportunity-as-won.png',
      summary: bug.summary,
      type: bug.issuetype.name,
    },
    eyebrow: 'Jira-ready bug',
    narration: `Each root cause becomes a Jira-ready bug, with the error, the likely cause, the deployment details, and the evidence. With the post Jira flag, Sentinel creates the issues and attaches the screenshots.`,
    sample: true,
    title: 'One bug per root cause, with evidence',
    type: 'jira',
  },
  {
    eyebrow: 'Agent skill',
    file: '.cursor/skills/deploy-sentinel/SKILL.md',
    focus,
    lines: skillLines,
    narration: `The Deploy Sentinel skill teaches any coding agent the safe order. Check that Robotic Testing is ready, plan, run, report, offer a rerun of failed tests, and only file bugs after approval.`,
    title: 'Teaching the agent the safe order',
    type: 'code',
  },
  {
    eyebrow: 'Quality',
    narration: `The plugin is covered by fifteen unit tests. And the gate flag fails the pipeline on a red verdict, so a broken release never moves forward.`,
    sample: true,
    steps: [
      {cmd: 'npm test', output: read('tests.txt')},
      {cmd: 'agentia sentinel report --simulate --out out/demo --gate --json > /dev/null; echo "exit code $?"', output: `exit code ${read('gate-exit.txt')}`},
    ],
    title: 'Tested, and ready to gate a pipeline',
    type: 'terminal',
  },
  {
    eyebrow: 'Deploy Sentinel',
    narration: `Deploy Sentinel. From deployed, to verified, in minutes. Thanks for watching.`,
    subtitle: 'From deployed to verified, in minutes.',
    title: 'Thank you',
    type: 'title',
  },
]

// Narration per scene; each scene lasts as long as its narration plus a short lead-in and hold.
const LEAD = 0.7
const HOLD = {code: 1.6, flow: 1.6, jira: 2.2, list: 1.4, scroll: 2.4, terminal: 2.2, title: 1.4}
let start = 0
for (const [index, scene] of scenes.entries()) {
  const file = path.join(audioDir, `scene-${String(index).padStart(2, '0')}.aiff`)
  execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', file, scene.narration])
  const info = execFileSync('afinfo', [file], {encoding: 'utf8'})
  scene.audioDuration = Number(info.match(/estimated duration: ([\d.]+)/)[1])
  scene.audioOffset = LEAD
  scene.audioFile = file
  scene.duration = LEAD + scene.audioDuration + HOLD[scene.type]
  scene.start = start
  start += scene.duration
}

const total = start
console.log(`timeline ${total.toFixed(1)}s across ${scenes.length} scenes`)
fs.writeFileSync(
  path.join(build, 'timeline.json'),
  JSON.stringify({audio: scenes.map((scene) => ({file: scene.audioFile, start: scene.start + scene.audioOffset})), fps: FPS, total}, null, 2),
)

const page = await browser.newPage({deviceScaleFactor: 1, viewport: {height: 1080, width: 1920}})
page.on('pageerror', (error) => console.error('page error:', error.message))
await page.goto(fileUrl(path.join(here, 'player.html')))
await page.evaluate((data) => {
  window.DATA = data
}, {author, scenes, total})
await page.evaluate(async (urls) => {
  await Promise.all(urls.map((src) => new Promise((resolve) => Object.assign(new Image(), {onerror: resolve, onload: resolve, src}))))
}, [fileUrl(reportShot), scenes.find((scene) => scene.type === 'jira').bug.screenshot])

const frames = Math.ceil(total * FPS)
for (let frame = 0; frame < frames; frame++) {
  await page.evaluate((t) => window.renderAt(t), frame / FPS)
  await page.screenshot({path: path.join(framesDir, `f${String(frame).padStart(5, '0')}.jpg`), quality: 88, type: 'jpeg'})
  if (frame % (FPS * 20) === 0) console.log(`frame ${frame}/${frames}`)
}

await browser.close()
console.log(`rendered ${frames} frames`)

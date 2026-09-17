/**
 * Find links in the app that no longer go anywhere.
 *
 * FIRST reorganised its website in 2025 and three buttons in the getting-started
 * guide quietly started returning 404 — registration, grants, and the guest
 * screen's primary action. Nothing in the build could notice: a URL in a string
 * compiles the same whether or not the page behind it exists. So this asks the
 * internet directly.
 *
 * Only a definitive answer fails the run — 404, 410, or no response at all.
 * Plenty of sites answer an automated request with 403 or 429, and a check that
 * fails on those would be red every week for reasons nobody can fix, which is
 * how a check stops being read. Those are reported and left alone.
 *
 * Tests and fixtures are skipped: the URLs there are sample data, and whether
 * goBILDA still has a /mecanum page says nothing about the app.
 *
 *   npm run links
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = 'src'
const TIMEOUT_MS = 20_000

/** Hosts that are called by code, not linked for a person to open. */
const NOT_PAGES = [/supabase\.co/, /api\.ftcscout\.org/, /fonts\.(googleapis|gstatic)\.com/, /w3\.org/, /localhost/, /example\./]

function* sourceFiles(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      if (name === 'test') continue
      yield* sourceFiles(path)
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      yield path
    }
  }
}

/** url → the files it appears in, so a failure says where to go and fix it. */
const found = new Map()
for (const file of sourceFiles(ROOT)) {
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(/https:\/\/[A-Za-z0-9./?=_%&#~+-]+/g)) {
    // Half of a template literal — `…/teams/${n}` — is not a page on its own,
    // and checking the half would report a link that works as dead.
    if (text[match.index + match[0].length] === '$') continue
    const url = match[0].replace(/[.,)]+$/, '')
    if (NOT_PAGES.some((pattern) => pattern.test(url))) continue
    found.set(url, [...(found.get(url) ?? []), file])
  }
}

async function status(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      // Some sites refuse requests that do not look like a browser.
      headers: { 'user-agent': 'Mozilla/5.0 (FTC Home link check)' },
    })
    return { code: response.status, landed: response.url }
  } catch (err) {
    return { code: 0, landed: '', error: err instanceof Error ? err.message : String(err) }
  } finally {
    clearTimeout(timer)
  }
}

const dead = []
const unsure = []

for (const [url, files] of [...found].sort()) {
  const result = await status(url)
  const where = [...new Set(files)].join(', ')
  if (result.code === 404 || result.code === 410 || result.code === 0) {
    dead.push(`  ${result.code || 'no response'}  ${url}\n        in ${where}${result.error ? `\n        ${result.error}` : ''}`)
  } else if (result.code >= 400) {
    unsure.push(`  ${result.code}  ${url}  (in ${where})`)
  } else {
    const moved = result.landed && result.landed.replace(/\/$/, '') !== url.replace(/\/$/, '')
    console.log(`  ok   ${url}${moved ? `  → ${result.landed}` : ''}`)
  }
}

if (unsure.length) {
  console.log(`\nAnswered, but not with a page — often a bot filter, so not treated as broken:\n${unsure.join('\n')}`)
}

if (dead.length) {
  console.error(`\n${dead.length} dead link${dead.length === 1 ? '' : 's'}:\n${dead.join('\n')}`)
  process.exit(1)
}

console.log(`\n${found.size} links checked, none dead.`)

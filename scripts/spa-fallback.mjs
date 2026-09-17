/**
 * Give every screen a real page on GitHub Pages.
 *
 * Pages has no rewrite rules. A request for /FTCHome/roster finds no file, so
 * it serves 404.html — which is a copy of the app, so a desktop browser renders
 * the right screen and nobody notices. Everything that reads the *status* does
 * notice: link previews in Messages and Discord show "404", iOS treats the page
 * as an error when it is added to the home screen, and a shared link to the
 * roster looks broken before anyone opens it.
 *
 * So each static route gets its own copy of index.html, written both as
 * `roster.html` and `roster/index.html`. Pages serves the first for /roster and
 * the second for /roster/, both with 200. The asset URLs in index.html are
 * absolute (/FTCHome/assets/…), so the same file works at any depth.
 *
 * Routes with a parameter — /events/:id, /chat/:id — cannot be enumerated at
 * build time and still fall through to 404.html, which keeps them working in a
 * browser. They are also the links people share least.
 *
 * The route list is read out of App.tsx rather than kept here, so adding a
 * screen cannot quietly leave it on the 404 path. If the scan finds almost
 * nothing, App.tsx has changed shape and this fails the deploy rather than
 * shipping a site where every link 404s again.
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const DIST = 'dist'
const INDEX = join(DIST, 'index.html')

if (!existsSync(INDEX)) {
  throw new Error(`${INDEX} is missing — run the build first.`)
}

const source = readFileSync('src/App.tsx', 'utf8')
const routes = [...new Set([...source.matchAll(/path="(\/[^"]*)"/g)].map((m) => m[1]))].filter(
  (path) => path !== '/' && !path.includes(':') && !path.includes('*'),
)

if (routes.length < 10) {
  throw new Error(
    `Found only ${routes.length} static routes in src/App.tsx. The route declarations have ` +
      'probably changed shape; update the pattern in scripts/spa-fallback.mjs.',
  )
}

function write(target) {
  mkdirSync(dirname(target), { recursive: true })
  copyFileSync(INDEX, target)
}

// Anything unenumerable still gets the app rather than GitHub's own 404 page.
write(join(DIST, '404.html'))

for (const route of routes) {
  const relative = route.slice(1)
  write(join(DIST, `${relative}.html`))
  write(join(DIST, relative, 'index.html'))
}

console.log(`spa-fallback: ${routes.length} routes → ${routes.join(' ')}`)

# FTC Home — Expo Go shell

Runs FTC Home on your phone through Expo Go.

## Read this first

**This is a WebView wrapper, not a React Native port.**

FTC Home is a web PWA — React DOM, IndexedDB, a service worker, react-router,
and a WebGL CAD viewer. Expo Go executes React Native bundles, so it cannot
run that code. A real port means rewriting all nineteen screens and giving up
the offline-first storage the whole app is built around.

So this Expo app does one thing: it opens the web app inside a native
WebView.

**What you get:** the app on your phone from a QR code, an app icon, a native
shell, Android back-button handling, and pull-to-refresh. Every change you
make in `src/` shows up here — it is the same web app.

**What you do not get:** native modules, push notifications, or app-store
distribution beyond what the PWA already does. If you need those, porting is
a separate decision worth making deliberately rather than discovering
halfway through.

The PWA route already covers most of this: **Safari → Share → Add to Home
Screen** gives an icon and offline support with no Expo at all.

## Run it

```bash
cd mobile
npm install
npx expo start
```

Scan the QR with Expo Go (Android) or the Camera app (iOS).

By default it loads the deployed site. To point it at your own machine so you
see edits live, start the web dev server on the LAN first:

```bash
npm run dev:mobile
```

then, in this directory:

```bash
EXPO_PUBLIC_FTC_HOME_URL=http://192.168.86.26:5178 npx expo start
```

Replace the IP with your machine's. A plain `npm run dev` only listens on
localhost and your phone will not reach it.

## Two things that will bite you

**OAuth opens the system browser, on purpose.** Google refuses to complete
sign-in inside an embedded WebView — an in-app login screen is exactly the
pattern phishing uses, so the block is deliberate on their side, not a bug
here. `App.tsx` intercepts those URLs and hands them to the system browser.
The session then lives in that browser, not in the WebView, so **signing in
from the wrapper does not sign you in inside it**. Use the PWA install for a
sign-in flow that works end to end.

**Service workers do not run over plain http on a LAN IP.** Browsers restrict
them to secure contexts. Pointed at a dev server you get the UI but no
offline behaviour; pointed at the deployed HTTPS site you get both.

## Isolation

Nothing here is part of the web build. The root `tsconfig.json` only includes
`src`, there are no npm workspaces, and CI never enters this directory. It has
its own `package.json` and `node_modules`.

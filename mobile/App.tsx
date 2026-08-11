import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  BackHandler,
  Linking,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import Constants from 'expo-constants'
import { WebView, type WebViewNavigation } from 'react-native-webview'

/**
 * FTC Home — Expo Go shell.
 *
 * READ THIS BEFORE EXTENDING IT.
 *
 * This is a WebView wrapper, not a React Native port. FTC Home is a web PWA:
 * React DOM, IndexedDB, a service worker, react-router, and a WebGL CAD
 * viewer. Expo Go executes React Native bundles, so it cannot run that code —
 * a real port means rewriting all nineteen screens and giving up the
 * offline-first storage the app is built around.
 *
 * What this gets you: the app on your phone from Expo Go, over the QR code,
 * with an app icon and a native shell. Everything inside is the same web app,
 * so every fix you make in `src/` shows up here with a pull-to-refresh.
 *
 * What it does not get you: native modules, push notifications, or app-store
 * distribution beyond what the PWA already does. If you ever need those, the
 * decision to actually port is a separate one — and worth making deliberately
 * rather than discovering halfway through.
 */

const FALLBACK_URL = 'https://tensor-ftc.github.io/FTCHome/'

/**
 * Dev builds point at the LAN dev server so you see your edits immediately;
 * everything else points at the deployed site.
 *
 * Set EXPO_PUBLIC_FTC_HOME_URL to override — that is how you aim it at
 * `npm run dev:mobile` on your own machine, e.g.
 *   EXPO_PUBLIC_FTC_HOME_URL=http://192.168.86.26:5178 npx expo start
 */
function resolveUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_FTC_HOME_URL
  if (fromEnv) return fromEnv
  const fromConfig = (Constants.expoConfig?.extra as { webUrl?: string } | undefined)?.webUrl
  return fromConfig ?? FALLBACK_URL
}

export default function App() {
  const url = resolveUrl()
  const webRef = useRef<WebView>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState<string | null>(null)
  const [canGoBack, setCanGoBack] = useState(false)

  // Android's hardware back button should walk the web history, not close the
  // app on the first press — otherwise every tap of Back quits.
  const onNavStateChange = useCallback((nav: WebViewNavigation) => {
    setCanGoBack(nav.canGoBack)
  }, [])

  useEffect(() => {
    if (Platform.OS !== 'android') return
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!canGoBack) return false // Let Android close the app.
      webRef.current?.goBack()
      return true
    })
    return () => sub.remove()
  }, [canGoBack])

  const reload = useCallback(() => {
    setFailed(null)
    setLoading(true)
    webRef.current?.reload()
  }, [])

  if (failed) {
    return (
      <SafeAreaView style={styles.shell}>
        <StatusBar style="light" />
        <ScrollView
          contentContainerStyle={styles.center}
          refreshControl={<RefreshControl refreshing={false} onRefresh={reload} tintColor="#C6E84F" />}
        >
          <Text style={styles.title}>Cannot reach FTC Home</Text>
          <Text style={styles.body}>{failed}</Text>
          <Text style={styles.meta}>{url}</Text>
          <Text style={styles.meta}>
            If you are pointing at a dev server, check your phone is on the same wifi and that you
            started it with {'`npm run dev:mobile`'} — a plain {'`npm run dev`'} only listens on
            localhost.
          </Text>
          <TouchableOpacity style={styles.button} onPress={reload}>
            <Text style={styles.buttonText}>Try again</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.shell}>
      <StatusBar style="light" />
      <WebView
        ref={webRef}
        source={{ uri: url }}
        style={styles.web}
        // The app stores a whole season in IndexedDB; without these it would
        // come up empty every launch.
        domStorageEnabled
        javaScriptEnabled
        // Keep the season across launches rather than treating it as cache.
        cacheEnabled
        // Media (build-log video) should not demand a tap to start.
        mediaPlaybackRequiresUserAction={false}
        allowsInlineMediaPlayback
        pullToRefreshEnabled
        onNavigationStateChange={onNavStateChange}
        onLoadEnd={() => setLoading(false)}
        onError={(e) => setFailed(e.nativeEvent.description || 'Network error')}
        onHttpError={(e) => setFailed(`Server returned ${e.nativeEvent.statusCode}`)}
        // OAuth sends the browser to Google/GitHub/Apple and back. Those must
        // open in the system browser: Google refuses to sign you in inside an
        // embedded WebView, and an in-app login screen is exactly the pattern
        // phishing uses, so the block is deliberate on their side.
        onShouldStartLoadWithRequest={(req) => {
          const isOAuth = /accounts\.google\.com|github\.com\/login|appleid\.apple\.com/.test(req.url)
          if (isOAuth) {
            void Linking.openURL(req.url)
            return false
          }
          return true
        }}
      />
      {loading && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator size="large" color="#C6E84F" />
        </View>
      )}
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  shell: { flex: 1, backgroundColor: '#0B0C0D' },
  web: { flex: 1, backgroundColor: '#0B0C0D' },
  loading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0B0C0D',
  },
  center: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  title: { color: '#F4F6F7', fontSize: 21, fontWeight: '600', textAlign: 'center' },
  body: { color: '#AEB6BA', fontSize: 14, textAlign: 'center' },
  meta: { color: '#6F797E', fontSize: 12, textAlign: 'center' },
  button: {
    marginTop: 14,
    backgroundColor: '#C6E84F',
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 999,
  },
  buttonText: { color: '#0B0C0D', fontWeight: '600', fontSize: 15 },
})

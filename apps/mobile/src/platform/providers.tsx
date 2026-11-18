import {
  type ClientDeps,
  createApiClient,
  createDevAuth,
  createQueryClient,
  type Route,
} from "@app/client";
import { ClientProvider } from "@app/client/react";
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { BackHandler, Platform } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { createStackNavigator, type StackNavigator } from "./navigator";

/**
 * The API's base URL, inlined at build time. The default suits the iOS
 * simulator; an Android emulator reaches the host as http://10.0.2.2:4000,
 * a device by the host's LAN address.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

/** Mobile's implementation of the client ports, created once per app start. */
export function createPlatform(): { deps: ClientDeps; navigator: StackNavigator } {
  // The dev auth port: no sign-in, so the app runs against a local API in
  // dev mode. Mobile sign-in (react-native-auth0) comes with issue #48.
  const auth = createDevAuth();
  const navigator = createStackNavigator();
  return {
    navigator,
    deps: {
      api: createApiClient({ baseUrl: API_URL, auth }),
      auth,
      queryClient: createQueryClient(),
      navigator,
      clock: {
        now: () => performance.now(),
        timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      // Metro's development builds set __DEV__; release builds (and `expo export`) don't.
      environment: __DEV__ ? "development" : "production",
    },
  };
}

const NavigatorContext = createContext<StackNavigator | null>(null);

/** Supplies the stack navigator to `useCurrentRoute` and `useBack`. */
export function NavigatorProvider({
  navigator,
  children,
}: {
  navigator: StackNavigator;
  children: ReactNode;
}) {
  return <NavigatorContext.Provider value={navigator}>{children}</NavigatorContext.Provider>;
}

function useNavigator(hook: string): StackNavigator {
  const navigator = useContext(NavigatorContext);
  if (!navigator) throw new Error(`${hook}: wrap the app in <Providers>`);
  return navigator;
}

export function Providers({ children }: { children: ReactNode }) {
  const [platform] = useState(createPlatform);
  // Android's back button pops the stack; at the root it leaves the app.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => platform.navigator.back());
    return () => sub.remove();
  }, [platform]);
  return (
    <SafeAreaProvider>
      <ClientProvider deps={platform.deps}>
        <NavigatorProvider navigator={platform.navigator}>{children}</NavigatorProvider>
      </ClientProvider>
    </SafeAreaProvider>
  );
}

/** The route on top of the stack. */
export function useCurrentRoute(): Route {
  const navigator = useNavigator("useCurrentRoute");
  const routes = useSyncExternalStore(
    navigator.stack.subscribe,
    navigator.stack.get,
    navigator.stack.get,
  );
  return routes.at(-1) ?? { to: "home" };
}

/**
 * Back one route (the placeholder for screens the app doesn't have yet).
 * Throws outside <Providers>, like useCurrentRoute, rather than returning a
 * Back that silently does nothing.
 */
export function useBack(): () => void {
  const navigator = useNavigator("useBack");
  return () => {
    navigator.back();
  };
}

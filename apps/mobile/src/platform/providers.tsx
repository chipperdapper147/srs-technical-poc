import {
  type ClientDeps,
  createAccessGate,
  createApiClient,
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
import { secureKeyStorage } from "./key-storage";
import { createStackNavigator, type StackNavigator } from "./navigator";

/**
 * The API's base URL, inlined at build time. The default suits the iOS
 * simulator; an Android emulator reaches the host as http://10.0.2.2:4000,
 * a device by the host's LAN address.
 */
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:4000";

/** Mobile's implementation of the client ports, created once per app start. */
export function createPlatform(): { deps: ClientDeps; navigator: StackNavigator } {
  const access = createAccessGate(secureKeyStorage);
  const navigator = createStackNavigator();
  return {
    navigator,
    deps: {
      api: createApiClient({ baseUrl: API_URL, access }),
      access,
      queryClient: createQueryClient(),
      navigator,
      clock: { now: () => performance.now() },
    },
  };
}

const NavigatorContext = createContext<StackNavigator | null>(null);

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
        <NavigatorContext.Provider value={platform.navigator}>{children}</NavigatorContext.Provider>
      </ClientProvider>
    </SafeAreaProvider>
  );
}

/** The route on top of the stack. */
export function useCurrentRoute(): Route {
  const navigator = useContext(NavigatorContext);
  if (!navigator) throw new Error("useCurrentRoute: wrap the app in <Providers>");
  const routes = useSyncExternalStore(
    navigator.stack.subscribe,
    navigator.stack.get,
    navigator.stack.get,
  );
  return routes.at(-1) ?? { to: "courses" };
}

/** Back one route (the placeholder for screens the app doesn't have yet). */
export function useBack(): () => void {
  const navigator = useContext(NavigatorContext);
  return () => navigator?.back();
}

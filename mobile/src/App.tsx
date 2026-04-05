import { lazy, Suspense } from "solid-js";
import { Router, Route } from "@solidjs/router";
import AppShell from "./components/AppShell";

const SetupScreen     = lazy(() => import("./screens/SetupScreen"));
const DiscoveryScreen = lazy(() => import("./screens/DiscoveryScreen"));
const PairingScreen   = lazy(() => import("./screens/PairingScreen"));
const DashboardScreen = lazy(() => import("./screens/DashboardScreen"));
const ChatScreen      = lazy(() => import("./screens/ChatScreen"));
const TerminalScreen  = lazy(() => import("./screens/TerminalScreen"));
const MonitorScreen   = lazy(() => import("./screens/MonitorScreen"));
const AuthScreen      = lazy(() => import("./screens/AuthScreen"));

const Loading = () => <div class="screen"><p>Loading…</p></div>;

export default function App() {
  return (
    <Router>
      <Suspense fallback={<Loading />}>
        <Route path="/" component={() => {
          // Redirect / to /discovery on load
          window.location.replace("/discovery");
          return <Loading />;
        }} />
        <Route path="/auth"      component={AuthScreen} />
        <Route path="/setup"     component={() => <AppShell><SetupScreen /></AppShell>} />
        <Route path="/discovery" component={() => <AppShell><DiscoveryScreen /></AppShell>} />
        <Route path="/pairing"   component={() => <AppShell><PairingScreen /></AppShell>} />
        <Route path="/dashboard" component={() => <AppShell><DashboardScreen /></AppShell>} />
        <Route path="/chat"      component={() => <AppShell><ChatScreen /></AppShell>} />
        <Route path="/terminal/:id" component={() => <AppShell><TerminalScreen /></AppShell>} />
        <Route path="/monitor"      component={() => <MonitorScreen />} />
      </Suspense>
    </Router>
  );
}

import { createSignal, Show, onMount } from "solid-js";
import { useSearchParams, useNavigate } from "@solidjs/router";
import { getServerConfig } from "../services/storage";
import "./AuthScreen.css";

export default function AuthScreen() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [pin, setPin] = createSignal("");
  const [password, setPassword] = createSignal("");
  const [error, setError] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [serverHost, setServerHost] = createSignal("");

  onMount(async () => {
    const cfg = await getServerConfig();
    if (cfg) {
      setServerHost(`http://${cfg.host}:${cfg.httpPort}`);
    } else {
      // Fallback to current origin if no config
      setServerHost(window.location.origin);
    }
  });

  const handleAuth = async (type: 'pin' | 'password') => {
    setLoading(true);
    setError("");
    
    try {
      const payload = type === 'pin' ? { pin: pin() } : { password: password() };
      const response = await fetch(`${serverHost()}/gui/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const data = await response.json();
      
      if (data.success && data.token) {
        localStorage.setItem("pm_session_token", data.token);
        localStorage.setItem("pm_token_expiry", (Date.now() + 86400000).toString());
        
        const redirect = searchParams.redirect;
        if (redirect) {
          window.location.href = decodeURIComponent(redirect);
        } else {
          navigate("/monitor");
        }
      } else {
        setError(data.error || "Authentication failed");
      }
    } catch (e) {
      setError("Failed to connect to supervisor");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="auth-screen">
      <div class="auth-card">
        <div class="auth-logo">⬛</div>
        <h2>Project Memory</h2>
        <p>Authentication Required</p>

        <div class="auth-section">
          <label>6-Digit PIN</label>
          <div class="pin-input-row">
            <input 
              type="text" 
              maxlength="6" 
              placeholder="000000"
              value={pin()}
              onInput={(e) => setPin(e.currentTarget.value)}
              disabled={loading()}
            />
            <button onClick={() => handleAuth('pin')} disabled={loading() || pin().length !== 6}>
              Login
            </button>
          </div>
        </div>

        <div class="auth-divider">OR</div>

        <div class="auth-section">
          <label>Password</label>
          <input 
            type="password" 
            placeholder="Session Password"
            value={password()}
            onInput={(e) => setPassword(e.currentTarget.value)}
            disabled={loading()}
          />
          <button class="wide-btn" onClick={() => handleAuth('password')} disabled={loading() || !password()}>
            Login with Password
          </button>
        </div>

        <Show when={error()}>
          <div class="auth-error">{error()}</div>
        </Show>

        <Show when={loading()}>
          <div class="auth-loading">Authenticating...</div>
        </Show>
      </div>
    </div>
  );
}

import { useNavigate } from "@solidjs/router";

export default function SetupScreen() {
  const navigate = useNavigate();
  return (
    <div class="screen">
      <h2>Setup</h2>
      <p>Configure your connection to the Project Memory Supervisor.</p>
      <button onClick={() => navigate("/discovery")}>Discover on LAN</button>
      <button onClick={() => navigate("/pairing")}>Scan QR Code</button>
    </div>
  );
}

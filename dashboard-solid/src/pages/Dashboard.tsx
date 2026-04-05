import { createSignal, onMount } from "solid-js";

function Dashboard() {
  return (
    <div class="space-y-6">
      <h2 class="text-2xl font-bold">Dashboard Overview</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 class="text-gray-400 text-sm font-medium">Active Workspaces</h3>
          <p class="text-3xl font-bold mt-2">--</p>
        </div>
        <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 class="text-gray-400 text-sm font-medium">Active Plans</h3>
          <p class="text-3xl font-bold mt-2">--</p>
        </div>
        <div class="bg-gray-800 p-6 rounded-lg border border-gray-700">
          <h3 class="text-gray-400 text-sm font-medium">System Health</h3>
          <p class="text-3xl font-bold mt-2 text-green-500">Healthy</p>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;

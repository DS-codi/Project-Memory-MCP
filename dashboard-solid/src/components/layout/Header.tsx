import { Bell, Search, User, Menu } from 'lucide-solid';

export function Header() {
  return (
    <header class="h-14 bg-gray-800 border-b border-gray-700 flex items-center justify-between px-6">
      <div class="flex items-center flex-1">
        <div class="relative w-96">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
            <Search size={18} />
          </span>
          <input 
            type="text" 
            placeholder="Search workspaces, plans, or agents..." 
            class="w-full bg-gray-900 border border-gray-700 rounded-md py-1.5 pl-10 pr-4 text-sm text-gray-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>
      </div>

      <div class="flex items-center gap-4">
        <button class="text-gray-400 hover:text-gray-200 p-1 rounded-full hover:bg-gray-700 transition-colors">
          <Bell size={20} />
        </button>
        <div class="h-8 w-px bg-gray-700 mx-1"></div>
        <button class="flex items-center gap-2 text-gray-200 hover:text-white p-1 rounded-md hover:bg-gray-700 transition-colors">
          <div class="w-8 h-8 rounded-full bg-indigo-600 flex items-center justify-center text-xs font-bold">
            JD
          </div>
          <span class="text-sm font-medium">User</span>
        </button>
      </div>
    </header>
  );
}

import { createSignal, JSX } from "solid-js";
import { Sidebar } from "./Sidebar";
import { Header } from "./Header";

interface LayoutProps {
  children?: JSX.Element;
}

export function Layout(props: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = createSignal(false);

  return (
    <div class="flex h-screen bg-gray-900 text-gray-100 overflow-hidden font-sans">
      <Sidebar 
        collapsed={sidebarCollapsed()} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed())} 
      />
      
      <div class="flex flex-col flex-1 overflow-hidden">
        <Header />
        
        <main 
          id="main-content"
          class="flex-1 overflow-auto p-6 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
        >
          {props.children}
        </main>
      </div>
    </div>
  );
}

import { createSignal, onMount, onCleanup } from 'solid-js';
import gsap from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';

// Register Plugin
if (typeof window !== 'undefined') {
  gsap.registerPlugin(MotionPathPlugin);
}

const VortexBackground = (props) => {
  let svgRef;
  let vortexRef;
  let rainRef;
  let coreInnerRef;
  let coreGlowRef;

  const [criticality, setCriticality] = createSignal(0);
  
  // Internal state tracking
  const state = {
    activeParticles: 0,
    isExploding: false,
    startTime: Date.now(),
    cycleDuration: 120000, // 2-minute build up
    paths: ["#spiral-1", "#spiral-2", "#spiral-3", "#spiral-4", "#spiral-5", "#spiral-6", "#spiral-7", "#spiral-8"],
    shapes: ["#drop-1", "#drop-2", "#drop-3", "#drop-4"]
  };

  const spawnVortex = (pathIdOverride = null) => {
    if (state.isExploding) return;
    
    const randomShape = state.shapes[Math.floor(Math.random() * state.shapes.length)];
    const particle = document.createElementNS("http://www.w3.org/2000/svg", "use");
    particle.setAttributeNS("http://www.w3.org/1999/xlink", "href", randomShape);
    particle.classList.add('p-vortex');
    vortexRef.appendChild(particle);
    state.activeParticles++;

    const pathId = pathIdOverride || state.paths[Math.floor(Math.random() * state.paths.length)];
    const pathElem = document.querySelector(pathId);
    if (!pathElem) return;

    const scale = 1.0 + Math.random() * 2.0;
    const progress = criticality() / 100;
    const duration = (0.6 + Math.random() * 0.8) * (1 - (progress / 5)); 
    const jitter = 50 + (progress * 150);

    // Initial positioning off-screen
    gsap.set(particle, { opacity: 0, scale: 0, x: -2000, y: -2000, transformOrigin: "50% 10%" });

    const tl = gsap.timeline({
      onComplete: () => {
        if (particle.parentNode) {
          particle.remove();
          state.activeParticles--;
        }
      }
    });

    tl.to(particle, { opacity: 1, scale: scale, duration: 0.2 })
      .to(particle, {
        motionPath: { path: pathElem, autoRotate: true, start: 0, end: 1 },
        x: `+=${(Math.random() - 0.5) * jitter}`,
        y: `+=${(Math.random() - 0.5) * jitter}`,
        duration: duration,
        ease: "power3.in",
        scale: scale * 0.1,
        opacity: 0.1
      }, "-=0.1");
  };

  const spawnRain = () => {
    if (state.isExploding) return;
    const randomShape = state.shapes[Math.floor(Math.random() * state.shapes.length)];
    const rain = document.createElementNS("http://www.w3.org/2000/svg", "use");
    rain.setAttributeNS("http://www.w3.org/1999/xlink", "href", randomShape);
    rain.classList.add('p-rain');
    rainRef.appendChild(rain);

    const x = Math.random() * 1600 - 550;
    const size = 0.3 + Math.random() * 0.7;
    const speed = 0.15 + Math.random() * 0.3;

    gsap.set(rain, {
      x: x, y: -500,
      scaleX: size * 0.3, scaleY: size * 4,
      opacity: 0.1 + Math.random() * 0.2,
      transformOrigin: "center center"
    });

    gsap.to(rain, {
      y: 1200, duration: speed, ease: "none",
      onComplete: () => { if (rain.parentNode) rain.remove(); }
    });
  };

  const explode = () => {
    state.isExploding = true;
    const all = document.querySelectorAll('.p-vortex, .p-rain');
    
    gsap.to(coreInnerRef, { attr: { r: 60 }, opacity: 1, duration: 0.3 });
    gsap.to(coreGlowRef, { attr: { r: 200 }, opacity: 0.6, duration: 0.3 });

    all.forEach(p => {
      gsap.killTweensOf(p);
      const t = p.getAttribute('transform') || "";
      const m = t.match(/translate\(([^, ]+)[, ]+([^)]+)\)/);
      const cx = m ? parseFloat(m[1]) : 250;
      const cy = m ? parseFloat(m[2]) : 250;
      const angle = Math.atan2(cy - 250, cx - 250);
      const dist = 1200 + Math.random() * 800;

      gsap.to(p, {
        x: cx + Math.cos(angle) * dist,
        y: cy + Math.sin(angle) * dist,
        opacity: 0, scale: 6, duration: 0.8, ease: "expo.out",
        onComplete: () => p.remove()
      });
    });

    if (props.onExploded) setTimeout(props.onExploded, 800);
  };

  onMount(() => {
    window.triggerAppLaunch = explode;

    let lastBurst = 0;
    let frameId;

    const ticker = () => {
      if (state.isExploding) return;
      const now = Date.now();
      const crit = Math.min(100, ((now - state.startTime) / state.cycleDuration) * 100);
      setCriticality(crit);

      if (crit >= 100) explode();

      if (now - lastBurst > (800 - crit * 6)) {
          const numPaths = 1 + Math.floor(crit / 35);
          for (let s = 0; s < numPaths; s++) {
            const path = state.paths[Math.floor(Math.random() * state.paths.length)];
            const size = 3 + Math.floor(Math.random() * 5);
            for(let i=0; i<size; i++) setTimeout(() => spawnVortex(path), i * 30);
          }
          lastBurst = now;
      }

      spawnRain();
      if (Math.random() < 0.8) spawnRain();
      frameId = requestAnimationFrame(ticker);
    };

    frameId = requestAnimationFrame(ticker);
    
    // Core Pulses
    gsap.to(coreInnerRef, { attr: { r: 6 }, opacity: 0.8, duration: 0.8, repeat: -1, yoyo: true, ease: "sine.inOut" });
    gsap.to(coreGlowRef, { attr: { r: 18 }, opacity: 0.3, duration: 1.2, repeat: -1, yoyo: true, ease: "sine.inOut" });

    onCleanup(() => {
      state.isExploding = true;
      cancelAnimationFrame(frameId);
      window.triggerAppLaunch = null;
    });
  });

  return (
    <div class="fixed inset-0 w-full h-full bg-[#010103] overflow-hidden pointer-events-none z-0">
      <svg ref={svgRef} viewBox="0 0 500 500" class="w-full h-full">
        <defs>
          <filter id="m-liq" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" />
            <feColorMatrix mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -8" />
            <feSpecularLighting surfaceScale="5" specularConstant="2" specularExponent="40" lightingColor="#ffffff">
              <fePointLight x="-250" y="-250" z="400" />
            </feSpecularLighting>
            <feComposite operator="in" in2="SourceGraphic" />
          </filter>

          <radialGradient id="l-grad">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0.9" />
            <stop offset="30%" stop-color="#60a5fa" stop-opacity="0.7" />
            <stop offset="100%" stop-color="#1e40af" stop-opacity="0.4" />
          </radialGradient>

          <path id="drop-1" d="M 0,-10 C 5,-10 8,-4 8,2 8,8 4,25 0,40 -4,25 -8,8 -8,2 -8,-4 -5,-10 0,-10 Z" fill="url(#l-grad)" filter="url(#m-liq)" />
          <path id="drop-2" d="M 0,-8 Q 9,-8 9,1 Q 9,10 0,10 Q -9,10 -9,1 Q -9,-8 0,-8 Z" fill="url(#l-grad)" filter="url(#m-liq)" />
          <path id="drop-3" d="M 0,-15 C 3,-15 5,-8 5,0 5,8 3,30 0,50 -3,30 -5,8 -5,0 -5,-8 -3,-15 0,-15 Z" fill="url(#l-grad)" filter="url(#m-liq)" />
          <path id="drop-4" d="M 0,-8 C 7,-8 11,-4 11,5 11,14 7,20 0,20 -7,20 -11,14 -11,5 -11,-4 -7,-8 0,-8 Z" fill="url(#l-grad)" filter="url(#m-liq)" />

          <g id="v-paths" visibility="hidden">
            <path id="spiral-1" d="M 1100, -300 C 800, 200 1000, 700 500, 700 C 100, 700 0, 300 250, 150 C 450, 50 450, 350 250, 350 C 150, 350 150, 200 250, 250" />
            <path id="spiral-2" d="M -400, 1000 C 100, 1200 700, 800 700, 400 C 700, 0 300, -100 150, 150 C 50, 350 350, 450 350, 250 C 350, 150 200, 150 250, 250" />
            <path id="spiral-3" d="M -500, -300 C -100, -600 600, -200 600, 200 C 600, 500 200, 600 100, 350 C 50, 150 350, 100 350, 250 C 350, 350 200, 350 250, 250" />
            <path id="spiral-4" d="M 1200, 1000 C 1000, 500 400, 800 200, 600 C -100, 400 200, -100 400, 100 C 550, 250 150, 450 250, 250" />
            <path id="spiral-5" d="M 1200, 250 C 900, -200 400, -100 100, 100 C -100, 300 300, 600 400, 400 C 500, 200 200, 100 250, 250" />
            <path id="spiral-6" d="M -600, 250 C -200, 600 300, 800 500, 500 C 700, 200 400, -200 150, 100 C 0, 300 400, 400 250, 250" />
            <path id="spiral-7" d="M 250, 1200 C 600, 900 800, 400 500, 100 C 200, -100 -200, 300 100, 450 C 400, 600 450, 100 250, 250" />
            <path id="spiral-8" d="M 250, -800 C -200, -400 -300, 300 100, 600 C 500, 900 800, 300 450, 100 C 100, -100 50, 400 250, 250" />
          </g>
        </defs>

        <g id="rain-layer" ref={rainRef} />
        <g id="vortex-layer" ref={vortexRef} />
        <g id="v-core">
            <circle ref={coreGlowRef} cx="250" cy="250" r="12" fill="#5e9eff" opacity="0.15" filter="blur(8px)" />
            <circle ref={coreInnerRef} cx="250" cy="250" r="4" fill="white" opacity="0.5" filter="blur(2px)" />
        </g>
      </svg>

      {/* Progress UI */}
      <div class="absolute bottom-0 left-0 w-full h-1 bg-white/5 opacity-20">
        <div 
          class="h-full bg-blue-500 shadow-[0_0_10px_#3b82f6] transition-all duration-100 ease-linear" 
          style={{ width: `${criticality()}%` }}
        />
      </div>
    </div>
  );
};

// Example App usage to demonstrate the component
const App = () => {
  const [isLoaded, setIsLoaded] = createSignal(false);

  return (
    <div class="relative h-screen w-screen overflow-hidden bg-black flex items-center justify-center">
      <VortexBackground onExploded={() => setIsLoaded(true)} />

      {!isLoaded() ? (
        <div class="relative z-10 flex flex-col items-center gap-6">
          <h1 class="text-blue-400 font-mono text-xl tracking-[0.5em] uppercase opacity-80">
            System Initialize
          </h1>
          <button 
            onClick={() => window.triggerAppLaunch?.()}
            class="px-10 py-4 border border-blue-500 rounded-full text-blue-400 hover:bg-blue-500/10 transition-all uppercase tracking-widest font-mono text-sm group"
          >
            Launch Interface
          </button>
        </div>
      ) : (
        <div class="relative z-10 text-center animate-in fade-in zoom-in duration-1000">
           <h2 class="text-white font-mono text-3xl tracking-widest">DASHBOARD_LOADED</h2>
           <p class="text-blue-500/60 font-mono mt-4">Simulation sequence terminated successfully.</p>
        </div>
      )}
    </div>
  );
};

export default App;`
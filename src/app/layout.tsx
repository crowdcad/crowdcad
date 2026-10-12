import type { Metadata } from 'next';
// import { Geist, Geist_Mono } from 'next/font/google';
import 'react-toastify/dist/ReactToastify.css';
import "./globals.css";
import "../styles/ui-style.css";
import { DEFAULT_UI_STYLE, UI_STYLE_INIT_SCRIPT } from "@/lib/uiStyle";
import { UI_FONT_VARIABLES } from "@/lib/uiFonts";
import { HeroUIProvider } from "@heroui/react";
import DevServiceWorkerCleanup from "@/components/devServiceWorkerCleanup";
import ProgressBarProvider from "@/components/ProgressBarProvider";
import AppShell from "../components/layout/appshell";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-ui={DEFAULT_UI_STYLE} className={`text-foreground bg-background ${UI_FONT_VARIABLES}`} suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* UI style (src/lib/uiStyle.ts): a style saved in this browser overrides the build default before paint. */}
        <script dangerouslySetInnerHTML={{ __html: UI_STYLE_INIT_SCRIPT }} />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                try {
                  var stored = localStorage.getItem('ccad-theme');
                  var useDark = stored ? stored === 'dark' : true;
                  var root = document.documentElement;
                  root.classList.toggle('dark', useDark);
                  root.setAttribute('data-theme', useDark ? 'dark' : 'light');
                } catch (e) {
                  document.documentElement.classList.add('dark');
                  document.documentElement.setAttribute('data-theme', 'dark');
                }
                try {
                  var reducedMotion = localStorage.getItem('ccad-reduced-motion') === '1';
                  var root2 = document.documentElement;
                  root2.classList.toggle('reduce-motion', reducedMotion);
                  root2.setAttribute('data-reduced-motion', String(reducedMotion));
                } catch (e) {
                  // localStorage unavailable — falls back to OS prefers-reduced-motion via CSS
                }
              })();
            `,
          }}
        />
        {/* Inline early-unregister to avoid stale service worker serving old _next chunks in dev */}
        {process.env.NODE_ENV === 'development' && (
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function(){
                  try{
                    if(!('serviceWorker' in navigator)) return;
                    // Avoid looping reloads - only reload once per session if we unregister
                    const reloaded = sessionStorage.getItem('sw_reload_done');
                    function doUnregisterAndReload(){
                      navigator.serviceWorker.getRegistrations().then(function(regs){
                        if(!regs || regs.length === 0) return;
                        Promise.all(regs.map(function(r){ try{ return r.unregister(); }catch(e){return Promise.resolve(false);} })).then(function(){
                          try{ sessionStorage.setItem('sw_reload_done','1'); }catch(e){}
                          if(!reloaded){ location.reload(true); }
                        }).catch(function(){/* ignore */});
                      }).catch(function(){/* ignore */});
                    }

                    // Run on load to clear stale SWs
                    doUnregisterAndReload();

                    // Eagerly import HeroUI DOM animation module to warm up chunk fetch
                    // This avoids a lazy chunk being requested at the moment of first interaction
                    try{
                      setTimeout(function(){
                        try{ import('@heroui/dom-animation/dist/index.mjs').catch(function(){}); }catch(e){}
                      }, 800);
                    }catch(e){}

                    // Recover from dynamic chunk load failures (ChunkLoadError) by unregistering service workers and reloading once
                    function isChunkLoadErrorMessage(msg){ return typeof msg === 'string' && msg.indexOf('Loading chunk') !== -1; }

                    window.addEventListener('error', function(e){
                      try{
                        var m = e && e.message;
                        if(isChunkLoadErrorMessage(m)){
                          if(!sessionStorage.getItem('chunk_reload_done')){
                            sessionStorage.setItem('chunk_reload_done','1');
                            doUnregisterAndReload();
                          }
                        }
                      }catch(err){}
                    }, true);

                    window.addEventListener('unhandledrejection', function(ev){
                      try{
                        var reason = ev && ev.reason;
                        var msg = reason && (reason.message || reason.stack || String(reason));
                        if(isChunkLoadErrorMessage(msg)){
                          if(!sessionStorage.getItem('chunk_reload_done')){
                            sessionStorage.setItem('chunk_reload_done','1');
                            doUnregisterAndReload();
                          }
                        }
                      }catch(err){}
                    });
                  }catch(e){}
                })();
              `,
            }}
          />
        )}
        <DevServiceWorkerCleanup />
        <ProgressBarProvider />
        <HeroUIProvider disableRipple>
          <AppShell>{children}</AppShell>
        </HeroUIProvider>
      </body>
    </html>
  );
}

// const geistSans = Geist({
//   variable: '--font-geist-sans',
//   subsets: ['latin'],
// });

// const geistMono = Geist_Mono({
//   variable: '--font-geist-mono',
//   subsets: ['latin'],
// });

export const metadata: Metadata = {
  title: 'CrowdCAD',
  description: 'A fast, free dispatch app for volunteer medical teams',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: true,
};
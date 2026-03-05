import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import AppRoutes from "./AppRoutes";
import NotFound from "./pages/NotFound";
import AccessibilityProvider from "./components/AccessibilityProvider";
import { useEffect, useState } from "react";

const queryClient = new QueryClient();

/**
 * Diagnostic overlay — shown briefly on mobile to confirm React rendered.
 * Auto-hides after 2s. If you still see white screen, the issue is downstream.
 */
function MobileDiagnostic() {
  const [show, setShow] = useState(true);
  
  useEffect(() => {
    console.log('[Resonance] React app mounted successfully');
    console.log('[Resonance] UA:', navigator.userAgent);
    const timer = setTimeout(() => setShow(false), 3000);
    return () => clearTimeout(timer);
  }, []);
  
  if (!show) return null;
  
  return (
    <div
      id="mount-diagnostic"
      style={{
        position: 'fixed',
        bottom: 80,
        left: '50%',
        transform: 'translateX(-50%)',
        background: 'rgba(0,0,0,0.7)',
        color: '#fff',
        padding: '6px 16px',
        borderRadius: 20,
        fontSize: 12,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      ✓ 应用已加载
    </div>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AccessibilityProvider>
        <Toaster />
        <Sonner />
        <MobileDiagnostic />
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/*" element={<AppRoutes />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </AccessibilityProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;

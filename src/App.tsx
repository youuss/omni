import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import Layout from './components/Layout';
import ProjectsPage from './pages/Projects';
import WorkspacePage from './pages/Workspace';
import './styles/global.css';

export default function App() {
  return (
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/projects" element={<ProjectsPage />} />
            <Route path="/workspace/:projectPath" element={<WorkspacePage />} />
            <Route path="*" element={<Navigate to="/projects" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </TooltipProvider>
  );
}

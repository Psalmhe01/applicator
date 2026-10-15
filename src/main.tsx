import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './theme.css';
import { AuthProvider, AuthGate, useAuth } from './Auth';
function WorkspaceApp() {
  const { account } = useAuth();
  return <App key={account?.user.id} />;
}
createRoot(document.getElementById('root')!).render(
  <AuthProvider>
    <AuthGate>
      <WorkspaceApp />
    </AuthGate>
  </AuthProvider>,
);

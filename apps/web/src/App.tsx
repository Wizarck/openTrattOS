import { Link, Outlet } from 'react-router-dom';

export function App() {
  return (
    <div className="min-h-full">
      <header className="border-b border-border-strong bg-surface px-6 py-3">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-ink">openTrattOS</h1>
          <nav className="text-sm text-mute">
            <Link to="/poc/owner-dashboard" className="hover:text-ink">
              PoC: Owner dashboard
            </Link>
          </nav>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
    </div>
  );
}

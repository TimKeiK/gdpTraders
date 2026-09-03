import { Outlet } from 'react-router-dom';
import Navbar from './Navbar';
import Footer from './Footer';
import TidioChat from './TidioChat';

export default function Layout() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <main style={{ flex: 1 }}>
        <Outlet />
      </main>
      <Footer />
      <TidioChat />
    </div>
  );
}
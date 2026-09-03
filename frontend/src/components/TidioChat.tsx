import { useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';

/**
 * Tidio live chat widget.
 *
 * Injects the Tidio script once on mount and removes it on unmount. When an
 * authenticated client is present, their identity (name + email) is pushed to
 * Tidio so support sees who is chatting. On public pages where the visitor is
 * not logged in, the widget loads anonymously.
 *
 * Mount this in any layout where you want the chat bubble to appear. It is
 * intentionally NOT mounted in the admin portal.
 */
export default function TidioChat() {
  const { user } = useAuth();

  // Inject the Tidio script. Runs once per mount.
  useEffect(() => {
    const SCRIPT_ID = 'tidio-chat-script';
    if (document.getElementById(SCRIPT_ID)) return;

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = '//code.tidio.co/hpia0zao0eucjga6c3ax74mvnfqwytbg.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      const existing = document.getElementById(SCRIPT_ID);
      if (existing) existing.remove();

      // Remove Tidio's injected iframe/container if present
      const tidioEl = document.getElementById('tidio-chat');
      if (tidioEl) tidioEl.remove();
    };
  }, []);

  // Push the client's identity to Tidio once the script has loaded.
  useEffect(() => {
    if (!user) return;

    const tryIdentify = () => {
      const api = (window as unknown as { tidioChatApi?: { setClientData?: (data: Record<string, string>) => void } }).tidioChatApi;
      if (api?.setClientData) {
        api.setClientData({
          name: user.name || user.email || '',
          email: user.email || '',
        });
      }
    };

    // Tidio loads asynchronously — poll briefly until its API is available.
    const interval = window.setInterval(() => {
      if ((window as unknown as { tidioChatApi?: unknown }).tidioChatApi) {
        tryIdentify();
        window.clearInterval(interval);
      }
    }, 500);

    // Stop polling after 10s even if Tidio never initialised.
    const timeout = window.setTimeout(() => window.clearInterval(interval), 10000);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
    };
  }, [user]);

  return null;
}

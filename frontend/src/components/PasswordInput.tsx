import { useState, type InputHTMLAttributes } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Accessible label for the show/hide toggle (defaults to "Show password"). */
  toggleLabel?: string;
}

/**
 * Text input with a show/hide (peek) toggle. Lets the user confirm what they
 * typed by temporarily revealing the password.
 */
export default function PasswordInput({ toggleLabel = 'Show password', ...props }: PasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="password-input">
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        className={`form-control ${props.className ?? ''}`.trim()}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : toggleLabel}
        tabIndex={-1}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
}
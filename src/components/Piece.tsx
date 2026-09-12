import type { Terrain } from '../core/types';

export function Piece({
  kind,
  unlocked = false,
}: {
  kind: Terrain | 'player' | 'crate';
  unlocked?: boolean;
}) {
  if (kind === 'floor')
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="1.5" fill="currentColor" opacity=".22" />
      </svg>
    );
  if (kind === 'wall')
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M9 8 54 9 55 54 8 55Z"
          fill="#a7b6c8"
          stroke="#65778f"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
        <path
          d="m16 14 8 1m7-1 16 1M12 29l41 1M10 43h44M29 10l-1 19m13 1-1 13m-21-13v13m12 0v11"
          fill="none"
          stroke="#75879e"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path d="m12 12 39 1" stroke="#ced7e1" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
    );
  if (kind === 'player')
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <ellipse cx="32" cy="54" rx="19" ry="5" fill="#173b74" opacity=".13" />
        <path
          d="M15 48V26c0-13 7-21 17-21 11 0 19 9 19 21v22l-8 7-10-5-11 5Z"
          fill="#396beb"
          stroke="#20479e"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
        <rect x="22" y="19" width="21" height="24" rx="10" fill="#fff" />
        <ellipse cx="28" cy="30" rx="2.6" ry="4" fill="#20324e" />
        <ellipse cx="38" cy="30" rx="2.6" ry="4" fill="#20324e" />
        <path d="m29 38 5 1" stroke="#20324e" strokeWidth="1.6" strokeLinecap="round" />
        <path d="m14 32-5 8m43-8 5 8" stroke="#20479e" strokeWidth="3" strokeLinecap="round" />
        <path d="m22 14 5-4" stroke="#8eafff" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  if (kind === 'crate')
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="m11 11 42-1 1 44-43-1Z"
          fill="#ddb688"
          stroke="#8a603e"
          strokeWidth="2.7"
          strokeLinejoin="round"
        />
        <path d="M17 17h30v30H17Z" fill="#ebcda7" stroke="#a97749" strokeWidth="2" />
        <path d="m18 18 28 28m0-28L18 46" stroke="#ab784b" strokeWidth="5" />
        <path d="m18 18 28 28m0-28L18 46" stroke="#f4dcb9" strokeWidth="2" />
        <path d="M11 11 17 17m36-7-6 7m7 37-7-7m-36 6 6-6" stroke="#8a603e" strokeWidth="2" />
      </svg>
    );
  if (kind === 'key')
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="m28 35 20 17 6-7-6-5-4 4-5-4 4-4-8-7"
          fill="#f7ce4a"
          stroke="#9a7416"
          strokeWidth="2.8"
          strokeLinejoin="round"
        />
        <circle cx="22" cy="23" r="14" fill="#f7ce4a" stroke="#9a7416" strokeWidth="2.8" />
        <circle cx="22" cy="23" r="5" fill="#fffdf1" stroke="#9a7416" strokeWidth="2" />
        <path d="m14 16 4-3" stroke="#fff3b9" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  if (kind === 'door')
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path
          d="M12 55V10h40v45"
          fill={unlocked ? '#e2efed' : '#eadfc9'}
          stroke="#887553"
          strokeWidth="2.6"
        />
        <path
          d={unlocked ? 'M17 52V15l27-5v47Z' : 'M18 16h28v37H18Z'}
          fill={unlocked ? '#bdcebb' : '#cfb891'}
          stroke="#887553"
          strokeWidth="2"
        />
        <path d="M10 55h45" stroke="#887553" strokeWidth="3" strokeLinecap="round" />
        {!unlocked && (
          <>
            <rect
              x="26"
              y="31"
              width="13"
              height="12"
              rx="2"
              fill="#f7ce4a"
              stroke="#8c6d24"
              strokeWidth="2"
            />
            <path d="M29 31v-5a4 4 0 0 1 8 0v5" fill="none" stroke="#8c6d24" strokeWidth="2.5" />
            <circle cx="32.5" cy="36" r="1.5" fill="#8c6d24" />
          </>
        )}
        {unlocked && (
          <path
            d="m25 32 5 5 9-11"
            stroke="#277259"
            strokeWidth="3"
            fill="none"
            strokeLinecap="round"
          />
        )}
      </svg>
    );
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="M14 55V9h37v46" fill="#d4eee4" stroke="#2f8871" strokeWidth="2.5" />
      <path d="M20 54V16h24v38" fill="#b0dbcb" />
      <path
        d="M28 33h19m-7-7 8 7-8 7"
        fill="none"
        stroke="#237d65"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10 55h46" stroke="#2f8871" strokeWidth="3" strokeLinecap="round" />
      <path d="M23 11h18" stroke="#f4fff8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

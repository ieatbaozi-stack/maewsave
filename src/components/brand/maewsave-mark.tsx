type MaewsaveMarkProps =
  | {
      className?: string;
      size?: number;
      decorative: true;
      label?: never;
    }
  | {
      className?: string;
      size?: number;
      decorative?: false;
      label: string;
    };

export function MaewsaveMark(props: MaewsaveMarkProps) {
  const { className = "", size = 28 } = props;
  const isDecorative = props.decorative === true;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      className={className}
      role={isDecorative ? undefined : "img"}
      aria-hidden={isDecorative ? true : undefined}
      aria-label={isDecorative ? undefined : props.label}
    >
      <path
        d="M 24 19 Q 32 16.75 40 19 Q 44.75 12 47.75 13.5 Q 50.25 14.75 48.75 24.25 C 54.5 30.5 54.25 44 46.5 49.5 C 40.75 53.25 23.25 53.25 17.5 49.5 C 9.75 44 9.5 30.5 15.25 24.25 Q 13.75 14.75 16.25 13.5 Q 19.25 12 24 19 Z"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="23.5" cy="31" r="2.2" fill="currentColor" />
      <circle cx="40.5" cy="31" r="2.2" fill="currentColor" />
      <path
        d="M 28.5 34.5 Q 30.25 36.8 32 35 Q 33.75 36.8 35.5 34.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M 14.5 41.5 Q 20.5 44.5 27.2 45.2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M 36.8 45.2 Q 43.5 44.5 49.5 41.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="32" cy="45.5" r="4.6" stroke="currentColor" strokeWidth="2.4" />
      <rect x="30.7" y="44.2" width="2.6" height="2.6" rx="0.5" fill="currentColor" />
    </svg>
  );
}

export default function TaskIcon({ size = 24, className = '', ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 256 256"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      {...props}
    >
      <path
        d="M92 29H54C46.3 29 40 35.3 40 43V211C40 218.7 46.3 225 54 225H166"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M164 29H202C209.7 29 216 35.3 216 43V184"
        stroke="currentColor"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M92 29V19C92 13.5 96.5 9 102 9H154C159.5 9 164 13.5 164 19V53H92V29Z"
        stroke="currentColor"
        strokeWidth="8"
        strokeLinejoin="round"
      />
      <rect x="57" y="75" width="49" height="49" rx="6" stroke="currentColor" strokeWidth="7" />
      <rect x="57" y="131" width="49" height="49" rx="6" stroke="currentColor" strokeWidth="7" />
      <rect x="57" y="187" width="49" height="49" rx="6" stroke="currentColor" strokeWidth="7" />
      <path d="M69 99L81 110L99 89" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M69 155L81 166L99 145" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M69 211L81 222L99 201" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M127 82H197M127 100H191M127 118H185M127 138H197M127 156H184M127 174H194M127 194H197M127 212H184M127 230H194" stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <circle cx="199" cy="199" r="48" stroke="currentColor" strokeWidth="8" />
      <circle cx="199" cy="199" r="37" stroke="currentColor" strokeWidth="5" />
      <path d="M179 199L192 212L219 185" stroke="currentColor" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

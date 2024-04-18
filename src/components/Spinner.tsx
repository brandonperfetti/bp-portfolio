export function Spinner() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      data-testid="spinner"
      className="animate-spin">
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M10.75 17a.75.75 0 0 1-.75.75A7.75 7.75 0 1 1 17.75 10a.75.75 0 0 1-1.5 0A6.25 6.25 0 1 0 10 16.25a.75.75 0 0 1 .75.75Z"
        fill="currentColor"
      />
    </svg>
  )
}

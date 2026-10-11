const paths = {
  home: "m3 10 9-7 9 7M5 9v12h5v-7h4v7h5V9",
  computer: "M3 3h18v13H3ZM8 21h8M12 16v5",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7v5l3 2",
  pin: "M9 3h6l-1 6 4 4v2H6v-2l4-4-1-6ZM12 15v6",
  back: "m14 5-7 7 7 7",
  forward: "m10 5 7 7-7 7",
  refresh: "M20 10a8 8 0 1 0-1 7M20 3v7h-7",
  close: "m6 6 12 12M18 6 6 18",
  book: "M12 5.5C9 3.5 5 3.5 3 4.5v15c2-1 6-1 9 1 3-2 7-2 9-1v-15c-2-1-6-1-9 1Zm0 0v15",
  folder: "M3 7h6l2 2h10l-3 10H4L2 9V5h7l2 2h7",
  file: "M14 3H6v18h12V7l-4-4Zm0 0v5h4M9 12h6M9 16h4",
  thumbnails: "M3 3h7v7H3Zm11 0h7v7h-7ZM3 14h7v7H3Zm11 0h7v7h-7Z",
  outline: "M8 5h13M8 12h13M8 19h13M3 5h.01M3 12h.01M3 19h.01",
  minus: "M5 12h14",
  plus: "M5 12h14M12 5v14",
  fitWidth: "M4 5v14M20 5v14M7 12h10M9 9l-3 3 3 3M15 9l3 3-3 3",
  fitPage: "M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5M8 7h8v10H8Z",
  search: "M10.5 3a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15ZM16 16l5 5",
  up: "M12 19V5M6 11l6-6 6 6",
  down: "M12 5v14M6 13l6 6 6-6",
  select: "m5 3 14 10-7 1-3 7L5 3Z",
  highlight: "m14 3 7 7-9 9-7-7 9-9ZM5 12l-2 5 4 4 5-2M3 21h8",
  underline: "M6 3v8a6 6 0 0 0 12 0V3M4 21h16",
  strikeout: "M18 5c-2-2-8-3-10 0-1 2 0 4 3 5M13 14c3 1 5 2 4 5-1 3-8 3-11 0M3 12h18",
  note: "M3 3h18v12l-6 6H3V3Zm12 18v-6h6M7 8h10M7 12h6",
  text: "M4 5V3h16v2M12 3v18M8 21h8",
  pen: "m16 3 5 5-12 12-6 1 1-6L16 3ZM13 6l5 5",
  pageBefore: "M14 3h-4v18h10V9l-6-6Zm0 0v6h6M2 12h5M4.5 9.5v5",
  pageAfter: "M8 3H4v18h10V9L8 3Zm0 0v6h6M17 12h5M19.5 9.5v5",
  pageDelete: "M14 3H6v18h12V7l-4-4Zm0 0v5h4M9 12l6 6M15 12l-6 6",
  print: "M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6ZM17 11h.01",
  save: "M4 3h13l4 4v14H3V3h1ZM7 3v6h10V3M7 21v-8h10v8",
  check: "m5 12 4 4L19 6",
  code: "m8 6-6 6 6 6M16 6l6 6-6 6M14 3l-4 18",
  bold: "M6 3h7a4.5 4.5 0 0 1 0 9H6V3Zm0 9h8a4.5 4.5 0 0 1 0 9H6V12Z",
  italic: "M11 3h9M4 21h9M16 3 8 21",
  link: "m10 14 4-4M9 16l-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0M15 8l2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0",
  math: "M18 3H6l8 9-8 9h12",
} as const;

export type UiIconName = keyof typeof paths;

/** Small, local icons share one stroke and never contribute a button name. */
export function UiIcon({ name }: { name: UiIconName }) {
  return (
    <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false">
      <path d={paths[name]} />
    </svg>
  );
}

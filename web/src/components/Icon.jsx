// Drobné SVG ikony (žádné emoji): jednotná tloušťka tahu, dědí barvu textu.
import React from "react";
const P = {
  star: "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3 6.1 20.6l1.3-6.6L2.5 9.4l6.6-.8z",
  plane: "M10.2 13.3L4 11.6l1.3-1.3 7.2.7 4.4-4.4a1.6 1.6 0 112.3 2.3l-4.4 4.4.7 7.2-1.3 1.3-1.7-6.2-3.2 3.2.2 2.4-1 1-1.5-3-3-1.5 1-1 2.4.2z",
  clock: "M12 3a9 9 0 110 18 9 9 0 010-18zm0 4v5l3.5 2",
  cal: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
  back: "M9 14l-4-4 4-4M5 10h9a5 5 0 010 10h-3",
  sun: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6L4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 8a4 4 0 100 8 4 4 0 000-8z",
  moon: "M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z",
  auto: "M3 5h18v11H3zM8 20h8M12 16v4",
  gear: "M12 9a3 3 0 100 6 3 3 0 000-6zm8.6 3l1.8-1.4-2-3.4-2.1.9a7 7 0 00-1.7-1L16.3 5h-4l-.3 2.3a7 7 0 00-1.7 1L8 7.4 6 10.8 7.8 12l-.1 1 .1 1L6 15.4l2 3.4 2.3-.9a7 7 0 001.7 1l.3 2.3h4l.3-2.3a7 7 0 001.7-1l2.1.9 2-3.4-1.8-1.4.1-1z",
  bell: "M6 16V11a6 6 0 1112 0v5l1.5 2h-15zM10 21h4",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  ext: "M14 4h6v6M20 4l-9 9M19 14v6H4V5h6",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  check: "M5 12l5 5L20 7",
  x: "M6 6l12 12M18 6L6 18",
  chevron: "M6 9l6 6 6-6",
  pin: "M12 21s-6-5.3-6-10a6 6 0 1112 0c0 4.7-6 10-6 10zm0-8a2 2 0 100-4 2 2 0 000 4z",
};
export default function Icon({ name, size = 16, fill = false, className = "" }) {
  return <svg className={"ic " + className} width={size} height={size} viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth={fill ? 0 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[name]} /></svg>;
}

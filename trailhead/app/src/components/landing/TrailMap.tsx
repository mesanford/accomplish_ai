/** A drawn trail map: contour lines, a river, a woodland patch and a red trail that turns at two blazes. */
export function TrailMap() {
  return (
    <svg
      className="l-map"
      viewBox="0 0 480 400"
      role="img"
      aria-label="A drawing of a trail map. A red trail winds up a hill and turns at two trail blazes."
    >
      <rect width="480" height="400" rx="12" className="l-map-ground" />
      <path d="M40 90 C90 40 200 30 260 70 C330 115 420 90 450 150 L450 190 C380 150 300 170 250 130 C190 90 100 110 40 150 Z" fill="#d3e3bc" opacity=".85" />
      <g fill="none" stroke="#7a4f24" strokeWidth="1.6" opacity=".8">
        <ellipse cx="300" cy="250" rx="150" ry="95" />
        <ellipse cx="300" cy="250" rx="112" ry="70" />
        <ellipse cx="300" cy="250" rx="74" ry="45" />
        <ellipse cx="300" cy="250" rx="38" ry="22" />
        <path d="M30 330 C100 300 150 340 220 335 C300 330 340 372 470 350" />
        <path d="M30 360 C100 340 150 376 220 372 C300 368 340 396 470 384" />
      </g>
      <path d="M-10 230 C60 210 90 260 150 240 C200 224 190 170 140 150 C100 134 90 100 120 70 L140 -10" fill="none" stroke="#2f6e9e" strokeWidth="9" strokeLinecap="round" opacity=".9" />
      <path d="M60 372 C110 330 170 330 215 300 C260 270 250 230 290 215 C335 198 380 210 400 170 C410 150 405 125 420 105" fill="none" stroke="#a8321e" strokeWidth="4" strokeDasharray="2 9" strokeLinecap="round" />
      <g transform="translate(284 196)">
        <rect x="-4" y="12" width="13" height="21" rx="2.5" fill="#fffdf7" stroke="#7a4f24" strokeWidth="1.2" />
        <rect x="10" y="-12" width="13" height="21" rx="2.5" fill="#e8b655" stroke="#7a4f24" strokeWidth="1.2" />
      </g>
      <g fontFamily="IBM Plex Mono, monospace" fontSize="12" letterSpacing="1" fill="#7a4f24">
        <text x="372" y="318">1,240 FT</text>
        <text x="180" y="66">PINE CREEK</text>
      </g>
    </svg>
  );
}

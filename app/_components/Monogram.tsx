/** JK monogram for the site header: a brass J whose stem runs down the
 *  K's stem and whose hook curls beneath it, the K in paper; the two
 *  letters set against each other as one mark (owner 2026-09-14). Drawn
 *  with the site's serif so it matches the page. */
export function Monogram({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 40" width="44" height="40" className={`font-serif ${className}`} aria-hidden focusable="false">
      {/* K, paper, set right; its stem at x≈19 */}
      <text x="16" y="31" fontSize="34" fill="currentColor" style={{ fontWeight: 600 }}>K</text>
      {/* J, brass, its stem laid against the K's stem; hook curls below */}
      <text x="9.5" y="33.5" fontSize="34" fill="#b08d57" style={{ fontWeight: 600 }}>J</text>
      {/* hairline of navy between the two stems so the overlap reads as a join, not a smear */}
      <line x1="18.4" y1="8" x2="18.4" y2="31" stroke="currentColor" strokeOpacity="0.55" strokeWidth="1" />
    </svg>
  );
}

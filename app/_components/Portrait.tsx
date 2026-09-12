import { cv } from '@/lib/cv';

// Portrait card: the owner's photo when cv.portrait is set, otherwise a
// monogram on navy so the layout holds until the photo arrives.
export function Portrait() {
  const initials = cv.name
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2);
  return (
    <div className="aspect-[4/5] w-full overflow-hidden bg-ink">
      {cv.portrait ? (
        // eslint-disable-next-line @next/next/no-img-element -- static export; no image optimizer
        <img src={cv.portrait} alt={cv.name} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full flex items-center justify-center">
          <span className="font-serif text-7xl text-accent" style={{ fontWeight: 560 }}>
            {initials}
          </span>
        </div>
      )}
    </div>
  );
}

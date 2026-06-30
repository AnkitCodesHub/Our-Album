const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ---------- date helpers ----------

function daysBetween(startDateStr) {
  const start = new Date(startDateStr + "T00:00:00");
  const now = new Date();
  return Math.max(0, Math.floor((now - start) / (1000 * 60 * 60 * 24)));
}

function formatMonthYear(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function formatFullDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ---------- deterministic helpers ----------

// Rotation: stable sine hash — range ≈ -1.8 … +1.8 deg
function getRotation(index) {
  return Math.sin(index * 2.399) * 1.8;
}

// Frame treatment: 0 = classic print, 1 = gallery frame, 2 = torn edge
// Spread across 0→1→2→0→1→2… but with a small offset per index so clusters
// of same-treatment photos in the data don't all get the same style.
// We also guarantee no two consecutive photos share a treatment by checking
// the previous slot — if they'd collide we nudge by 1 (mod 3).
const _treatmentCache = {};
function getFrameTreatment(index) {
  if (_treatmentCache[index] !== undefined) return _treatmentCache[index];
  const base = (index * 7 + Math.floor(index / 3)) % 3; // spread with prime step
  const prev = index > 0 ? getFrameTreatment(index - 1) : -1;
  const t = base === prev ? (base + 1) % 3 : base;
  _treatmentCache[index] = t;
  return t;
}

// Paper-cut backing: every 4th photo, but NOT on torn-edge treatment (2)
function hasPaperCut(index, treatment) {
  return index % 4 === 0 && treatment !== 2;
}

// ---------- sort photos within each month group ----------
// Stable sort: photos with the same date keep their original relative order.
function sortedPhotos(photos) {
  const byMonth = {};
  const monthOrder = [];
  photos.forEach((p, i) => {
    const mk = p.date.slice(0, 7);
    if (!byMonth[mk]) {
      byMonth[mk] = [];
      monthOrder.push(mk);
    }
    byMonth[mk].push({ photo: p, origIndex: i });
  });

  const result = [];
  monthOrder.forEach((mk) => {
    const group = byMonth[mk].slice().sort((a, b) => {
      if (a.photo.date < b.photo.date) return -1;
      if (a.photo.date > b.photo.date) return 1;
      return a.origIndex - b.origIndex;
    });
    group.forEach((item) => result.push(item.photo));
  });
  return result;
}

// Walk the chronological photo list and turn it into render blocks:
// month dividers, featured "moment" cards (alternating sides), and
// dense grid strips for the everyday photos in between.
function buildTimelineBlocks(photos) {
  const sorted = sortedPhotos(photos);
  const blocks = [];
  let sideToggle = 0;
  let lastMonthKey = null;
  let currentRun = null;

  function flushRun() {
    if (currentRun && currentRun.items.length) blocks.push(currentRun);
    currentRun = null;
  }

  // Build a global index map so treatment/rotation stay tied to original index
  const globalIndex = new Map(photos.map((p, i) => [p.src, i]));

  sorted.forEach((photo) => {
    const monthKey = photo.date.slice(0, 7);
    if (monthKey !== lastMonthKey) {
      flushRun();
      blocks.push({ type: "month", key: monthKey, label: formatMonthYear(photo.date) });
      lastMonthKey = monthKey;
    }

    const gIdx = globalIndex.get(photo.src) ?? 0;

    if (photo.caption && photo.caption.trim()) {
      flushRun();
      const side = sideToggle % 2 === 0 ? "left" : "right";
      sideToggle++;
      blocks.push({ type: "moment", photo, index: gIdx, side });
    } else {
      if (!currentRun) currentRun = { type: "grid", items: [], startIndices: [] };
      currentRun.items.push(photo);
      currentRun.startIndices.push(gIdx);
    }
  });
  flushRun();
  return blocks;
}

// ---------- scroll reveal ----------

function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.unobserve(el);
        }
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, visible];
}

// ---------- pieces ----------

// PhotoFrame renders one of three distinct border treatments, plus optional
// paper-cut backing. Treatment and paper-cut are expressed as data-attributes
// so CSS handles all the visual logic cleanly.
function PhotoFrame({ src, alt, index, maxHeight, onClick, ariaLabel }) {
  const rotation  = getRotation(index);
  const treatment = getFrameTreatment(index);
  const paperCut  = hasPaperCut(index, treatment);

  return (
    <button
      className="photo-frame"
      data-treatment={treatment}
      data-papercut={paperCut ? "true" : "false"}
      style={{ "--rot": `${rotation}deg` }}
      onClick={onClick}
      aria-label={ariaLabel || "Open photo"}
    >
      <img
        src={`photos/${src}`}
        loading="lazy"
        alt={alt}
        style={maxHeight ? { maxHeight } : undefined}
      />
    </button>
  );
}

function MomentCard({ photo, side, flatIndex, onOpen }) {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} className={`moment moment-${side}${visible ? " is-visible" : ""}`}>
      <div className="moment-photo-wrap">
        <PhotoFrame
          src={photo.src}
          alt={photo.caption}
          index={flatIndex}
          maxHeight="520px"
          onClick={() => onOpen(flatIndex)}
          ariaLabel="Open photo"
        />
      </div>
      <div className="moment-text">
        <div className="moment-date-row">
          <span className="mono moment-date">{formatFullDate(photo.date)}</span>
          <span className="moment-date-rule" aria-hidden="true" />
        </div>
        <p className="moment-caption">{photo.caption}</p>
      </div>
    </div>
  );
}

const GRID_VISIBLE_DEFAULT = 6;

function PhotoGrid({ items, startIndices, onOpen }) {
  const [ref, visible] = useReveal();
  const [expanded, setExpanded] = useState(false);
  const hiddenCount = items.length - GRID_VISIBLE_DEFAULT;
  const showToggle = hiddenCount > 0;

  return (
    <div ref={ref} className={`grid-wrap${visible ? " is-visible" : ""}`}>
      <div className="grid-strip">
        {items.map((photo, i) => {
          const gIdx      = startIndices[i];
          const treatment = getFrameTreatment(gIdx);
          const paperCut  = hasPaperCut(gIdx, treatment);
          const isHidden  = !expanded && i >= GRID_VISIBLE_DEFAULT;
          return (
            <button
              key={photo.src + i}
              className={`grid-thumb${isHidden ? " grid-thumb--hidden" : ""}`}
              onClick={() => onOpen(gIdx)}
              aria-label="Open photo"
              tabIndex={isHidden ? -1 : 0}
              aria-hidden={isHidden}
            >
              <div
                className="grid-thumb-frame"
                data-treatment={treatment}
                data-papercut={paperCut ? "true" : "false"}
                style={{ "--rot": `${getRotation(gIdx)}deg` }}
              >
                <img src={`photos/${photo.src}`} loading="lazy" alt="A photo of us" />
              </div>
            </button>
          );
        })}
      </div>
      {showToggle && !expanded && (
        <button
          className="grid-more mono"
          onClick={() => setExpanded(true)}
        >
          View more · {hiddenCount}
        </button>
      )}
    </div>
  );
}

// Chapter divider: full-width 1px rule with centred month text sitting on top.
function ChapterDivider({ label }) {
  return (
    <div className="chapter-divider" role="separator" aria-label={label}>
      <div className="chapter-rule" aria-hidden="true" />
      <span className="mono chapter-label">{label}</span>
    </div>
  );
}

function Lightbox({ photos, index, onClose, onNav }) {
  const photo = photos[index];

  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onNav(1);
      if (e.key === "ArrowLeft") onNav(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, onNav]);

  if (!photo) return null;

  return (
    <div className="lightbox" onClick={onClose} role="dialog" aria-modal="true">
      <button className="lightbox-close" onClick={onClose} aria-label="Close">
        ×
      </button>
      <button
        className="lightbox-nav lightbox-prev"
        onClick={(e) => { e.stopPropagation(); onNav(-1); }}
        aria-label="Previous photo"
        disabled={index === 0}
      >
        ‹
      </button>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <img src={`photos/${photo.src}`} alt={photo.caption || "A photo of us"} />
        <div className="lightbox-meta">
          <span className="mono">{formatFullDate(photo.date)}</span>
          {photo.caption ? <span className="lightbox-caption">{photo.caption}</span> : null}
          <span className="mono lightbox-count">
            {index + 1} / {photos.length}
          </span>
        </div>
      </div>
      <button
        className="lightbox-nav lightbox-next"
        onClick={(e) => { e.stopPropagation(); onNav(1); }}
        aria-label="Next photo"
        disabled={index === photos.length - 1}
      >
        ›
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <p className="mono">no photos yet</p>
      <h2>Add your photos to get started</h2>
      <p>
        Drop your images into the <code>/photos</code> folder, then run{" "}
        <code>node generate-manifest.js</code> in this project to build the list automatically.
        Full instructions are in <code>README.md</code>.
      </p>
    </div>
  );
}

// ---------- app ----------

function App() {
  const config = window.ALBUM_CONFIG;
  const photos = window.ALBUM_PHOTOS || [];

  const [lightboxIndex, setLightboxIndex] = useState(null);
  const [days, setDays] = useState(() => daysBetween(config.startDate));

  useEffect(() => {
    document.title = `${config.nameOne} & ${config.nameTwo}`;
  }, [config]);

  useEffect(() => {
    const id = setInterval(() => setDays(daysBetween(config.startDate)), 60 * 60 * 1000);
    return () => clearInterval(id);
  }, [config.startDate]);

  const blocks = useMemo(() => buildTimelineBlocks(photos), [photos]);

  const openLightbox  = useCallback((i) => setLightboxIndex(i), []);
  const closeLightbox = useCallback(() => setLightboxIndex(null), []);
  const navLightbox   = useCallback(
    (delta) => {
      setLightboxIndex((prev) => {
        if (prev === null) return prev;
        const next = prev + delta;
        if (next < 0 || next >= photos.length) return prev;
        return next;
      });
    },
    [photos.length]
  );

  return (
    <div className="album">
      <header className="hero">
        <p className="mono hero-eyebrow">
          {photos.length} photograph{photos.length === 1 ? "" : "s"}, one story
        </p>
        <h1 className="hero-names">
          {config.nameOne} <span className="hero-amp">&amp;</span> {config.nameTwo}
        </h1>
        <p className="hero-tagline">{config.tagline}</p>
        <p className="mono hero-counter">day {days}</p>
        <div className="hero-scroll" aria-hidden="true">↓</div>
      </header>

      <main className="timeline">
        {photos.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="spine" aria-hidden="true" />
            {blocks.map((block, bi) => {
              if (block.type === "month") {
                return <ChapterDivider key={`m-${block.key}`} label={block.label} />;
              }
              if (block.type === "moment") {
                return (
                  <MomentCard
                    key={`mo-${block.index}`}
                    photo={block.photo}
                    side={block.side}
                    flatIndex={block.index}
                    onOpen={openLightbox}
                  />
                );
              }
              return (
                <PhotoGrid
                  key={`g-${bi}`}
                  items={block.items}
                  startIndices={block.startIndices}
                  onOpen={openLightbox}
                />
              );
            })}
          </>
        )}
      </main>

      {photos.length > 0 && (
        <footer className="closing">
          <p className="mono closing-eyebrow">day {days} and counting</p>
          <h2 className="closing-title">{config.closingTitle}</h2>
          <p className="closing-message">{config.closingMessage}</p>
        </footer>
      )}

      {lightboxIndex !== null && (
        <Lightbox photos={photos} index={lightboxIndex} onClose={closeLightbox} onNav={navLightbox} />
      )}
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(<App />);

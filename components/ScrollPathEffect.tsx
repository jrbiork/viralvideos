'use client';

import { useEffect, useRef } from 'react';

/**
 * A decorative gradient path that draws itself as the user scrolls down the
 * page, with a glowing comet head riding the tip of the line. No external
 * dependencies — matches the hand-rolled scroll handling used elsewhere on
 * the landing page. Hidden on small screens where the weaving line would
 * collide with the single-column layout.
 */
const VIEWBOX_WIDTH = 1000;
const VIEWBOX_HEIGHT = 4800;

// Six S-curve waves weaving down the full page height.
const PATH_D = `M500 0
   C 200 300, 800 500, 500 800
   C 200 1100, 800 1300, 500 1600
   C 200 1900, 800 2100, 500 2400
   C 200 2700, 800 2900, 500 3200
   C 200 3500, 800 3700, 500 4000
   C 200 4300, 800 4500, 500 4800`;

export default function ScrollPathEffect() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);
  const glowPathRef = useRef<SVGPathElement>(null);
  const headRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const path = pathRef.current;
    const glowPath = glowPathRef.current;
    const container = containerRef.current;
    const head = headRef.current;
    if (!path || !glowPath || !container || !head) return;

    const length = path.getTotalLength();
    for (const p of [path, glowPath]) {
      p.style.strokeDasharray = `${length}`;
      p.style.strokeDashoffset = `${length}`;
    }

    let ticking = false;

    const update = () => {
      ticking = false;
      const rect = container.getBoundingClientRect();
      const viewportHeight =
        window.innerHeight || document.documentElement.clientHeight;

      // Map how far the user has scrolled through the page (0 at the top,
      // 1 at the bottom) to the line's tip, with a small head start so the
      // glowing ball begins just below the sticky navbar on load instead
      // of partway down the page.
      const total = rect.height - viewportHeight;
      const scrollFrac =
        total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      const progress = 0.05 + scrollFrac * 0.95;

      const offset = length * (1 - progress);
      path.style.strokeDashoffset = `${offset}`;
      glowPath.style.strokeDashoffset = `${offset}`;

      // The comet head rides the tip of the drawn line. getPointAtLength
      // returns viewBox units, so scale to the container's rendered size
      // (the SVG is stretched the same way via preserveAspectRatio="none").
      const point = path.getPointAtLength(length * progress);
      const x = (point.x / VIEWBOX_WIDTH) * rect.width;
      const y = (point.y / VIEWBOX_HEIGHT) * rect.height;
      head.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      head.style.opacity = progress > 0 && progress < 1 ? '1' : '0';
    };

    const onScroll = () => {
      if (!ticking) {
        ticking = true;
        window.requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 z-0 hidden md:block"
      aria-hidden="true"
    >
      <svg
        className="h-full w-full"
        viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
        preserveAspectRatio="none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient
            id="scroll-path-gradient"
            x1="0"
            y1="0"
            x2="0"
            y2="1"
          >
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#3b82f6" />
          </linearGradient>
        </defs>
        {/* Dim static track the glowing line draws over */}
        <path
          d={PATH_D}
          stroke="url(#scroll-path-gradient)"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.2"
        />
        {/* Blurred wide stroke underneath = neon glow halo */}
        <path
          ref={glowPathRef}
          d={PATH_D}
          stroke="url(#scroll-path-gradient)"
          strokeWidth="14"
          strokeLinecap="round"
          opacity="0.6"
          style={{ filter: 'blur(6px)' }}
        />
        <path
          ref={pathRef}
          d={PATH_D}
          stroke="url(#scroll-path-gradient)"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.95"
        />
      </svg>
      {/* Glowing comet head that follows the tip of the drawn line */}
      <div
        ref={headRef}
        className="absolute left-0 top-0 h-5 w-5 rounded-full opacity-0 transition-opacity duration-200"
        style={{
          background:
            'radial-gradient(circle, #ffffff 0%, #c4b5fd 45%, rgba(59,130,246,0) 75%)',
          boxShadow:
            '0 0 12px 4px rgba(168,85,247,0.8), 0 0 30px 12px rgba(99,102,241,0.5)',
          willChange: 'transform',
        }}
      >
        <div
          className="absolute inset-0 animate-ping rounded-full"
          style={{
            background:
              'radial-gradient(circle, rgba(196,181,253,0.9) 0%, rgba(59,130,246,0) 70%)',
          }}
        />
      </div>
    </div>
  );
}

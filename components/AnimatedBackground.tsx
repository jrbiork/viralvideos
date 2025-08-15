export default function AnimatedBackground() {
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        {/* Base animated gradient */}
        <div className="absolute inset-0 animate-gradient bg-[radial-gradient(60%_80%_at_20%_10%,rgba(106,77,224,0.20),transparent_70%),radial-gradient(50%_60%_at_80%_0%,rgba(13,139,216,0.20),transparent_60%),linear-gradient(180deg,#0B0B2A_0%,#0A0A1C_60%,#080812_100%)]" />

        {/* Soft blobs */}
        <div className="blob absolute -top-24 -left-24 h-[38rem] w-[38rem] bg-[#6A4DE0] opacity-30" />
        <div className="blob animation-delay-2000 absolute top-1/3 -right-24 h-[32rem] w-[32rem] bg-[#0D8BD8] opacity-30" />
        <div className="blob animation-delay-4000 absolute -bottom-28 left-1/3 h-[28rem] w-[28rem] bg-[#6A4DE0] opacity-20" />

        {/* Subtle highlight pattern */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,.06)_0,transparent_60%)]" />
      </div>

      <style jsx global>{`
        .blob {
          border-radius: 40% 60% 60% 40% / 40% 60% 40% 60%;
          filter: blur(48px);
          animation: blob 18s ease-in-out infinite;
          will-change: transform;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }

        @keyframes blob {
          0% {
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
          }
          33% {
            transform: translate3d(20px, -10px, 0) rotate(15deg) scale(1.05);
          }
          66% {
            transform: translate3d(-10px, 25px, 0) rotate(-10deg) scale(0.97);
          }
          100% {
            transform: translate3d(0, 0, 0) rotate(0deg) scale(1);
          }
        }

        .animate-gradient {
          animation: gradient 16s ease-in-out infinite alternate;
          background-size: 200% 200%;
          will-change: background-position;
        }
        @keyframes gradient {
          0% {
            background-position: 0% 0%, 100% 0%, 50% 0%;
          }
          100% {
            background-position: 100% 60%, 0% 40%, 50% 100%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .blob,
          .animate-gradient {
            animation: none !important;
          }
        }
      `}</style>
    </>
  );
}

"use client";

import { useEffect, useRef } from "react";

export function ChondroBreederPreview() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reducedMotion.matches) {
      video.pause();
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          void video.play().catch(() => undefined);
        } else {
          video.pause();
        }
      },
      { threshold: 0.35 },
    );

    observer.observe(video);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="relative aspect-square overflow-hidden rounded-2xl border border-white/[.07] bg-black">
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="metadata"
        poster="/branding/arboreal-arcade-splash.webp"
        aria-label="Animated green tree python with a clutch of eggs"
        className="h-full w-full object-cover"
      >
        <source src="/branding/chondro-breeder-home.mp4" type="video/mp4" />
      </video>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/55 to-transparent" />
    </div>
  );
}

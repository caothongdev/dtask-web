import React from "react";
import { Navbar } from "@/components/landing/Navbar";
import { HeroSection } from "@/components/landing/HeroSection";
import { MockupPreview } from "@/components/landing/MockupPreview";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { InteractiveDemo } from "@/components/landing/InteractiveDemo";
import { TestimonialsSection } from "@/components/landing/TestimonialsSection";
import { CtaSection } from "@/components/landing/CtaSection";
import { Footer } from "@/components/landing/Footer";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 selection:bg-emerald-500 selection:text-white">
      <Navbar />
      <main>
        <HeroSection />
        <MockupPreview />
        <FeaturesSection />
        <InteractiveDemo />
        <TestimonialsSection />
        <CtaSection />
      </main>
      <Footer />
    </div>
  );
}

export default LandingPage;

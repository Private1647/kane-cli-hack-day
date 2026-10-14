import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import About from "@/components/About";
import Tracks from "@/components/Tracks";
import Schedule from "@/components/Schedule";
import Prizes from "@/components/Prizes";
import Faq from "@/components/Faq";
import Register from "@/components/Register";
import Footer from "@/components/Footer";

export default function Home() {
  return (
    <>
      <Navbar />
      <main>
        <Hero />
        <About />
        <Tracks />
        <Schedule />
        <Prizes />
        <Faq />
        <Register />
      </main>
      <Footer />
    </>
  );
}

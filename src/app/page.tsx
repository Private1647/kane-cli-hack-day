import Hero from "@/components/Hero";
import BootScreen from "@/components/BootScreen";
import NowNext from "@/components/home/NowNext";
import Setup from "@/components/home/Setup";
import Schedule from "@/components/home/Schedule";
import Challenge from "@/components/home/Challenge";
import Loop from "@/components/home/Loop";
import Prizes from "@/components/home/Prizes";
import Deliverables from "@/components/home/Deliverables";
import JudgingTeaser from "@/components/home/JudgingTeaser";
import Rules from "@/components/home/Rules";
import ResourcesGrid from "@/components/home/ResourcesGrid";
import HelpShare from "@/components/home/HelpShare";
import Closer from "@/components/home/Closer";
import Mentions from "@/components/home/Mentions";

// Folds follow an attendee's day: arrive and set up, know the plan, understand
// the brief and how Kane fits, see what's at stake, hand things in on time,
// then get help, share, and ship.
export default function Home() {
  return (
    <main>
      <Hero />
      <NowNext />
      <Setup />
      <Schedule />
      <Challenge />
      <Loop />
      <Prizes />
      <Deliverables />
      <JudgingTeaser />
      <Rules />
      <ResourcesGrid />
      <HelpShare />
      <Closer />
      <Mentions />
      <BootScreen />
    </main>
  );
}

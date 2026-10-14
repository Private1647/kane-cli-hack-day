export const hackathon = {
  name: "HackSprint 2026",
  year: 2026,
  tagline: "48 hours. One idea. Ship it.",
  description:
    "A 48-hour hackathon for builders, designers, and dreamers. Form a team, pick a track, and ship something real by Sunday night.",
  // ISO date for the countdown. Change to your actual kickoff.
  startDate: "2026-11-14T09:00:00+05:30",
  endDate: "2026-11-16T09:00:00+05:30",
  dateLabel: "Nov 14 – 16, 2026",
  location: "Bengaluru, India · In-person + Online",
  registerUrl: "#register",
  stats: [
    { label: "Hours", value: "48" },
    { label: "Prize pool", value: "₹5L+" },
    { label: "Tracks", value: "4" },
    { label: "Team size", value: "1–4" },
  ],
};

export const tracks = [
  {
    title: "AI & Agents",
    description:
      "Build autonomous agents, copilots, or LLM-powered tools that solve a real workflow problem.",
    icon: "🤖",
  },
  {
    title: "Developer Tools",
    description:
      "CLIs, testing tools, observability, or anything that makes other engineers faster.",
    icon: "🛠️",
  },
  {
    title: "Open Innovation",
    description:
      "No constraints. Bring any idea, in any domain, and show us why it matters.",
    icon: "💡",
  },
  {
    title: "Social Impact",
    description:
      "Projects for education, health, climate, or accessibility that improve lives.",
    icon: "🌍",
  },
];

export const schedule = [
  {
    day: "Day 1 · Fri, Nov 14",
    items: [
      { time: "09:00", title: "Check-in & breakfast" },
      { time: "10:00", title: "Opening keynote & track reveal" },
      { time: "11:00", title: "Team formation" },
      { time: "12:00", title: "Hacking begins" },
      { time: "18:00", title: "Workshop: Shipping an AI agent in 1 hour" },
    ],
  },
  {
    day: "Day 2 · Sat, Nov 15",
    items: [
      { time: "09:00", title: "Breakfast" },
      { time: "11:00", title: "Mentor office hours" },
      { time: "15:00", title: "Mid-point checkpoint" },
      { time: "20:00", title: "Late-night snacks & games" },
    ],
  },
  {
    day: "Day 3 · Sun, Nov 16",
    items: [
      { time: "09:00", title: "Hacking ends · submissions close" },
      { time: "10:00", title: "Demo round" },
      { time: "13:00", title: "Finalist pitches" },
      { time: "15:00", title: "Awards & closing" },
    ],
  },
];

export const prizes = [
  { place: "1st Place", amount: "₹2,00,000", perks: "Plus mentorship and incubation intro" },
  { place: "2nd Place", amount: "₹1,25,000", perks: "Plus cloud credits for a year" },
  { place: "3rd Place", amount: "₹75,000", perks: "Plus premium hardware kits" },
  { place: "Track Winners", amount: "₹25,000 each", perks: "One per track" },
];

export const faqs = [
  {
    q: "Who can participate?",
    a: "Anyone 18+ — students, professionals, and indie hackers. Teams can be 1 to 4 people.",
  },
  {
    q: "Is it free?",
    a: "Yes. Registration, meals, swag, and the venue are fully covered.",
  },
  {
    q: "Can I start building before the event?",
    a: "No. All code must be written during the 48 hours, but you can use open-source libraries and public APIs.",
  },
  {
    q: "What should I bring?",
    a: "Your laptop, charger, a government ID, and whatever keeps you going at 3 AM.",
  },
  {
    q: "How are projects judged?",
    a: "Technical difficulty, originality, impact, and the quality of your demo. Each is weighted equally.",
  },
];

export const sponsors = ["Acme Cloud", "Nimbus AI", "Orbit Labs", "Vertex Ventures", "Quanta"];

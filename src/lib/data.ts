// Dummy data for the dashboard. Replace with real API/DB calls later.

export type CreditPoint = { date: string; mobile: number; desktop: number };

// Daily credit usage (area chart). ~30 days of synthetic, wavy data.
export const creditUsageDaily: CreditPoint[] = Array.from(
  { length: 30 },
  (_, i) => {
    const day = i + 1;
    const wave = Math.sin(i / 2.4) * 1600 + Math.cos(i / 1.3) * 700;
    const desktop = Math.round(3200 + wave + (i % 5) * 180);
    const mobile = Math.round(1700 + Math.sin(i / 3) * 900 + (i % 4) * 120);
    return {
      date: `Jun ${day}`,
      desktop: Math.max(800, desktop),
      mobile: Math.max(500, mobile),
    };
  },
);

export type MonthlyUsage = { month: string; current: number; previous: number };

// Monthly credit usage (bar chart).
export const creditUsageMonthly: MonthlyUsage[] = [
  { month: "Jan", current: 7400, previous: 4200 },
  { month: "Feb", current: 11200, previous: 8100 },
  { month: "Mar", current: 9600, previous: 5400 },
  { month: "Apr", current: 4100, previous: 7800 },
  { month: "May", current: 8800, previous: 5600 },
  { month: "Jun", current: 9100, previous: 6300 },
];

export type UserRow = {
  id: string;
  email: string;
  provider: "Google" | "Email" | "GitHub";
  created: string;
  lastSignIn: string;
  uid: string;
};

export const users: UserRow[] = [
  {
    id: "1",
    email: "hello@horizon-ui.com",
    provider: "Google",
    created: "06 Nov, 2023 11:33",
    lastSignIn: "06 Nov, 2023 11:33",
    uid: "f3f42fc419-ce32-49fc-92df-a1b2c3",
  },
  {
    id: "2",
    email: "thomas@gmail.com",
    provider: "Google",
    created: "06 Nov, 2023 11:29",
    lastSignIn: "06 Nov, 2023 11:29",
    uid: "a91b2c8d04-7e21-4a0b-bc31-d4e5f6",
  },
  {
    id: "3",
    email: "markwilliam@hotmail.com",
    provider: "Email",
    created: "06 Nov, 2023 11:21",
    lastSignIn: "06 Nov, 2023 11:21",
    uid: "7c0de1f2a3-9b84-4c12-ae45-061728",
  },
  {
    id: "4",
    email: "examplejosh@mail.com",
    provider: "Google",
    created: "06 Nov, 2023 11:18",
    lastSignIn: "06 Nov, 2023 11:18",
    uid: "2d3e4f5061-a72b-4d93-8c14-95a6b7",
  },
  {
    id: "5",
    email: "sarah.connor@skynet.io",
    provider: "GitHub",
    created: "05 Nov, 2023 19:02",
    lastSignIn: "06 Nov, 2023 08:47",
    uid: "9f8e7d6c5b-4a39-4218-90fe-1c2d3e",
  },
  {
    id: "6",
    email: "dev.adela@horizon-ui.com",
    provider: "Email",
    created: "05 Nov, 2023 14:55",
    lastSignIn: "06 Nov, 2023 10:11",
    uid: "b1c2d3e4f5-6071-4839-a2bc-4d5e6f",
  },
];

export const stats = {
  totalCreditsUsed: 46823,
  totalCreditsUsedDelta: 20.4,
  totalUsers: 67284,
  totalUsersDelta: 12.3,
  creditsAvailable: 100000,
  currentPlan: "Expert+",
};

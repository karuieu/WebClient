"use client";

import { motion } from "motion/react";

const BAT_PATH =
  "M16 5.2 17 3.4 17.6 5.6C21 3.2 26 1.6 31 3Q28.6 5.4 28 8.2Q26 6.8 24 8.6Q22 7.6 20.2 9.6Q18 10.4 16 12.4Q14 10.4 11.8 9.6Q10 7.6 8 8.6Q6 6.8 4 8.2Q3.4 5.4 1 3C6 1.6 11 3.2 14.4 5.6L15 3.4Z";

const FLIGHT = 0.7;

const BATS = [
  { top: "14%", width: "w-6", delay: 0.1, rise: -56 },
  { top: "22%", width: "w-4", delay: 0.2, rise: -40 },
  { top: "18%", width: "w-5", delay: 0.28, rise: -64 },
];

// A few bats dart across once each time incognito is switched on, too fast and soft to make out. The caller leaves them out for reduced motion.
export function HalloweenBats() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {BATS.map((bat) => (
        <motion.div
          key={bat.top}
          className="absolute inset-x-0"
          style={{ top: bat.top }}
          initial={{ x: "100%", y: 0, opacity: 0 }}
          animate={{ x: "-12%", y: bat.rise, opacity: [0, 0.8, 0.8, 0] }}
          transition={{ duration: FLIGHT, delay: bat.delay, ease: "easeInOut" }}
        >
          <svg viewBox="0 0 32 16" className={`${bat.width} text-halloween blur-[1.5px]`}>
            <path d={BAT_PATH} fill="currentColor" />
          </svg>
        </motion.div>
      ))}
    </div>
  );
}

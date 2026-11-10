/*
  Flip caption bank
  -----------------
  {b} = the era's "becoming" phrase, e.g. "doesn't smoke"
  {n} = the era's flip count
  {t} = flips in this era today

  Rules: short, "I don't" not "I can't", no shame words,
  never claim more than the count supports.
*/

const PROOF = {
  // Stage 0: Practicing (1–9 flips)
  practicing: [
    "You're practicing this. It's working.",
    "First steps count the most.",
    "That's {n}. Every one is real.",
    "One no at a time.",
    "You chose differently. That's the whole skill.",
    "Practice, not perfection.",
    "Small no. Real change.",
    "Learning to be someone who {b}.",
    "The new pattern just got a little stronger.",
    "{n} times you picked the future.",
    "Noticed it. Chose. Flipped.",
    "This is how it starts.",
    "You just proved you can.",
    "The urge passed. You stayed.",
    "Keep practicing. It adds up."
  ],

  // Stage 1: Becoming (10–49 flips)
  becoming: [
    "I'm becoming someone who {b}.",
    "Each no makes the next one easier.",
    "{n} flips. The new you is taking shape.",
    "Saying no is becoming a habit of its own.",
    "You're getting good at this.",
    "{n} nos. That's not an accident.",
    "Someone who {b}. That's who showed up.",
    "The old pattern is getting quieter.",
    "Building proof, one flip at a time.",
    "Becoming, not pretending.",
    "Another vote for the new you.",
    "Steady. That's how change sticks.",
    "{n} times you trusted yourself.",
    "The urge asked. You answered.",
    "On a roll. Keep rolling."
  ],

  // Stage 2: Proving (50–149 flips)
  proving: [
    "{n} times. That's a pattern, not luck.",
    "The old habit is losing its vote.",
    "You keep proving it. {n} times now.",
    "{n} flips. The evidence is piling up.",
    "Someone who {b}? The numbers agree.",
    "You've done this {n} times. You know how.",
    "Pattern breaker. Earned, not given.",
    "Hard to argue with {n}.",
    "The old you would be surprised.",
    "Consistency looks good on you.",
    "This is getting normal. That's the point.",
    "Every flip is a receipt.",
    "{n} decisions, all yours.",
    "The urge shows up. So do you.",
    "Proof, again."
  ],

  // Stage 3: Being (150+ flips)
  being: [
    "I'm someone who {b}. {n} flips say so.",
    "This is just who I am now.",
    "{n}. That's not willpower anymore. That's you.",
    "Mythic. And still counting.",
    "You don't wonder anymore. You know.",
    "Someone who {b}. Simply true.",
    "{n} flips, written in your own history.",
    "Quietly, completely, you.",
    "The old pattern is a story you used to tell.",
    "This is normal for you now.",
    "Still choosing. Still you.",
    "{n} times. Nobody can take that.",
    "You are the proof.",
    "Steady as ever.",
    "Another flip. Of course."
  ]
};

// Situational lines, mixed in now and then
const CONTEXT = {
  firstFlip: "First flip. The board is open.",
  comeback: "Back on the board.",
  busyDay: [
    "{t} today. You're holding the line.",
    "That's {t} today. Still choosing."
  ],
  lateNight: [
    "Late-night no. Those are the hard ones.",
    "Even at this hour, you chose."
  ]
};

// Replies after logging a Delay
const DELAY_REPLIES = [
  "One slip doesn't erase {n} nos. Every one still counts.",
  "Delayed, not cancelled. Your {n} flips are right where you left them.",
  "A slip is information, not a verdict.",
  "You told the truth about it. That takes strength too.",
  "{n} flips are still yours. The next one starts now.",
  "Slips happen on most paths. What you do next matters more.",
  "You noticed and wrote it down. That's already part of the comeback.",
  "Be as kind to yourself as you'd be to a friend.",
  "Nothing reset. Nothing lost. Just a delay.",
  "The board is still open. So are you."
];

// Used when a Delay is logged before the first flip
const DELAY_REPLIES_ZERO = [
  "Nothing reset. The board is still open.",
  "A slip is information, not a verdict. Your first flip is still ahead.",
  "Be as kind to yourself as you'd be to a friend."
];

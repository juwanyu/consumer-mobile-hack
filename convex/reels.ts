import library from "../shared/assetLibrary.json";

export type SlotId = "master" | "caster";
export type BeatCharacter = { slot: SlotId | `npc:${string}`; mark: string; action: string };
export type Beat = {
  location: string;
  fx: string | string[];
  camera: { mark: string; move: string };
  duration: number;
  characters: BeatCharacter[];
  hud: { label: string; value: string }[];
  caption: string;
  narration: string;
};
export type ReelTemplate = {
  id: string;
  label: string;
  emoji: string;
  genre: string;
  title: string;
  logline: string;
  voice: string;
  voiceSpeed: number;
  slots: { id: SlotId; role: string; required: boolean; outfit?: string }[];
  beats: Beat[];
};

export const REEL_TEMPLATES: Record<string, ReelTemplate> = {
  fate: {
    id: "fate",
    label: "Fate/Ship Night",
    emoji: "⚔️",
    genre: "fate",
    title: "FATE/SHIP NIGHT",
    logline: "Defend the Castle · powered by Capy",
    voice: "onyx",
    voiceSpeed: 1.2,
    slots: [
      {
        id: "master",
        role: "Saber",
        required: true,
        outfit: "saber"
      },
      {
        id: "caster",
        role: "Squire",
        required: false
      }
    ],
    beats: [
      {
        location: "yc_hq",
        fx: [
          "flash"
        ],
        camera: {
          mark: "wide",
          move: "push_in"
        },
        duration: 2.6,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "thumbs_up"
          },
          {
            slot: "caster",
            mark: "right",
            action: "film"
          }
        ],
        hud: [
          {
            label: "CAPY AGENTS",
            value: "8"
          }
        ],
        caption: "Demo Day. YC HQ.",
        narration: "Demo Day at YC. {master} walks in, backed by Capy."
      },
      {
        location: "capy_castle",
        fx: [
          "army",
          "speed_lines"
        ],
        camera: {
          mark: "wide",
          move: "dolly_out"
        },
        duration: 2.8,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "point"
          }
        ],
        hud: [
          {
            label: "YC FOUNDERS",
            value: "1000"
          }
        ],
        caption: "Then the founders came.",
        narration: "Then a thousand YC founders stormed the castle."
      },
      {
        location: "capy_castle",
        fx: [
          "magic_circle",
          "flash",
          "embers"
        ],
        camera: {
          mark: "low_angle",
          move: "dolly_in"
        },
        duration: 2.6,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "summon"
          }
        ],
        hud: [
          {
            label: "YC FOUNDERS",
            value: "1000"
          }
        ],
        caption: "He doesn't run. He suits up.",
        narration: "He doesn't run. He suits up."
      },
      {
        location: "castle_wall",
        fx: [
          "army",
          "embers"
        ],
        camera: {
          mark: "medium",
          move: "orbit"
        },
        duration: 2.4,
        characters: [
          {
            slot: "caster",
            mark: "center",
            action: "banner"
          }
        ],
        hud: [
          {
            label: "YC FOUNDERS",
            value: "1000"
          }
        ],
        caption: "{caster}. His squire. Rolling.",
        narration: "{caster}, his squire, raises the banner."
      },
      {
        location: "capy_castle",
        fx: [
          "army",
          "speed_lines",
          "sparkles"
        ],
        camera: {
          mark: "medium",
          move: "shake"
        },
        duration: 2.6,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "charge"
          }
        ],
        hud: [
          {
            label: "YC FOUNDERS",
            value: "420"
          }
        ],
        caption: "Pitch decks. Term sheets. CUT.",
        narration: "Pitch decks. Term sheets. Growth hacks. Cut."
      },
      {
        location: "capy_castle",
        fx: [
          "speed_lines",
          "embers"
        ],
        camera: {
          mark: "closeup",
          move: "push_in"
        },
        duration: 2.2,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "block"
          }
        ],
        hud: [
          {
            label: "YC FOUNDERS",
            value: "88"
          }
        ],
        caption: "Nobody takes Capy.",
        narration: "Nobody takes the castle."
      },
      {
        location: "castle_wall",
        fx: [
          "army",
          "excalibur",
          "shockwave",
          "army_fall"
        ],
        camera: {
          mark: "low_angle",
          move: "shake"
        },
        duration: 3.2,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "raise_sword"
          },
          {
            slot: "caster",
            mark: "right",
            action: "film"
          }
        ],
        hud: [
          {
            label: "YC FOUNDERS",
            value: "0"
          }
        ],
        caption: "EXCALIBUR!",
        narration: "Ex... CALIBUR!"
      },
      {
        location: "castle_wall",
        fx: [
          "embers",
          "sparkles"
        ],
        camera: {
          mark: "wide",
          move: "orbit"
        },
        duration: 2.8,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "celebrate"
          },
          {
            slot: "caster",
            mark: "right",
            action: "banner"
          }
        ],
        hud: [
          {
            label: "CASTLE CAPY",
            value: "STANDING"
          }
        ],
        caption: "The castle stands.",
        narration: "The castle stands. Capy ships."
      }
    ]
  },
  mtb: {
    id: "mtb",
    label: "Send It (MTB)",
    emoji: "🚵",
    genre: "mtb",
    title: "SEND IT",
    logline: "A Revyl reel · powered by Capy",
    voice: "onyx",
    voiceSpeed: 1.2,
    slots: [
      {
        id: "master",
        role: "Revyl co-founder",
        required: true,
        outfit: "mtb"
      }
    ],
    beats: [
      {
        location: "mountain_trail",
        fx: [
          "dust"
        ],
        camera: {
          mark: "wide",
          move: "dolly_in"
        },
        duration: 2.6,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "bike_ride"
          }
        ],
        hud: [
          {
            label: "SPEED",
            value: "32"
          }
        ],
        caption: "Top of the mountain.",
        narration: "Top of the trail. {master}, co-founder of Revyl, drops in."
      },
      {
        location: "mountain_trail",
        fx: [
          "speed_lines",
          "dust"
        ],
        camera: {
          mark: "medium",
          move: "pan"
        },
        duration: 2.4,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "bike_ride"
          }
        ],
        hud: [
          {
            label: "SPEED",
            value: "58"
          }
        ],
        caption: "No brakes.",
        narration: "No brakes. Every turn tested before it ships."
      },
      {
        location: "mountain_trail",
        fx: [
          "dust"
        ],
        camera: {
          mark: "closeup",
          move: "push_in"
        },
        duration: 2.2,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "rock_on"
          }
        ],
        hud: [
          {
            label: "BUGS FOUND",
            value: "0"
          }
        ],
        caption: "Tested by Revyl. 🤘",
        narration: "Every jump, tested by Revyl."
      },
      {
        location: "mountain_trail",
        fx: [
          "speed_lines",
          "dust"
        ],
        camera: {
          mark: "low_angle",
          move: "dolly_in"
        },
        duration: 2.2,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "bike_jump"
          }
        ],
        hud: [
          {
            label: "SPEED",
            value: "71"
          }
        ],
        caption: "SEND IT.",
        narration: "Send it."
      },
      {
        location: "mountain_trail",
        fx: [
          "slowmo",
          "sparkles"
        ],
        camera: {
          mark: "wide",
          move: "orbit"
        },
        duration: 3,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "bike_jump"
          }
        ],
        hud: [
          {
            label: "AIR TIME",
            value: "2.4"
          }
        ],
        caption: "Slow it down…",
        narration: "Slow it down."
      },
      {
        location: "mountain_trail",
        fx: [
          "flash",
          "dust"
        ],
        camera: {
          mark: "wide",
          move: "shake"
        },
        duration: 2.8,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "celebrate"
          }
        ],
        hud: [
          {
            label: "LANDED",
            value: "1"
          }
        ],
        caption: "Stuck the landing.",
        narration: "Stuck it. Ship it."
      }
    ]
  },
  karate: {
    id: "karate",
    label: "Wax On (Karate)",
    emoji: "🥋",
    genre: "karate",
    title: "WAX ON",
    logline: "The new karate kid · presented by Whop",
    voice: "onyx",
    voiceSpeed: 1.2,
    slots: [
      {
        id: "master",
        role: "the new Karate Kid · presented by Whop",
        required: true,
        outfit: "karate"
      }
    ],
    beats: [
      {
        location: "dojo",
        fx: [
          "sparkles"
        ],
        camera: {
          mark: "wide",
          move: "dolly_in"
        },
        duration: 2.6,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "wax_on"
          }
        ],
        hud: [
          {
            label: "REPS",
            value: "100"
          }
        ],
        caption: "Wax on.",
        narration: "Every legend starts with chores. {master}, from Whop. Wax on."
      },
      {
        location: "dojo",
        fx: [
          "speed_lines"
        ],
        camera: {
          mark: "medium",
          move: "pan"
        },
        duration: 2.2,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "wax_on"
          }
        ],
        hud: [
          {
            label: "REPS",
            value: "1000"
          }
        ],
        caption: "Wax off.",
        narration: "Wax off. A thousand times."
      },
      {
        location: "tournament_arena",
        fx: [
          "flash",
          "crowd"
        ],
        camera: {
          mark: "wide",
          move: "orbit"
        },
        duration: 2.4,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "bow"
          }
        ],
        hud: [
          {
            label: "CROWD",
            value: "5000"
          }
        ],
        caption: "Tournament night.",
        narration: "Tournament night. Five thousand screaming fans."
      },
      {
        location: "tournament_arena",
        fx: [
          "crowd"
        ],
        camera: {
          mark: "closeup",
          move: "push_in"
        },
        duration: 2.2,
        characters: [
          {
            slot: "npc:rival",
            mark: "center",
            action: "taunt"
          }
        ],
        hud: [
          {
            label: "CHAMP RECORD",
            value: "99"
          }
        ],
        caption: "The undefeated champ.",
        narration: "Across the mat, the undefeated champ."
      },
      {
        location: "tournament_arena",
        fx: [
          "slowmo",
          "sparkles",
          "crowd"
        ],
        camera: {
          mark: "low_angle",
          move: "orbit"
        },
        duration: 3,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "crane_kick"
          },
          {
            slot: "npc:rival",
            mark: "left",
            action: "fight_stance"
          }
        ],
        hud: [
          {
            label: "POINTS",
            value: "1"
          }
        ],
        caption: "One point left…",
        narration: "One point left. He lifts one leg."
      },
      {
        location: "tournament_arena",
        fx: [
          "flash",
          "speed_lines",
          "shockwave"
        ],
        camera: {
          mark: "medium",
          move: "shake"
        },
        duration: 2,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "crane_kick"
          },
          {
            slot: "npc:rival",
            mark: "left",
            action: "fall"
          }
        ],
        hud: [
          {
            label: "POINTS",
            value: "2"
          }
        ],
        caption: "HI-YAH!",
        narration: "Hi-yah!"
      },
      {
        location: "tournament_arena",
        fx: [
          "sparkles",
          "crowd",
          "flash"
        ],
        camera: {
          mark: "wide",
          move: "orbit"
        },
        duration: 2.8,
        characters: [
          {
            slot: "master",
            mark: "center",
            action: "trophy"
          }
        ],
        hud: [
          {
            label: "CHAMPION",
            value: "1"
          }
        ],
        caption: "Champion.",
        narration: "Champion. Presented by Whop."
      }
    ]
  }
};

export const NPCS = library.npcs;

export function fillNames(text: string, names: Partial<Record<SlotId, string>>) {
  return text.replace(/\{(master|caster)\}/g, (_, slot: SlotId) => names[slot] ?? "");
}

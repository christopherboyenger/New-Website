/**
 * Starter templates. Names for the UGC set follow the onboarding capture (B05);
 * all instructions are original to this product. Templates declare their
 * compatible format explicitly — a format change never silently converts a
 * template (DEC-009). No example media ships until licensed assets exist.
 */
import type { ContentFormat, PlaybookContent } from "./playbook-content";

export interface PlaybookTemplate {
  id: string;
  name: string;
  format: ContentFormat;
  summary: string;
  content: PlaybookContent;
  descriptions: string[];
  hashtags: string[];
}

const scene = (id: string, name: string, instructions: string, textOptions: string[] = []) => ({ id, name, instructions, textOptions });

export const playbookTemplates: PlaybookTemplate[] = [
  {
    id: "ugc-greenscreen",
    name: "Greenscreen",
    format: "ugc",
    summary: "Creator reacts in front of your product page or app screen.",
    content: {
      kind: "ugc",
      generalInstructions: "Keep it natural and under 30 seconds. Talk to the camera like you are telling a friend about something you found.",
      references: [],
      scenes: [
        scene("s1", "Record the background", "Screen-record your product page or app for 10–15 seconds, scrolling slowly through the part you want to show."),
        scene("s2", "Film the greenscreen take", "Use the greenscreen effect with your recording as the background. Point at the screen and explain why it caught your attention.", [
          "I can't believe I didn't find this sooner",
          "Okay, this is actually useful",
        ]),
      ],
    },
    descriptions: ["Found something worth sharing 👀"],
    hashtags: [],
  },
  {
    id: "ugc-hook-demo",
    name: "Hook & demo",
    format: "ugc",
    summary: "A strong opening line followed by a quick product demo.",
    content: {
      kind: "ugc",
      generalInstructions: "Open with the hook in the first two seconds, then show the product in use. Natural light, no heavy editing.",
      references: [],
      scenes: [
        scene("s1", "Hook", "Look into the camera and say the hook. Keep it to one sentence.", ["Here's the thing nobody tells you about…", "Stop scrolling if you…"]),
        scene("s2", "Demo", "Show the product being used from start to finish. Narrate what you're doing."),
        scene("s3", "Verdict", "Give your honest one-line verdict to the camera."),
      ],
    },
    descriptions: ["Tried it so you don't have to."],
    hashtags: [],
  },
  {
    id: "ugc-talking-head",
    name: "Talking head",
    format: "ugc",
    summary: "Creator speaks directly to camera about their experience.",
    content: {
      kind: "ugc",
      generalInstructions: "Film in one continuous take if you can. Share a real experience in your own words.",
      references: [],
      scenes: [
        scene("s1", "Intro", "Introduce the problem you had in one or two sentences."),
        scene("s2", "Experience", "Explain how the product fit into your routine and what changed.", ["Week one vs. now", "What I wish I knew earlier"]),
      ],
    },
    descriptions: ["Honest thoughts after using it for a while."],
    hashtags: [],
  },
  {
    id: "ugc-skit",
    name: "Skit",
    format: "ugc",
    summary: "A short scripted scene with a relatable setup and payoff.",
    content: {
      kind: "ugc",
      generalInstructions: "Play both characters if you like. Keep the payoff about the product, and keep it light.",
      references: [],
      scenes: [
        scene("s1", "Setup", "Act out a relatable everyday problem."),
        scene("s2", "Payoff", "The product solves it. End on a reaction shot."),
      ],
    },
    descriptions: ["POV: you finally figured it out"],
    hashtags: [],
  },
  {
    id: "ugc-stitch",
    name: "Stitch",
    format: "ugc",
    summary: "Respond to a question or trend with your own take.",
    content: {
      kind: "ugc",
      generalInstructions: "Stitch or reply to a relevant question in your niche, then answer it with your experience of the product.",
      references: [],
      scenes: [
        scene("s1", "Prompt", "Show the question or clip you are responding to (2–3 seconds)."),
        scene("s2", "Answer", "Answer it to camera and show how the product helped."),
      ],
    },
    descriptions: ["Answering the question I get asked the most"],
    hashtags: [],
  },
  {
    id: "slideshow-listicle",
    name: "Listicle",
    format: "slideshow",
    summary: "A numbered list across slides, ending on your product.",
    content: {
      kind: "slideshow",
      generalInstructions: "Use clean, readable text. Each slide gets one image and one caption.",
      slides: [
        { id: "l1", imageOptions: [], captionOptions: ["3 things that changed my routine", "Things I'd tell my past self"] },
        { id: "l2", imageOptions: [], captionOptions: ["1. Small habits add up"] },
        { id: "l3", imageOptions: [], captionOptions: ["2. Use the right tools"] },
        { id: "l4", imageOptions: [], captionOptions: ["3. This one surprised me"] },
      ],
    },
    descriptions: ["Save this for later"],
    hashtags: [],
  },
  {
    id: "slideshow-before-after",
    name: "Before & after",
    format: "slideshow",
    summary: "Contrast the problem with the result.",
    content: {
      kind: "slideshow",
      generalInstructions: "First slide shows the problem, last slide shows the result.",
      slides: [
        { id: "b1", imageOptions: [], captionOptions: ["Before"] },
        { id: "b2", imageOptions: [], captionOptions: ["After"] },
      ],
    },
    descriptions: ["The difference is wild"],
    hashtags: [],
  },
];

export function templatesForFormat(format: ContentFormat): PlaybookTemplate[] {
  return playbookTemplates.filter((t) => t.format === format);
}

export function findTemplate(id: string | null | undefined): PlaybookTemplate | undefined {
  return id ? playbookTemplates.find((t) => t.id === id) : undefined;
}

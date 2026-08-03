/**
 * The instructions the model is actually given.
 *
 * There were no tests here at all, and that absence is exactly how the prompt
 * came to describe seven tools while twenty-six shipped. The capability list
 * had been written once, by hand, against the registry as it stood; every tool
 * added afterwards was sent to the provider as a schema the model was never
 * told to look for. Measured before this file existed: ZERO of the twenty-six
 * tools were named anywhere in the prompt.
 *
 * Nothing here asserts on wording. Prose is meant to be edited, and a test that
 * pins a sentence only teaches people to update the test. What is pinned is the
 * set of properties that cannot be allowed to rot: every tool is named, the
 * naming is derived from the registry rather than copied out of it, and the
 * rules that exist because of an observed failure are still present.
 */
import { describe, expect, it } from "vitest";
import { SYSTEM_PROMPT, cycleBudgetPrompt } from "../src/domain/ai-prompts.js";
import { AI_TOOL_GROUPS, aiTools } from "../src/domain/ai.js";

describe("the system prompt", () => {
  /*
   * The one that would have caught the original rot, and the reason this file
   * exists. It is written against the registry rather than a fixed number, so
   * adding a tool without giving it a group fails here rather than shipping a
   * capability the model is never told about.
   */
  it("names every tool in the registry", () => {
    const missing = aiTools.filter((tool) => !SYSTEM_PROMPT.includes(tool.name));

    expect(missing.map((tool) => tool.name)).toEqual([]);
  });

  it("names no tool that does not exist", () => {
    /*
     * The other direction, and not symmetric with the test above: a tool
     * removed from the registry but left in a hand-written list would send the
     * model looking for something that is no longer there, and it would be
     * told the tool does not exist only after trying to call it.
     */
    const known = new Set(aiTools.map((tool) => tool.name));
    const mentioned = SYSTEM_PROMPT.match(/\b[a-z]+_[a-z_]+\b/g) ?? [];

    const invented = [...new Set(mentioned)].filter(
      (candidate) => !known.has(candidate) && candidate.includes("_"),
    );

    expect(invented).toEqual([]);
  });

  it("groups the tools under every heading the registry uses", () => {
    for (const group of AI_TOOL_GROUPS) {
      const inGroup = aiTools.filter((tool) => tool.group === group);
      // A group nothing belongs to would print an empty heading at the model.
      expect(inGroup.length, `no tool is in the "${group}" group`).toBeGreaterThan(0);
    }
  });

  /*
   * Reproduced against Groq before this rule was written: asked to "mark the
   * raft slab task on Nile Tower as done", the model called update_task with
   * `taskId: 'the id of the raft slab task on Nile Tower'`. Groq validates
   * arguments itself and rejected the whole request with a 400, so the loop
   * never reached the "those arguments are not valid" message and the model
   * never got the chance to correct itself. On that provider the prompt is the
   * only defence, which is why this is pinned rather than left to wording.
   */
  it("tells the model that ids come from tools and must never be invented", () => {
    expect(SYSTEM_PROMPT).toMatch(/never invent an id/iu);
    expect(SYSTEM_PROMPT).toMatch(/uuid/iu);
    // And where to get one, or the rule states a prohibition with no remedy.
    expect(SYSTEM_PROMPT).toContain("search_tasks");
  });

  it("tells the model to ask rather than choose when a request is ambiguous", () => {
    expect(SYSTEM_PROMPT).toMatch(/ask/iu);
    expect(SYSTEM_PROMPT).toMatch(/do not pick one/iu);
  });

  it("still says a write is only ever a proposal", () => {
    // The safety property the whole approval design rests on. If the model
    // believes its writes take effect it will report them as done, which
    // teaches people the confirmation card is a formality.
    expect(SYSTEM_PROMPT).toMatch(/proposal|waiting for their approval/iu);
  });

  it("still refuses to answer from anything but tool output", () => {
    expect(SYSTEM_PROMPT).toMatch(/answer only from what the tools return/iu);
  });
});

describe("the cycle budget message", () => {
  it("says where the model is and how much is left", () => {
    const middle = cycleBudgetPrompt(3, 10);

    expect(middle).toContain("3");
    expect(middle).toContain("10");
  });

  it("withdraws tools on the last step and asks for an answer", () => {
    const last = cycleBudgetPrompt(10, 10);

    expect(last).toMatch(/last step/iu);
    expect(last).toMatch(/cannot call another tool/iu);
  });
});

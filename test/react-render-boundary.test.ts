import { describe, expect, it } from "vitest";
import { renderWithReactModuleEnvironment } from "../src/compiler/react-render-boundary";

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

describe.sequential("React render environment boundary", () => {
  it("serializes concurrent build-time renders and restores NODE_ENV", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "changed-after-react-loaded";
    let activeRenders = 0;
    let maximumActiveRenders = 0;

    try {
      const results = await Promise.all(
        [1, 2, 3].map((value) =>
          renderWithReactModuleEnvironment(async () => {
            activeRenders++;
            maximumActiveRenders = Math.max(maximumActiveRenders, activeRenders);
            await delay(5);
            activeRenders--;
            return value;
          }),
        ),
      );

      expect(results).toEqual([1, 2, 3]);
      expect(maximumActiveRenders).toBe(1);
      expect(process.env.NODE_ENV).toBe("changed-after-react-loaded");
    } finally {
      if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = originalNodeEnv;
    }
  });

  it("continues processing after a failed render", async () => {
    await expect(
      renderWithReactModuleEnvironment(async () => {
        throw new Error("render failed");
      }),
    ).rejects.toThrow("render failed");

    await expect(renderWithReactModuleEnvironment(async () => "next render")).resolves.toBe(
      "next render",
    );
  });
});

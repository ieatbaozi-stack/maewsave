import { describe, expect, it } from "vitest";
import enMessages from "../../../messages/en.json";
import thMessages from "../../../messages/th.json";

function collectLeafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];

  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === "object" && !Array.isArray(value)) {
      keys.push(...collectLeafKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys.sort();
}

function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((current, segment) => {
    if (current !== null && typeof current === "object") {
      return (current as Record<string, unknown>)[segment];
    }
    return undefined;
  }, obj);
}

describe("bilingual message dictionaries (th / en)", () => {
  it("contains identical translation keys in th.json and en.json", () => {
    const thKeys = collectLeafKeys(thMessages);
    const enKeys = collectLeafKeys(enMessages);

    expect(thKeys).toEqual(enKeys);
    expect(thKeys.length).toBeGreaterThan(0);
  });

  it("has non-empty strings for every translation key", () => {
    const keys = collectLeafKeys(enMessages);

    for (const key of keys) {
      const thVal = getValueByPath(thMessages, key);
      const enVal = getValueByPath(enMessages, key);

      expect(typeof thVal, `th.${key} must be a string`).toBe("string");
      expect(typeof enVal, `en.${key} must be a string`).toBe("string");
      expect((thVal as string).trim().length, `th.${key} must not be empty`).toBeGreaterThan(0);
      expect((enVal as string).trim().length, `en.${key} must not be empty`).toBeGreaterThan(0);
    }
  });
});

export function normalizeMessageContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && "text" in item) {
          return String((item as Record<string, unknown>).text);
        }
        return JSON.stringify(item);
      })
      .join("");
  }
  if (content && typeof content === "object" && "text" in content) {
    return String((content as Record<string, unknown>).text);
  }
  return JSON.stringify(content);
}